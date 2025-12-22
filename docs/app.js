// ---------- helpers ----------
function isLikelyUrlCol(name) {
  const n = name.toLowerCase();
  return n.includes("url") || n.includes("link") || n.includes("source");
}

// Parse dates like "Jun 18, 2026", "Jun 18, 2026 – Jun 21, 2026", "Apr 10–12 & Apr 17–19, 2026"
function parseStartEnd(rangeText) {
  if (!rangeText) return { start: null, end: null };

  // Normalize dash types
  let t = String(rangeText).replace(/\u2013|\u2014/g, "-").trim();

  // Handle "Apr 10-12 & Apr 17-19, 2026" => treat as Apr 10 ... Apr 19 (same year)
  if (t.includes("&")) {
    const parts = t.split("&").map(s => s.trim());
    // Take first date as start, last date as end
    const start = new Date(parts[0].replace(/-\d+\s*,\s*/g, " ") // "Apr 10-12, 2026" -> "Apr 10 2026"
                            .replace(",", ""));
    // For end: keep the latter range end day; easiest: remove the first chunk's leading month if missing
    const endStr = parts[parts.length - 1].replace(",", "");
    // If endStr missing year, borrow from start
    const yearMatch = t.match(/(\d{4})/);
    const year = yearMatch ? yearMatch[1] : "";
    const end = new Date(endStr.includes(year) ? endStr : `${endStr} ${year}`);
    return { start: isNaN(start) ? null : start, end: isNaN(end) ? null : end };
  }

  // Handle "X – Y" (or "X - Y")
  if (t.includes(" - ")) t = t.replace(" - ", " – "); // unify spacing if present

  if (t.includes("–") || t.includes(" - ") || t.includes(" -") || t.includes("- ")) {
    // Split on hyphen but keep readable: assume "Start - End"
    const split = t.split("-").map(s => s.trim());
    // If it's like "Jun 18" "21, 2026" we need to borrow month/year from first half
    const left = split[0];
    const right = split.slice(1).join("-"); // in case venue has dash (rare)

    // If right lacks month name, borrow from left
    const monthName = left.split(" ")[0];
    const yearMatch = t.match(/(\d{4})/);
    const year = yearMatch ? yearMatch[1] : "";

    let startStr = left.replace(",", "");
    let endStr = right.replace(",", "");

    // If endStr starts with digits (day) not month, add month
    if (/^\d{1,2}\b/.test(endStr)) {
      endStr = `${monthName} ${endStr}`;
    }
    // If endStr lacks year, add year
    if (!/\d{4}/.test(endStr) && year) {
      endStr = `${endStr} ${year}`;
    }
    // If startStr lacks year but end has, add year
    if (!/\d{4}/.test(startStr) && year) {
      startStr = `${startStr} ${year}`;
    }

    const start = new Date(startStr);
    const end = new Date(endStr);
    return { start: isNaN(start) ? null : start, end: isNaN(end) ? null : end };
  }

  // Single day
  const d = new Date(t.replace(",", ""));
  return { start: isNaN(d) ? null : d, end: isNaN(d) ? null : d };
}

function toISODate(input) {
  if (!(input instanceof Date) || isNaN(input)) return "";
  const yyyy = input.getFullYear();
  const mm = String(input.getMonth() + 1).padStart(2, "0");
  const dd = String(input.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ---------- DataTable build ----------
async function loadCsvIntoTable({ csvPath, tableId, dateColNameCandidates }) {
  const csvText = await fetch(csvPath).then(r => r.text());

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const data = parsed.data;
  const cols = parsed.meta.fields;

  // Find which column is "Date"/"Dates"
  const dateCol = cols.find(c => dateColNameCandidates.includes(c));

  // Add hidden StartISO/EndISO columns for range filtering (if date column exists)
  let finalCols = [...cols];
  if (dateCol) {
    finalCols.push("__startISO", "__endISO");
    data.forEach(row => {
      const { start, end } = parseStartEnd(row[dateCol]);
      row["__startISO"] = toISODate(start);
      row["__endISO"] = toISODate(end);
    });
  }

  // Build thead
  const $thead = $(`#${tableId} thead`);
  $thead.empty();
  $thead.append("<tr>" + finalCols.map(h => `<th>${h}</th>`).join("") + "</tr>");

  // Build rows
  const $tbody = $(`#${tableId} tbody`);
  $tbody.empty();

  data.forEach(row => {
    const tds = finalCols.map(col => {
      const val = row[col] ?? "";

      // Make URL columns clickable
      if (isLikelyUrlCol(col) && String(val).trim()) {
        const safe = String(val).trim();
        return `<td><a href="${safe}" target="_blank" rel="noopener">link</a></td>`;
      }

      return `<td>${String(val)}</td>`;
    }).join("");

    $tbody.append(`<tr>${tds}</tr>`);
  });

  // DataTables init
  const dt = $(`#${tableId}`).DataTable({
    responsive: true,
    pageLength: 25,
    order: [],
    columnDefs: [
      // Hide helper ISO columns
      ...(dateCol ? [
        { targets: [finalCols.indexOf("__startISO"), finalCols.indexOf("__endISO")], visible: false, searchable: false }
      ] : [])
    ]
  });

  return { dt, cols: finalCols, dateCol, startIdx: finalCols.indexOf("__startISO"), endIdx: finalCols.indexOf("__endISO") };
}

// ---------- Column filters (dropdowns) ----------
function buildColumnDropdownFilters(activeTable, filterCols) {
  const { dt, cols } = activeTable;
  const $wrap = $("#columnFilters");
  $wrap.empty();

  filterCols.forEach(colName => {
    const idx = cols.indexOf(colName);
    if (idx === -1) return;

    // Get unique values
    const values = new Set();
    dt.column(idx).data().each(v => {
      const s = String(v).replace(/<[^>]*>/g, "").trim();
      if (s) values.add(s);
    });

    const sorted = Array.from(values).sort((a,b) => a.localeCompare(b));

    const id = `filter-${colName.replace(/\W+/g, "-").toLowerCase()}`;
    const html = `
      <div class="filter">
        <label for="${id}">${colName}</label>
        <select id="${id}">
          <option value="">All</option>
          ${sorted.map(v => `<option value="${v.replace(/"/g, "&quot;")}">${v}</option>`).join("")}
        </select>
      </div>
    `;
    $wrap.append(html);

    // Hook change -> exact match
    $(`#${id}`).on("change", function(){
      const val = $(this).val();
      if (!val) {
        dt.column(idx).search("").draw();
      } else {
        // Exact match via regex
        dt.column(idx).search("^" + $.fn.dataTable.util.escapeRegex(val) + "$", true, false).draw();
      }
    });
  });
}

