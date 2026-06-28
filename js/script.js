/* ================================
   Global State
   ================================ */
let savings = [];
let payments = [];
let balance = 0;
let savingTotal = 0;

const API_BASE = "http://127.0.0.1:8000"; // Change to your PC LAN IP for mobile testing, e.g. "http://192.168.1.42:8000"

/* ================================
   IndexedDB Setup
   ================================ */
let db;
const request = indexedDB.open("FinanceTrackerDB", 1);

request.onupgradeneeded = e => {
  db = e.target.result;
  if (!db.objectStoreNames.contains("savings")) {
    db.createObjectStore("savings", { keyPath: "id", autoIncrement: true });
  }
  if (!db.objectStoreNames.contains("payments")) {
    db.createObjectStore("payments", { keyPath: "id", autoIncrement: true });
  }
};
request.onsuccess = e => { db = e.target.result; console.log("IndexedDB ready"); };
request.onerror = e => { console.error("IndexedDB error:", e.target.errorCode); };

function saveToIndexedDB(storeName, entry) {
  if (!db) {
    console.warn("saveToIndexedDB: DB not ready");
    return;
  }
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).add({ ...entry, syncPending: true });
}

/* ================================
   UI Status Indicator
   ================================ */
function ensureStatusIndicator() {
  let el = document.getElementById("backendStatus");
  if (!el) {
    el = document.createElement("div");
    el.id = "backendStatus";
    el.style.cssText = "position:fixed;right:12px;bottom:12px;padding:8px 12px;background:#222;color:#fff;border-radius:6px;font-size:13px;z-index:9999;opacity:0.95";
    el.textContent = "Backend: unknown";
    document.body.appendChild(el);
  }
  return el;
}
function setBackendStatus(text, color) {
  const el = ensureStatusIndicator();
  el.textContent = `Backend: ${text}`;
  el.style.background = color || "#222";
}

/* ================================
   Robust Instrumented Sync Routine
   ================================ */
async function syncWithBackend() {
  if (!db) {
    console.log("syncWithBackend: IndexedDB not ready");
    setBackendStatus("DB not ready", "#f39c12");
    return;
  }

  // Check backend reachability
  let backendOnline = false;
  try {
    const res = await fetch(`${API_BASE}/ping`, { method: "GET", cache: "no-store" });
    backendOnline = res.ok;
  } catch (err) {
    backendOnline = false;
  }

  if (!backendOnline) {
    console.log("syncWithBackend: Backend offline, skipping sync");
    setBackendStatus("offline", "#c0392b");
    return;
  }

  console.log("syncWithBackend: Backend online, starting sync");
  setBackendStatus("online - syncing", "#27ae60");

  // Helper to sync one object store
  const syncStore = async (storeName, endpoint) => {
    try {
      // Step 1: collect pending entries in a readonly transaction
      const pending = await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const items = [];

        store.openCursor().onsuccess = e => {
          const cursor = e.target.result;
          if (cursor) {
            const entry = cursor.value;
            if (entry && entry.syncPending) {
              items.push({ key: cursor.primaryKey, entry });
            }
            cursor.continue();
          }
        };

        tx.oncomplete = () => resolve(items);
        tx.onerror = () => reject(tx.error || new Error("Cursor transaction error"));
      });

      console.log(`syncStore: ${storeName} found ${pending.length} pending entries`);

      // Step 2: process each pending entry outside any transaction
      for (const { key, entry } of pending) {
        try {
          // Normalize payload if needed (ensure backend expects this format)
          const payload = {
            date: entry.date,
            category: entry.category,
            amount: entry.amount
          };

          console.log(`syncStore: POSTing ${storeName} key=${key}`, payload);

          const resp = await fetch(`${API_BASE}/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

          // Log response body for debugging
          let bodyText = "";
          try { bodyText = await resp.text(); } catch (e) { bodyText = "<no body>"; }
          console.log(`syncStore: POST ${endpoint} status=${resp.status}`, bodyText);

          if (resp.ok) {
            // Step 3: mark entry as synced in a new write transaction and wait for completion
            await new Promise((resolveUpdate, rejectUpdate) => {
              const updateTx = db.transaction(storeName, "readwrite");
              const store = updateTx.objectStore(storeName);
              const updated = { ...entry, syncPending: false };
              if (key !== undefined && key !== null) updated.id = key;
              const req = store.put(updated);
              req.onsuccess = () => resolveUpdate();
              req.onerror = () => rejectUpdate(req.error || new Error("Update failed"));
            });
            console.log(`syncStore: Marked ${storeName} key=${key} synced`);
          } else {
            console.warn(`syncStore: Server rejected ${storeName} key=${key} status=${resp.status}`);
          }
        } catch (err) {
          console.error(`syncStore: Error syncing ${storeName} key=${key}`, err);
        }
      }
    } catch (err) {
      console.error(`syncStore: Failed for ${storeName}`, err);
    }
  };

  // Run both stores sequentially
  await syncStore("savings", "add-saving");
  await syncStore("payments", "add-payment");

  // Refresh UI from backend
  try {
    await updateSavingTable();
    await updateOverview();
  } catch (e) {
    console.warn("syncWithBackend: update UI failed", e);
  }

  console.log("syncWithBackend: sync pass complete");
  setBackendStatus("online - idle", "#2ecc71");
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
    if (!resp.ok) throw new Error("Backend offline or rejected");
  } catch (err) {
    console.error("Saving failed, storing offline:", err);
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
    if (!resp.ok) throw new Error("Backend offline or rejected");
  } catch (err) {
    console.error("Payment failed, storing offline:", err);
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
      const balEl = document.getElementById("balance");
      const saveEl = document.getElementById("saving");
      if (balEl) balEl.textContent = `₹${data.balance}`;
      if (saveEl) saveEl.textContent = `₹${data.saving}`;
    }
  } catch {
    const balEl = document.getElementById("balance");
    const saveEl = document.getElementById("saving");
    if (balEl) balEl.textContent = `₹${balance}`;
    if (saveEl) saveEl.textContent = `₹${savingTotal}`;
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
   Form Handlers and Initialization
   ================================ */
document.addEventListener("DOMContentLoaded", () => {
  initChart();
  updateOverview();
  updateSavingTable();
  ensureStatusIndicator();
  setBackendStatus("checking...", "#f39c12");

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

  // Run an initial sync attempt after DB is ready
  setTimeout(syncWithBackend, 1500);

  // Periodic sync check every 10 seconds
  setInterval(syncWithBackend, 10000);
});
