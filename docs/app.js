// =========================
// Elder Emo Tour Archive — app.js (NO DATE FILTERS)
// - Loads CSVs into DataTables
// - Hides "Source URL" column (still used for links)
// - Tours: "Tour Name" clickable → Source URL
// - Festivals: "Festival Name" clickable → Source URL
// - Global search (#globalSearch) filters ACTIVE tab
// - Clear button (#clearFilters)
// =========================

// -------------------------
// Helpers
// -------------------------
function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

// -------------------------
// CSV → DataTable loader
// -------------------------
async function loadCsvIntoTable({ csvPath, tableId }) {
  const isFestivalsTable = tableId === "festivalsTable";
    
  const res = await fetch(csvPath);
  if (!res.ok) throw new Error(`Failed to fetch ${csvPath}: ${res.status}`);
  const csvText = await res.text();

  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const data = Array.isArray(parsed.data) ? parsed.data : [];
  const cols = Array.isArray(parsed.meta?.fields) ? parsed.meta.fields : [];

  const $table = $(`#${tableId}`);
  const $thead = $table.find("thead");
  const $tbody = $table.find("tbody");

  // Destroy prior instance + wrapper
  if ($.fn.DataTable.isDataTable($table)) {
    $table.DataTable().destroy(true);
  }
      
  $thead.empty();
  $tbody.empty();

  // Header
  $thead.append(`<tr>${cols.map(c => `<th>${escHtml(c)}</th>`).join("")}</tr>`);

  // Body
  data.forEach(row => {
    const url = row?.["Source URL"];
    const hasUrl = url && String(url).trim() !== "";

    const tds = cols.map(col => {
      const colNorm = norm(col);
      const rawVal = row?.[col] ?? "";
      const val = escHtml(rawVal);

      // Festivals: link Festival Name
      if (isFestivalsTable && colNorm === "festival name") {
        return hasUrl
          ? `<td class="festival-name"><a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer">${val}</a></td>`
          : `<td class="festival-name">${val}</td>`;
      }

      // Tours: link Tour Name (supports "Tour Name" header)
      if (!isFestivalsTable && colNorm === "tour name") {
        return hasUrl
          ? `<td class="tour-name"><a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer">${val}</a></td>`
          : `<td class="tour-name">${val}</td>`;
      }

      return `<td>${val}</td>`;
    }).join("");

    $tbody.append(`<tr>${tds}</tr>`);
  });

  // Hide Source URL column
  const hiddenCols = [];
  const sourceUrlIdx = cols.indexOf("Source URL");
  if (sourceUrlIdx !== -1) {
    hiddenCols.push({ targets: sourceUrlIdx, visible: false, searchable: false });
  }
  // Default sort:
  // - Tours: City (ascending)
  // - Festivals: Date (ascending)
  let defaultOrder = [];

  if (isFestivalsTable) {
    // Try common date column names
    const dateIdx =
      cols.findIndex(c => norm(c) === "date") !== -1
        ? cols.findIndex(c => norm(c) === "date")
        : cols.findIndex(c => norm(c) === "dates");

    if (dateIdx !== -1) defaultOrder = [[dateIdx, "asc"]];
  } else {
    const cityIdx = cols.findIndex(c => norm(c) === "city");
    if (cityIdx !== -1) defaultOrder = [[cityIdx, "asc"]];
  }

 // Build width rules by table type (targets are column indexes)
function widthDefs(cols, isFestivalsTable) {
  const idx = name => cols.findIndex(c => norm(c) === norm(name));

  const defs = [];

  if (!isFestivalsTable) {
    // TOURS table widths
    const map = [
      ["Headliner", "140px"],
      ["Tour Name", "220px"],
      ["Support", "260px"],
      ["Date", "120px"],
      ["Venue", "220px"],
      ["City", "160px"],
      ["State", "90px"],
      ["Country", "120px"]
      // Source URL is hidden already
    ];

    map.forEach(([name, w]) => {
      const i = idx(name);
      if (i !== -1) defs.push({ targets: i, width: w });
    });
  } else {
    // FESTIVALS table widths
    const map = [
      ["Festival Name", "180px"],
      ["Location", "220px"],
      ["Date", "140px"],   // if your column is "Dates" this won't match; see below
      ["Dates", "140px"],
      ["Lineup", "320px"]
    ];

    map.forEach(([name, w]) => {
      const i = idx(name);
      if (i !== -1) defs.push({ targets: i, width: w });
    });
  }

  return defs;
}

const dt = $table.DataTable({
  responsive: false,
  scrollX: true,
  scrollCollapse: true,
  scrollY: "65vh",
  pageLength: 25,
  autoWidth: false,
  order: defaultOrder,
  fixedHeader: true,
  // (Optional but helps mobile): don't allow DataTables to change table width based on content
  // dom: "t<'dt-footer'ip>",
  
  columnDefs: [
    ...hiddenCols,
    ...widthDefs(cols, isFestivalsTable)
  ],

  // Force a resize/measure after initialization so scrollX calculates correctly
  initComplete: function () {
    const api = this.api();
    setTimeout(() => api.columns.adjust().draw(false), 0);
  }
});

  return { dt };
}

// -------------------------
// Active table helper
// -------------------------
function getActiveDT(tours, festivals) {
  const activeTab = $(".tab.active").data("tab"); // "tours" or "festivals"
  return activeTab === "festivals" ? festivals.dt : tours.dt;
}

// -------------------------
// INIT
// -------------------------
(async function init() {
  try {
    const tours = await loadCsvIntoTable({
      csvPath: "./data/tours.csv",
      tableId: "toursTable"
    });

    const festivals = await loadCsvIntoTable({
      csvPath: "./data/festivals.csv",
      tableId: "festivalsTable"
    });

    // Make the global search box feel nicer
    $("#globalSearch")
      .on("keydown", function (e) {
        // Prevent Enter from submitting anything / reloading
        if (e.key === "Enter") e.preventDefault();
      })
      .on("input", function () {
        const term = (this.value || "").trim();
        getActiveDT(tours, festivals).search(term).draw();
      });

    // Clear filters button
    $("#clearFilters").on("click", function () {
      $("#globalSearch").val("");

      // clear both tables so switching tabs doesn't “keep” old search state
      tours.dt.search("").draw();
      festivals.dt.search("").draw();
    });

    // Tabs
    $(".tab").on("click", function () {
      $(".tab").removeClass("active");
      $(this).addClass("active");

      $(".panel").removeClass("active");
      const panelId = "#panel-" + $(this).data("tab");
      $(panelId).addClass("active");

      // Fix sizing when switching tabs
    setTimeout(() => {
  tours.dt.columns.adjust();
  festivals.dt.columns.adjust();
}, 0);


      // Reapply current search term to the newly active table
      const term = ($("#globalSearch").val() || "").trim();
      getActiveDT(tours, festivals).search(term).draw();
    });

    console.log("✅ tables initialized (no date filters)");
  } catch (err) {
    console.error("❌ init failed:", err);
  }
})();



console.log("✅ app.js loaded");