// ---------- Date range filter (works off hidden ISO columns) ----------
function attachDateRangeFiltering(activeTable) {
  const { dt, startIdx, endIdx } = activeTable;

  // Add custom filter function once
  if (!$.fn.dataTable.ext.search.__emoArchiveDateFilterAdded) {
    $.fn.dataTable.ext.search.push(function(settings, data){
      const from = $("#dateFrom").val();
      const to = $("#dateTo").val();

      // No date filter set
      if (!from && !to) return true;

      // helper columns are in the row data at those indices
      const startISO = data[startIdx] || "";
      const endISO = data[endIdx] || startISO;

      if (!startISO) return false;

      // overlap check: event [start,end] intersects [from,to]
      const eventStart = startISO;
      const eventEnd = endISO;

      const fromISO = from || "0000-01-01";
      const toISO = to || "9999-12-31";

      return !(eventEnd < fromISO || eventStart > toISO);
    });

    $.fn.dataTable.ext.search.__emoArchiveDateFilterAdded = true;
  }

  $("#dateFrom, #dateTo").off("change").on("change", () => dt.draw());
}

// ---------- Global search ----------
function attachGlobalSearch(activeTable) {
  const { dt } = activeTable;
  $("#globalSearch").off("input").on("input", function(){
    dt.search(this.value).draw();
  });
}

// ---------- Tabs ----------
function setActiveTab(tabName, tables) {
  $(".tab").removeClass("active");
  $(`.tab[data-tab="${tabName}"]`).addClass("active");

  $(".panel").removeClass("active");
  $(`#panel-${tabName}`).addClass("active");

  // Pick which DataTable is active
  const active = tabName === "tours" ? tables.tours : tables.festivals;

  // Rebuild filters for this table
  $("#globalSearch").val("");
  $("#dateFrom").val("");
  $("#dateTo").val("");

  active.dt.search("").columns().search("").draw();

  // Column dropdown sets (customize to taste)
  const filterCols = tabName === "tours"
    ? ["Headliner", "Tour Name", "City", "State / Country"]
    : ["Festival Name", "Location"];

  buildColumnDropdownFilters(active, filterCols);
  attachGlobalSearch(active);
  attachDateRangeFiltering(active);
}

// ---------- init ----------
(async function init(){
  const tours = await loadCsvIntoTable({
    csvPath: "data/tours.csv",
    tableId: "toursTable",
    dateColNameCandidates: ["Date"] // tours use Date
  });

  const festivals = await loadCsvIntoTable({
    csvPath: "data/festivals.csv",
    tableId: "festivalsTable",
    dateColNameCandidates: ["Dates"] // festivals use Dates
  });

  const tables = { tours, festivals };

  // Tabs
  $(".tab").on("click", function(){
    setActiveTab($(this).data("tab"), tables);
  });

  // Clear filters
  $("#clearFilters").on("click", function(){
    $("#globalSearch").val("");
    $("#dateFrom").val("");
    $("#dateTo").val("");

    const activeTab = $(".tab.active").data("tab");
    const active = activeTab === "tours" ? tables.tours : tables.festivals;

    // clear column dropdowns
    $("#columnFilters select").val("");

    active.dt.search("").columns().search("").draw();
  });

  // Default tab
  setActiveTab("tours", tables);
})();

