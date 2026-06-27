/* ================================
   Global State
   ================================ */
let savings = [];   // Saving entries
let payments = [];  // Payment entries
let balance = 0;
let savingTotal = 0;

/* ================================
   Merge Existing Excel Data
   ================================ */
// Allow user to upload an existing Excel file and merge with current memory
function importExcel(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });

    // Assume first sheet contains finance data
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);

    rows.forEach(row => {
      if (row.Type === "Saving") {
        savings.push({ date: row.Date, account: row.Account, amount: row.Amount });
      } else if (row.Type === "Payment") {
        payments.push({ date: row.Date, category: row.Category, amount: row.Amount });
      }
    });

    // Recalculate totals
    savingTotal = savings.reduce((sum, s) => sum + s.amount, 0);
    balance = savingTotal - payments.reduce((sum, p) => sum + p.amount, 0);

    updateOverview();
    alert("Excel data imported and merged!");
  };
  reader.readAsArrayBuffer(file);
}

/* ================================
   Export to Excel
   ================================ */
function exportExcel() {
  // Flatten savings + payments into one sheet
  const merged = [];

  savings.forEach(s => {
    merged.push({ Type: "Saving", Date: s.date, Account: s.account, Amount: s.amount });
  });
  payments.forEach(p => {
    merged.push({ Type: "Payment", Date: p.date, Category: p.category, Amount: p.amount });
  });

  const worksheet = XLSX.utils.json_to_sheet(merged);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Finance");
  XLSX.writeFile(workbook, "finance-tracker.xlsx");
}

/* ================================
   Overview Page Update
   ================================ */
function updateOverview() {
  const balanceEl = document.getElementById("balance");
  const savingEl = document.getElementById("saving");
  if (balanceEl) balanceEl.textContent = `₹${balance}`;
  if (savingEl) savingEl.textContent = `₹${savingTotal}`;

  // Recent Activity (last 5 payments)
  const activityList = document.getElementById("recentActivity");
  if (activityList) {
    activityList.innerHTML = "";
    payments.slice(-5).reverse().forEach(p => {
      const li = document.createElement("li");
      li.textContent = `${p.date} - ${p.category}: ₹${p.amount}`;
      activityList.appendChild(li);
    });
  }

  // Last Transaction
  const lastTxEl = document.getElementById("lastTransaction");
  if (lastTxEl) {
    const last = payments[payments.length - 1];
    lastTxEl.textContent = last
      ? `${last.date} - ${last.category}: ₹${last.amount}`
      : "No transactions yet";
  }

  updateChart();
}

/* ================================
   Add Saving Entry
   ================================ */
function addSaving(date, account, amount) {
  savings.push({ date, account, amount });
  savingTotal = savings.reduce((sum, s) => sum + s.amount, 0);
  balance += amount;
  updateOverview();
}

/* ================================
   Add Payment Entry
   ================================ */
function addPayment(date, category, amount) {
  payments.push({ date, category, amount });
  balance -= amount;
  updateOverview();
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
    const m = s.date.slice(0,7);
    months[m] = months[m] || { income: 0, expense: 0 };
    months[m].income += s.amount;
  });
  payments.forEach(p => {
    const m = p.date.slice(0,7);
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

  // Saving page form
  const savingForm = document.getElementById("savingForm");
  if (savingForm) {
    savingForm.addEventListener("submit", e => {
      e.preventDefault();
      const date = document.getElementById("savingDate").value;
      const account = document.getElementById("savingAccount").value;
      const amount = parseFloat(document.getElementById("savingAmount").value);
      addSaving(date, account, amount);
      alert("Saving entry added!");
      savingForm.reset();
    });
  }

  // Payment page form
  const paymentForm = document.getElementById("paymentForm");
  if (paymentForm) {
    paymentForm.addEventListener("submit", e => {
      e.preventDefault();
      const date = document.getElementById("paymentDate").value;
      const category = document.getElementById("paymentCategory").value;
      const amount = parseFloat(document.getElementById("paymentAmount").value);
      addPayment(date, category, amount);
      alert("Payment entry added!");
      paymentForm.reset();
    });
  }

  // Excel import button (optional)
  const importInput = document.getElementById("importExcel");
  if (importInput) {
    importInput.addEventListener("change", e => {
      importExcel(e.target.files[0]);
    });
  }

  // Excel export button
  const exportBtn = document.getElementById("exportExcel");
  if (exportBtn) {
    exportBtn.addEventListener("click", exportExcel);
  }
});
