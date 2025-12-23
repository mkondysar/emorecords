// =========================
// CSV → DATATABLE LOADER (REWRITE)
// =========================

async function loadCsvIntoTable({ csvPath, tableId, dateColNameCandidates }) {
  // Helpers: safe escaping to prevent broken HTML
  const escHtml = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const escAttr = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");

  const norm = (s) => String(s ?? "").trim().toLowerCase();

  const isFestivalsTable = tableId === "festivalsTable";

  // Fetch + parse CSV
  const res = await fetch(csvPath);
  if (!res.ok) throw new Error(`Failed to fetch ${csvPath}: ${res.status}`);
  const csvText = await res.text();

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true
  });

  const data = Array.isArray(parsed.data) ? parsed.data : [];
  const cols = Array.isArray(parsed.meta?.fields) ? parsed.meta.fields : [];

  // Identify date column (exact match against candidates)
  const dateCol = cols.find((c) => dateColNameCandidates.includes(c));

  // Add hidden ISO columns if date column exists
  const finalCols = [...cols];
  if (dateCol) {
    finalCols.push("__startISO", "__endISO");
    data.forEach((row) => {
      const { start, end } = parseStartEnd(row?.[dateCol]);
      row.__startISO = toISO(start);
      row.__endISO = toISO(end);
    });
  }

const displayCols = [...finalCols];

  // Build THEAD / TBODY
const $table = $(`#${tableId}`);
const $thead = $table.find("thead");
const $tbody = $table.find("tbody");

// IMPORTANT: fully destroy + remove DataTables wrapper BEFORE rebuilding HTML
if ($.fn.DataTable.isDataTable($table)) {
  $table.DataTable().destroy(true); // true = remove added wrapper + controls
}

// Now rebuild the table safely
$thead.empty();
$tbody.empty();


  // Header row
  $thead.append(
    `<tr>${displayCols.map((c) => `<th>${escHtml(c)}</th>`).join("")}</tr>`
  );

  // Body rows
  data.forEach((row) => {
    const tds = displayCols
      .map((col) => {
        const colNorm = norm(col);
        // ALWAYS render ISO helper columns so DataTables can filter on them
if (colNorm === "__startiso" || colNorm === "__endiso") {
  return `<td>${escHtml(row[col])}</td>`;
}

        const rawVal = row?.[col];
        const val = escHtml(rawVal);

        // Use Source URL for linking (even though hidden)
        const url = row?.["Source URL"];
        const hasUrl = url && String(url).trim() !== "";

        // FESTIVALS: link Festival Name
        if (isFestivalsTable && colNorm === "festival name") {
          return hasUrl
            ? `<td class="festival-name"><a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer">${val}</a></td>`
            : `<td class="festival-name">${val}</td>`;
        }

        // TOURS: link Tour name (robust to case/spaces)
        if (!isFestivalsTable && colNorm === "tour name") {
          return hasUrl
            ? `<td class="tour-name"><a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer">${val}</a></td>`
            : `<td class="tour-name">${val}</td>`;
        }

        return `<td>${val}</td>`;
      })
      .join("");

    $tbody.append(`<tr>${tds}</tr>`);
  });

  // Figure out indices for hidden ISO cols (if they exist in displayCols)
  const startIdx = displayCols.indexOf("__startISO");
  const endIdx = displayCols.indexOf("__endISO");

  const hiddenCols = [];

// Hide Source URL column
const sourceUrlIdx = displayCols.indexOf("Source URL");
if (sourceUrlIdx !== -1) {
  hiddenCols.push({
    targets: sourceUrlIdx,
    visible: false,
    searchable: false
  });
}

// Hide ISO date helper columns
if (dateCol) {
  const startIdx = displayCols.indexOf("__startISO");
  const endIdx   = displayCols.indexOf("__endISO");

  if (startIdx !== -1 && endIdx !== -1) {
    hiddenCols.push({
      targets: [startIdx, endIdx],
      visible: false,
      searchable: false
    });
  }
}


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

    // NOTE: FixedColumns REQUIRES the FixedColumns JS file, not just CSS.
    // If you don't have the JS included, comment this out or it will break the table.
    fixedColumns: { leftColumns: 2 },

    columnDefs: hiddenCols
  });

  return {
    dt,
    cols: displayCols,
    startIdx,
    endIdx
  };
}

// =========================
// DATE HELPERS
// =========================

function parseStartEnd(text) {
  if (!text) return {};
  const clean = String(text).replace(/–/g, "-").trim();
  const parts = clean.split("-").map((p) => p.trim()).filter(Boolean);

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
// INIT
// =========================

(async function init() {
  try {
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
// Hook your custom "Search everything" box to BOTH tables
$("#globalSearch").on("input", function () {
  const term = this.value || "";
  tours.dt.search(term).draw();
  festivals.dt.search(term).draw();
});
// --- Date range filter (applies to both tables) ---
const $from = $("#dateFrom");
const $to = $("#dateTo");

// One shared filter function for both DataTables instances
const dateRangeFilter = function (settings, rowData) {
  const tableId = settings.nTable?.id;
  const isTours = tableId === "toursTable";
  const isFests = tableId === "festivalsTable";

  // Only affect our two tables
  if (!isTours && !isFests) return true;

  const from = $from.val(); // "YYYY-MM-DD" or ""
  const to = $to.val();     // "YYYY-MM-DD" or ""

  // No date filters set
  if (!from && !to) return true;

  // Pick the correct hidden ISO columns for this table
  const startIdx = isTours ? tours.startIdx : festivals.startIdx;
  const endIdx   = isTours ? tours.endIdx   : festivals.endIdx;

  // If table doesn't have ISO cols, don't filter it out
  if (startIdx === -1 || endIdx === -1) return true;

  const startISO = rowData[startIdx] || "";
  const endISO   = rowData[endIdx] || startISO;

  // If we can't parse a date, let it pass (keeps “unknown date” rows visible)
  if (!startISO) return true;

  // Inclusive overlap logic:
  // row passes if it overlaps the [from, to] window
  const windowStart = from || "0000-01-01";
  const windowEnd   = to   || "9999-12-31";

  return endISO >= windowStart && startISO <= windowEnd;
};

// Register it once (avoid duplicates if init re-runs)
$.fn.dataTable.ext.search = $.fn.dataTable.ext.search.filter(fn => fn !== dateRangeFilter);
$.fn.dataTable.ext.search.push(dateRangeFilter);

// Redraw on date changes
$from.add($to).on("change", function () {
  tours.dt.draw();
  festivals.dt.draw();
});
$("#clearFilters").on("click", function () {
  $("#globalSearch").val("");
  $("#dateFrom").val("");
  $("#dateTo").val("");

  tours.dt.search("").draw();
  festivals.dt.search("").draw();
});


    $(".tab").on("click", function () {
      $(".tab").removeClass("active");
      $(this).addClass("active");

      $(".panel").removeClass("active");
      $("#panel-" + $(this).data("tab")).addClass("active");
    });

    console.log("✅ tables initialized");
  } catch (err) {
    console.error("❌ init failed:", err);
  }
})();


