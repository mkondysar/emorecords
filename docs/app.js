// =========================
// HELPERS
// =========================

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

function parseStartEnd(text) {
  if (!text) return {};
  const clean = String(text).replace(/–/g, "-").trim();
  const parts = clean.split("-").map(p => p.trim()).filter(Boolean);

  if (parts.length === 1) {
    const d = new Date(parts[0]);
    return { start: d, end: d };
  }

  const start = new Date(parts[0]);
  const end = new Date(parts.slice(1).join("-"));
  return { start, end };
}

function toISO(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  return d.toISOString().split("T")[0];
}

// =========================
// CSV → DATATABLE LOADER
// =========================

async function loadCsvIntoTable({ csvPath, tableId, dateColNameCandidates }) {
  const isFestivalsTable = tableId === "festivalsTable";

  // Fetch + parse CSV
  const res = await fetch(csvPath);
  if (!res.ok) throw new Error(`Failed to fetch ${csvPath}: ${res.status}`);
  const csvText = await res.text();

  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  const data = Array.isArray(parsed.data) ? parsed.data : [];
  const cols = Array.isArray(parsed.meta?.fields) ? parsed.meta.fields : [];

  // Identify date column
  const dateCol = cols.find(c => dateColNameCandidates.includes(c));

  // Build full column list (including helper cols)
  const allCols = [...cols];
  if (dateCol) {
    allCols.push("__startISO", "__endISO");
    data.forEach(row => {
      const { start, end } = parseStartEnd(row?.[dateCol]);
      row.__startISO = toISO(start);
      row.__endISO = toISO(end);
    });
  }

  // Build table DOM
  const $table = $(`#${tableId}`);
  const $thead = $table.find("thead");
  const $tbody = $table.find("tbody");

  // Full destroy so old wrappers/inputs don’t linger
  if ($.fn.DataTable.isDataTable($table)) {
    $table.DataTable().destroy(true);
  }

  $thead.empty();
  $tbody.empty();

  $thead.append(`<tr>${allCols.map(c => `<th>${escHtml(c)}</th>`).join("")}</tr>`);

  data.forEach(row => {
    const tds = allCols.map(col => {
      const colNorm = norm(col);
      const rawVal = row?.[col] ?? "";
      const val = escHtml(rawVal);

      // Always render ISO helper columns (needed for filtering)
      if (colNorm === "__startiso" || colNorm === "__endiso") {
        return `<td>${escHtml(rawVal)}</td>`;
      }

      const url = row?.["Source URL"];
      const hasUrl = url && String(url).trim() !== "";

      // Festivals: link Festival Name
      if (isFestivalsTable && colNorm === "festival name") {
        return hasUrl
          ? `<td class="festival-name"><a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer">${val}</a></td>`
          : `<td class="festival-name">${val}</td>`;
      }

      // Tours: link Tour name
      if (!isFestivalsTable && colNorm === "tour name") {
        return hasUrl
          ? `<td class="tour-name"><a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer">${val}</a></td>`
          : `<td class="tour-name">${val}</td>`;
      }

      return `<td>${val}</td>`;
    }).join("");

    $tbody.append(`<tr>${tds}</tr>`);
  });

  // Hide Source URL + helper cols via DataTables
  const hiddenCols = [];

  const sourceUrlIdx = allCols.indexOf("Source URL");
  if (sourceUrlIdx !== -1) hiddenCols.push({ targets: sourceUrlIdx, visible: false, searchable: false });

  const startIdx = allCols.indexOf("__startISO");
  const endIdx = allCols.indexOf("__endISO");
  if (startIdx !== -1 && endIdx !== -1) hiddenCols.push({ targets: [startIdx, endIdx], visible: false, searchable: false });

  // Init DataTable
  const dt = $table.DataTable({
    responsive: false,
    scrollX: true,
    scrollY: "65vh",
    scrollCollapse: true,
    pageLength: 25,
    autoWidth: false,
    order: [],
    fixedHeader: true,
    fixedColumns: { leftColumns: 2 }, // comment out if you don't have FixedColumns JS loaded
    columnDefs: hiddenCols
  });

  return { dt, tableId, startIdx, endIdx };
}

// =========================
// FILTER WIRING
// =========================

function getActiveDT(tours, festivals) {
  const activeTab = $(".tab.active").data("tab"); // "tours" or "festivals"
  return activeTab === "festivals" ? festivals.dt : tours.dt;
}

function installDateFilterOnce() {
  // Remove any prior date filter we created (prevents duplicates)
  $.fn.dataTable.ext.search = $.fn.dataTable.ext.search.filter(fn => !fn.__elderEmoDateFilter);

  const fn = function (settings, rowData) {
    const tableId = settings.nTable && settings.nTable.id;
    if (tableId !== "toursTable" && tableId !== "festivalsTable") return true;

    const from = $("#dateFrom").val(); // YYYY-MM-DD
    const to = $("#dateTo").val();

    if (!from && !to) return true;

    // The ISO cols are always the last two cols we added, BUT we stored them as headers "__startISO/__endISO"
    // Safer: find them by header text each time.
    const api = new $.fn.dataTable.Api(settings);
    const headers = api.columns().header().toArray().map(th => th.textContent.trim());

    const startIdx = headers.indexOf("__startISO");
    const endIdx = headers.indexOf("__endISO");

    if (startIdx === -1 || endIdx === -1) return true;

    const startISO = rowData[startIdx] || "";
    const endISO = rowData[endIdx] || startISO;
    if (!startISO) return true;

    const windowStart = from || "0000-01-01";
    const windowEnd = to || "9999-12-31";

    // overlap inclusive
    return endISO >= windowStart && startISO <= windowEnd;
  };

  fn.__elderEmoDateFilter = true;
  $.fn.dataTable.ext.search.push(fn);
}

// =========================
// INIT
// =========================

(async function init() {
  try {
    // Build both tables
    const tours = await loadCsvIntoTable({
      csvPath: "./data/tours.csv",
      tableId: "toursTable",
      dateColNameCandidates: ["Date"]
    });

    const festivals = await loadCsvIntoTable({
      csvPath: "./data/festivals.csv",
      tableId: "festivalsTable",
      dateColNameCandidates: ["Dates"]
    });

    // Install one global date filter function
    installDateFilterOnce();

    // Search: filter the ACTIVE table only
    $("#globalSearch").on("input", function () {
      const term = this.value || "";
      getActiveDT(tours, festivals).search(term).draw();
    });

    // Date inputs: redraw ACTIVE table (so you can set dates in either tab)
    $("#dateFrom, #dateTo").on("change", function () {
      getActiveDT(tours, festivals).draw();
    });

    // Clear button
    $("#clearFilters").on("click", function () {
