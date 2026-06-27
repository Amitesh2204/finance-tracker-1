/* ================================
   Global State
   ================================ */
let savings = [];   // Saving entries
let payments = [];  // Payment entries
let balance = 0;
let savingTotal = 0;

/* ================================
   Add Saving Entry (with category list)
   ================================ */
function addSaving(date, category, amount) {
  const monthYear = new Date(date).toLocaleString("default", { month: "long", year: "numeric" });
  savings.push({ date, category, amount, monthYear });

  // Update totals
  savingTotal = savings.reduce((sum, s) => sum + s.amount, 0);
  balance += amount;

  // Update UI
  updateSavingTable();
  updateOverview();
}

/* ================================
   Update Saving Table (month-wise)
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
   Export to Excel (month-wise sheets)
   ================================ */
function exportExcel() {
  const workbook = XLSX.utils.book_new();

  // Group savings by month-year
  const grouped = {};
  savings.forEach(s => {
    grouped[s.monthYear] = grouped[s.monthYear] || [];
    grouped[s.monthYear].push({
      Date: s.date,
      Category: s.category,
      Amount: s.amount
    });
  });

  // Create a worksheet per month-year
  Object.keys(grouped).forEach(monthYear => {
    const worksheet = XLSX.utils.json_to_sheet(grouped[monthYear]);
    XLSX.utils.book_append_sheet(workbook, worksheet, monthYear);
  });

  // Add payments in a separate sheet
  const paymentSheet = XLSX.utils.json_to_sheet(payments.map(p => ({
    Date: p.date,
    Category: p.category,
    Amount: p.amount
  })));
  XLSX.utils.book_append_sheet(workbook, paymentSheet, "Payments");

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

  // Saving page form
  const savingForm = document.getElementById("savingForm");
  if (savingForm) {
    savingForm.addEventListener("submit", e => {
      e.preventDefault();
      const date = document.getElementById("savingDate").value;
      const category = document.getElementById("savingCategory").value;
      const amount = parseFloat(document.getElementById("savingAmount").value);
      addSaving(date, category, amount);
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

  // Excel export button
  const exportBtn = document.getElementById("exportExcel");
  if (exportBtn) {
    exportBtn.addEventListener("click", exportExcel);
  }
});
