/* ================================
   Global State
   ================================ */
let savings = [];
let payments = [];
let balance = 0;
let savingTotal = 0;

const API_BASE = "http://127.0.0.1:8000";

/* ================================
   IndexedDB Setup
   ================================ */
let db;
const request = indexedDB.open("FinanceTrackerDB", 1);

request.onupgradeneeded = e => {
  db = e.target.result;
  db.createObjectStore("savings", { keyPath: "id", autoIncrement: true });
  db.createObjectStore("payments", { keyPath: "id", autoIncrement: true });
};
request.onsuccess = e => { db = e.target.result; console.log("IndexedDB ready"); };
request.onerror = e => { console.error("IndexedDB error:", e.target.errorCode); };

function saveToIndexedDB(storeName, entry) {
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).add({ ...entry, syncPending: true });
}

/* ================================
   Sync Routine (only runs if backend offline)
   ================================ */
async function syncWithBackend() {
  let backendOnline = false;
  try {
    const res = await fetch(`${API_BASE}/ping`);
    backendOnline = res.ok;
  } catch {
    backendOnline = false;
  }

  if (!backendOnline) {
    console.log("Backend offline, skipping sync");
    return;
  }

  console.log("Backend online, syncing pending entries...");

  const syncStore = async (storeName, endpoint) => {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const pending = [];

    store.openCursor().onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) {
        const entry = cursor.value;
        if (entry.syncPending) {
          pending.push({ key: cursor.primaryKey, entry });
        }
        cursor.continue();
      }
    };

    tx.oncomplete = async () => {
      for (const { key, entry } of pending) {
        try {
          const resp = await fetch(`${API_BASE}/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: entry.date,   // must be YYYY-MM-DD
              category: entry.category,
              amount: entry.amount
            })
          });
          const result = await resp.json();
          console.log("POST result:", result);

          if (resp.ok) {
            const updateTx = db.transaction(storeName, "readwrite");
            updateTx.objectStore(storeName).put({ ...entry, syncPending: false, id: key });
            updateTx.oncomplete = () => console.log(`Marked ${storeName} entry synced:`, entry);
          }
        } catch (err) {
          console.error(`Failed to sync ${storeName} entry:`, err);
        }
      }
      resolve();
    };

    tx.onerror = reject;
  });
};

  await syncStore("savings", "add-saving");
  await syncStore("payments", "add-payment");
}

/* ================================
   Add Saving Entry
   ================================ */
async function addSaving(date, category, amount) {
  const entry = { date, category, amount };

  try {
    const resp = await fetch(`${API_BASE}/add-saving`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    });
    console.log("Saving response:", resp.status);
    if (!resp.ok) throw new Error("Backend offline");
  } catch (err) {
    console.error("Saving failed:", err);
    // offline fallback → keep in local memory + IndexedDB
    const monthYear = new Date(date).toLocaleString("default", { month: "long", year: "numeric" });
    savings.push({ ...entry, monthYear });
    savingTotal = savings.reduce((sum, s) => sum + s.amount, 0);
    balance += amount;
    saveToIndexedDB("savings", entry);
  }

  updateSavingTable();
  updateOverview();
}

/* ================================
   Add Payment Entry
   ================================ */
async function addPayment(date, category, amount) {
  const entry = { date, category, amount };

  try {
    const resp = await fetch(`${API_BASE}/add-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    });
    console.log("Payment response:", resp.status);
    if (!resp.ok) throw new Error("Backend offline");
  } catch (err) {
    console.error("Payment failed:", err);
    payments.push(entry);
    balance -= amount;
    saveToIndexedDB("payments", entry);
  }

  updateOverview();
}

/* ================================
   Update Saving Table
   ================================ */
async function updateSavingTable() {
  const tableBody = document.getElementById("savingTableBody");
  if (!tableBody) return;

  try {
    const resp = await fetch(`${API_BASE}/savings`);
    if (resp.ok) {
      const data = await resp.json();
      tableBody.innerHTML = "";
      data.forEach(s => {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${s.date}</td><td>${s.category}</td><td>₹${s.amount}</td>`;
        tableBody.appendChild(row);
      });
    }
  } catch {
    // fallback to local memory
    tableBody.innerHTML = "";
    savings.forEach(s => {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${s.date}</td><td>${s.monthYear}</td><td>${s.category}</td><td>₹${s.amount}</td>`;
      tableBody.appendChild(row);
    });
  }
}

/* ================================
   Overview Page Update
   ================================ */
async function updateOverview() {
  try {
    const resp = await fetch(`${API_BASE}/overview`);
    if (resp.ok) {
      const data = await resp.json();
      document.getElementById("balance").textContent = `₹${data.balance}`;
      document.getElementById("saving").textContent = `₹${data.saving}`;
    }
  } catch {
    document.getElementById("balance").textContent = `₹${balance}`;
    document.getElementById("saving").textContent = `₹${savingTotal}`;
  }

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
    lastTxEl.textContent = last ? `${last.date} - ${last.category}: ₹${last.amount}` : "No transactions yet";
  }

  updateChart();
}

/* ================================
   Chart.js
   ================================ */
let statsChart;
function initChart() {
  const ctx = document.getElementById("statsChart");
  if (!ctx) return;
  statsChart = new Chart(ctx.getContext("2d"), {
    type: "bar",
    data: { labels: [], datasets: [
      { label: "Income", data: [], backgroundColor: "#2ecc71" },
      { label: "Expenses", data: [], backgroundColor: "#e74c3c" }
    ]},
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
  updateSavingTable();

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

  // Sync check every 10s (only runs if backend offline)
  setInterval(syncWithBackend, 10000);
});
