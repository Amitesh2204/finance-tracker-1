/* ================================
   Global State
   ================================ */
let savings = [];   // In-memory savings
let payments = [];  // In-memory payments
let balance = 0;
let savingTotal = 0;

// FastAPI base URL
const API_BASE = "http://127.0.0.1:8000";

/* ================================
   IndexedDB Setup
   ================================ */
let db;
const request = indexedDB.open("FinanceTrackerDB", 1);

request.onupgradeneeded = function (event) {
  db = event.target.result;
  db.createObjectStore("savings", { keyPath: "id", autoIncrement: true });
  db.createObjectStore("payments", { keyPath: "id", autoIncrement: true });
};

request.onsuccess = function (event) {
  db = event.target.result;
  console.log("IndexedDB ready");
};

request.onerror = function (event) {
  console.error("IndexedDB error:", event.target.errorCode);
};

/* ================================
   Utility: Save to IndexedDB
   ================================ */
function saveToIndexedDB(storeName, entry) {
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  store.add({ ...entry, syncPending: true });
}

/* ================================
   Sync Routine: Push cached entries to FastAPI
   ================================ */
async function syncWithBackend() {
  try {
    const res = await fetch(`${API_BASE}/ping`);
    if (!res.ok) return;

    // Sync savings
    const tx1 = db.transaction("savings", "readwrite");
    const store1 = tx1.objectStore("savings");
    store1.openCursor().onsuccess = async function (event) {
      const cursor = event.target.result;
      if (cursor) {
        const entry = cursor.value;
        if (entry.syncPending) {
          const resp = await fetch(`${API_BASE}/add-saving`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: entry.date,
              category: entry.category,
              amount: entry.amount
            })
          });
          if (resp.ok) {
            entry.syncPending = false;
            cursor.update(entry);
          }
        }
        cursor.continue();
      }
    };

    // Sync payments
    const tx2 = db.transaction("payments", "readwrite");
    const store2 = tx2.objectStore("payments");
    store2.openCursor().onsuccess = async function (event) {
      const cursor = event.target.result;
      if (cursor) {
        const entry = cursor.value;
        if (entry.syncPending) {
          const resp = await fetch(`${API_BASE}/add-payment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: entry.date,
              category: entry.category,
              amount: entry.amount
            })
          });
          if (resp.ok) {
            entry.syncPending = false;
            cursor.update(entry);
          }
        }
        cursor.continue();
      }
    };

    console.log("Sync complete");
  } catch {
    console.log("Backend offline, sync skipped");
  }
}

/* ================================
   Add Saving Entry
   ================================ */
async function addSaving(date, category, amount) {
  const monthYear = new Date(date).toLocaleString("default", { month: "long", year: "numeric" });
  const entry = { date, category, amount, monthYear };

  savings.push(entry);
  savingTotal = savings.reduce((sum, s) => sum + s.amount, 0);
  balance += amount;

  updateSavingTable();
  updateOverview();

  try {
    const resp = await fetch(`${API_BASE}/add-saving`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, category, amount })
    });
    if (!resp.ok) throw new Error("Backend offline");
  } catch {
    saveToIndexedDB("savings", entry);
  }
}

/* ================================
   Add Payment Entry
   ================================ */
async function addPayment(date, category, amount) {
  const entry = { date, category, amount };

  payments.push(entry);
  balance -= amount;

  updateOverview();

  try {
    const resp = await fetch(`${API_BASE}/add-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, category, amount })
    });
    if (!resp.ok) throw new Error("Backend offline");
  } catch {
    saveToIndexedDB("payments", entry);
  }
}

/* ================================
   Update Saving Table
   ================================ */
