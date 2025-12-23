// =========================
// Elder Emo Tour Archive — app.js (FULL WORKING SCRIPT)
// - Loads CSVs into DataTables
// - Hides "Source URL" column (still used for links)
// - Tours: "Tour name" clickable → Source URL
// - Festivals: "Festival Name" clickable → Source URL
// - Global search (#globalSearch) filters ACTIVE tab
// - Date filters (#dateFrom / #dateTo) filter BOTH tables using hidden ISO columns
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

function parseMDY(s) {
  const str = String(s ?? "").trim();
  if (!str) return null;

  // Accept YYYY-MM-DD (from <input type="date"> or already-ISO)
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]), m = Number(isoMatch[2]), d = Number(isoMatch[3]);
    return new Date(y, m - 1, d);
  }

  // Accept M/D/YYYY or MM/DD/YYYY
  const mdyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const m = Number(mdyMatch[1]), d = Number(mdyMatch[2]), y = Number(mdyMatch[3]);
    return new Date(y, m - 1, d);
  }

  // If we can't parse, return null
  return null;
}

function parseMDY(str) {
  const s = String(str ?? "").trim();
  if (!s) return null;

  // M/D/YYYY or MM/DD/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = Number(m[3]);
    return new Date(year, month - 1, day); // local date (safe)
  }

  // If already ISO
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return new Date(year, month - 1, day);
  }

  return null;
}

function parseStartEnd(text) {
  if (!text) return {};
  const clean = String(text).replace(/–/g, "-").trim();
  const parts = clean.split("-").map(p => p.trim()).filter(Boolean);

  if (parts.length === 1) {
    const d = parseMDY(parts[0]);
    return { start: d, end: d };
  }

  const start = parseMDY(parts[0]);
  const end = parseMDY(parts.slice(1).join("-"));
  return { start, end };
}


// -------------------------
// CSV → DataTable loader
// -------------------------
async function loadCsvIntoTable({ csvPath, tableId, dateColNameCandidates }) {
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

  // Identify date column
  const dateCol = cols.find((c) => dateColNameCandidates.includes(c));

  // Build columns list (keep ALL cols including Source URL + helper ISO cols)
  const allCols = [...cols];

  if (dateCol) {
    allCols.push("__startISO", "__endISO");
    data.forEach((row) => {
      const { start, end } = parseStartEnd(row?.[dateCol]);
      row.__startISO = toISO(start);
      row.__endISO = toISO(end);
    });
  }

  // Build table DOM
  const $table = $(`#${tableId}`);
  const $thead = $table.find("thead");
  const $tbody = $table.find("tbody");

  // Fully destroy DataTable + wrapper before rebuilding
  if ($.fn.DataTable.isDataTable($table)) {
    $table.DataTable().destroy(true);
  }

  $thead.empty();
  $tbody.empty();

  // Header
  $thead.append(
    `<tr>${allCols.map((c) => `<th>${escHtml(c)}</th>`).join("")}</tr>`
  );

  // Body
  data.forEach((row) => {
    const tds = allCols
      .map((col) => {
        const colNorm = norm(col);
        const rawVal = row?.[col] ?? "";
        const val = escHtml(rawVal);

        // ALWAYS render ISO helper columns so filters can use them
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
      })
      .join("");

    $tbody.append(`<tr>${tds}</tr>`);
  });

  // Column hiding rules (hide Source URL + ISO helper cols)
  const hiddenCols = [];

  const sourceUrlIdx = allCols.indexOf("Source URL");
  if (sourceUrlIdx !== -1) {
    hiddenCols.push({ targets: sourceUrlIdx, visible: false, searchable: false });
  }

  const startIdx = allCols.indexOf("__startISO");
  const endIdx = allCols.indexOf("__endISO");
  if (startIdx !== -1 && endIdx !== -1) {
    hiddenCols.push({ targets: [startIdx, endIdx], visible: false, searchable: false });
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
    // If FixedColumns JS isn't loaded, comment out the next line:
    fixedColumns: { leftColumns: 2 },
    columnDefs: hiddenCols
  });

  return { dt, tableId, startIdx, endIdx };
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
      tableId: "toursTable",
      dateColNameCandidates: ["Date"]
    });

    const festivals = await loadCsvIntoTable({
      csvPath: "./data/festivals.csv",
      tableId: "festivalsTable",
      dateColNameCandidates: ["Dates"]
    });

    // =========================
    // SEARCH (custom input)
    // =========================
    $("#globalSearch").on("input", function () {
      const term = this.value || "";
      getActiveDT(tours, festivals).search(term).draw();
    });

    // =========================
    // DATE RANGE FILTER (WORKING VERSION)
    // =========================

    // Remove any old date filters we previously added
    $.fn.dataTable.ext.search = $.fn.dataTable.ext.search.filter(
      (fn) => !fn.__elderEmoDateFilter
    );

    const elderEmoDateFilter = function (settings, rowData) {
      const tableId = settings.nTable && settings.nTable.id;
      if (tableId !== "toursTable" && tableId !== "festivalsTable") return true;

      const from = $("#dateFrom").val(); // YYYY-MM-DD
      const to = $("#dateTo").val(); // YYYY-MM-DD
      if (!from && !to) return true;

      const startIdx = tableId === "toursTable" ? tours.startIdx : festivals.startIdx;
      const endIdx = tableId === "toursTable" ? tours.endIdx : festivals.endIdx;

      if (startIdx === -1 || endIdx === -1) return true;

      const startISO = rowData[startIdx] || "";
      const endISO = rowData[endIdx] || startISO;

      if (!startISO) return true;

      const windowStart = from || "0000-01-01";
      const windowEnd = to || "9999-12-31";

      // Overlap inclusive
      return endISO >= windowStart && startISO <= windowEnd;
    };

    elderEmoDateFilter.__elderEmoDateFilter = true;
    $.fn.dataTable.ext.search.push(elderEmoDateFilter);

    // Redraw BOTH tables when date changes
    $("#dateFrom, #dateTo").on("change", function () {
      tours.dt.draw();
      festivals.dt.draw();
    });

    // =========================
    // CLEAR FILTERS BUTTON
    // =========================
    $("#clearFilters").on("click", function () {
      $("#globalSearch").val("");
      $("#dateFrom").val("");
      $("#dateTo").val("");

      tours.dt.search("").draw();
      festivals.dt.search("").draw();
    });

    // =========================
    // TABS
    // =========================
    $(".tab").on("click", function () {
      $(".tab").removeClass("active");
      $(this).addClass("active");

      $(".panel").removeClass("active");
      const panelId = "#panel-" + $(this).data("tab");
      $(panelId).addClass("active");

      // Fix sizing when switching tabs
      setTimeout(() => {
        $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
      }, 0);

      // Apply filters to the newly active table
      getActiveDT(tours, festivals).draw();
    });

    console.log("✅ tables initialized");
  } catch (err) {
    console.error("❌ init failed:", err);
  }
})();

console.log("✅ app.js loaded");
