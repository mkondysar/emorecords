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

  // Display columns: hide Source URL always (we still use it for linking)
  const displayCols = finalCols.filter((c) => c !== "Source URL");

  // Build THEAD / TBODY
  const $table = $(`#${tableId}`);
  const $thead = $table.find("thead");
  const $tbody = $table.find("tbody");

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

  // Destroy existing DataTable instance safely
  if ($.fn.DataTable.isDataTable($table)) {
    $table.DataTable().destroy();
  }

  // Figure out indices for hidden ISO cols (if they exist in displayCols)
  const startIdx = displayCols.indexOf("__startISO");
  const endIdx = displayCols.indexOf("__endISO");

  const hiddenIsoDefs =
    dateCol && startIdx !== -1 && endIdx !== -1
      ? [
          {
            targets: [startIdx, endIdx],
            visible: false,
            searchable: false
          }
        ]
      : [];

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

    columnDefs: hiddenIsoDefs
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
    await loadCsvIntoTable({
      csvPath: "./data/tours.csv",
      tableId: "toursTable",
      dateColNameCandidates: ["Date"]
    });

    await loadCsvIntoTable({
      csvPath: "./data/festivals.csv",
      tableId: "festivalsTable",
      dateColNameCandidates: ["Dates"]
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

console.log("✅ app.js loaded");