function updateSavingTable() {
  const tableBody = document.getElementById("savingTableBody");
  if (!tableBody) return;

  tableBody.innerHTML = "";
  savings.forEach(s => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${s.date}</td>
      <td>${s.monthYear}</td>
      <td>${s.category}</td>
      <td>₹${s.amount}</td>
    `;
    tableBody.appendChild(row);
  });
}

/* ================================
   Overview Page Update
   ================================ */
function updateOverview() {
  const balanceEl = document.getElementById("balance");
  const savingEl = document.getElementById("saving");
  if (balanceEl) balanceEl.textContent = `₹${balance}`;
  if (savingEl) savingEl.textContent = `₹${savingTotal}`;

  const activityList = document.getElementById("recentActivity");
  if (activityList) {
    activityList.innerHTML = "";
    payments.slice(-5).reverse().forEach(p => {
      const li = document.createElement("li");
      li.textContent = `${p.date} - ${p.category}: ₹${p.amount}`;
      activityList.appendChild(li);
    });
  }

  const lastTxEl = document.getElementById("lastTransaction");
  if (lastTxEl) {
    const last = payments[payments.length - 1];
    lastTxEl.textContent = last
      ? `${last.date} - ${last.category}: ₹${last.amount}`
      : "No transactions yet";
  }

  updateChart();
}

async function updateOverview() {
  try {
    const resp = await fetch(`${API_BASE}/overview`);
    if (resp.ok) {
      const data = await resp.json();
      document.getElementById("balance").textContent = `₹${data.balance}`;
      document.getElementById("saving").textContent = `₹${data.saving}`;
    }
  } catch {
    // fallback to local memory if backend offline
    const balanceEl = document.getElementById("balance");
    const savingEl = document.getElementById("saving");
    if (balanceEl) balanceEl.textContent = `₹${balance}`;
    if (savingEl) savingEl.textContent = `₹${savingTotal}`;
  }

  // keep your existing activity + last transaction logic
}


/* ================================
   Chart.js Financial Statistics
   ================================ */
let statsChart;
function initChart() {
  const ctx = document.getElementById("statsChart");
  if (!ctx) return;

  statsChart = new Chart(ctx.getContext("2d"), {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        { label: "Income", data: [], backgroundColor: "#2ecc71" },
        { label: "Expenses", data: [], backgroundColor: "#e74c3c" }
      ]
    },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });
}

function updateChart() {
  if (!statsChart) return;

  const months = {};
  savings.forEach(s => {
    const m = s.monthYear;
    months[m] = months[m] || { income: 0, expense: 0 };
    months[m].income += s.amount;
  });
  payments.forEach(p => {
    const m = new Date(p.date).toLocaleString("default", { month: "long", year: "numeric" });
    months[m] = months[m] || { income: 0, expense: 0 };
    months[m].expense += p.amount;
  });

  const labels = Object.keys(months).sort();
  statsChart.data.labels = labels;
  statsChart.data.datasets[0].data = labels.map(m => months[m].income);
  statsChart.data.datasets[1].data = labels.map(m => months[m].expense);
  statsChart.update();
}

/* ================================
   Form Handlers
   ================================ */
document.addEventListener("DOMContentLoaded", () => {
  initChart();
  updateOverview();

  const savingForm = document.getElementById("savingForm");
  if (savingForm) {
    savingForm.addEventListener("submit", e => {
      e.preventDefault();
      const date = document.getElementById("savingDate").value;
      const category = document.getElementById("savingCategory").value;
      const amount = parseFloat(document.getElementById("savingAmount").value);
      addSaving(date, category, amount);
      savingForm.reset();
    });
  }

  const paymentForm = document.getElementById("paymentForm");
  if (paymentForm) {
    paymentForm.addEventListener("submit", e => {
      e.preventDefault();
      const date = document.getElementById("paymentDate").value;
      const category = document.getElementById("paymentCategory").value;
      const amount = parseFloat(document.getElementById("paymentAmount").value);
      addPayment(date, category, amount);
      paymentForm.reset();
    });
  }

  const exportBtn = document.getElementById("exportExcel");
  if (exportBtn) {
    exportBtn.addEventListener("click", exportExcel);
  }

  // Try syncing cached entries every 10s
  setInterval(syncWithBackend, 10000);
});
