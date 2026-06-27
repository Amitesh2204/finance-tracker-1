let entries = [];

// Handle form submission
document.getElementById("entryForm").addEventListener("submit", function(e) {
  e.preventDefault();
  const date = document.getElementById("date").value;
  const category = document.getElementById("category").value;
  const amount = parseFloat(document.getElementById("amount").value);

  entries.push({ Date: date, Category: category, Amount: amount });
  alert("Entry added!");
});

// Export to Excel
document.getElementById("exportBtn").addEventListener("click", function() {
  if (entries.length === 0) {
    alert("No entries to export!");
    return;
  }
  const worksheet = XLSX.utils.json_to_sheet(entries);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Finance");
  XLSX.writeFile(workbook, "finance-tracker.xlsx");
});

// Portfolio Chart
const portfolioCtx = document.getElementById("portfolioChart").getContext("2d");
new Chart(portfolioCtx, {
  type: "doughnut",
  data: {
    labels: ["ETF", "Crypto", "Gold"],
    datasets: [{
      data: [32.1, 12.9, 55.0],
      backgroundColor: ["#3498db", "#e67e22", "#f1c40f"]
    }]
  }
});

// Income vs Expense Chart
const trendCtx = document.getElementById("trendChart").getContext("2d");
new Chart(trendCtx, {
  type: "line",
  data: {
    labels: ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    datasets: [
      {
        label: "Income",
        data: [2500, 2200, 2700, 3000, 2800, 2600, 3100, 2900, 3200, 3300, 3400, 3500],
        borderColor: "#2ecc71",
        fill: false
      },
      {
        label: "Expenses",
        data: [2000, 2100, 2300, 2500, 2400, 2200, 2600, 2700, 2800, 2900, 3000, 3100],
        borderColor: "#e74c3c",
        fill: false
      }
    ]
  }
});
<<<<<<< HEAD

=======
>>>>>>> dd074c7 (pus to main repo)
