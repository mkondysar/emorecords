// =========================
// CSV → DATATABLE LOADER
// =========================

async function loadCsvIntoTable({ csvPath, tableId, dateColNameCandidates }) {
  const csvText = await fetch(csvPath).then(r => r.text());

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true
  });

  const data = parsed.data;
  const cols = parsed.meta.fields;
  const isFestivalsTable = tableId === "festivalsTable";

  const dateCol = cols.find(c => dateColNameCandidates.includes(c));

  let finalCols = [...cols];

  if (dateCol) {
    finalCols.push("__startISO", "__endISO");
    data.forEach(row => {
      const { start, end } = parseStartEnd(row[dateCol]);
      row.__startISO = toISO(start);
      row.__endISO = toISO(end);
    });
  }

  const displayCols = isFestivalsTable
    ? finalCols.filter(c => c !== "Source URL")
    : finalCols;

  const $thead = $(`#${tableId} thead`);
  const $tbody = $(`#${tableId} tbody`);
  $thead.empty();
  $tbody.empty();

  $thead.append(`<tr>${displayCols.map(c => `<th>${c}</th>`).join("")}</tr>`);

  data.forEach(row => {
    const tds = displayCols.map(col => {
      const val = String(row[col] ?? "");

      if (isFestivalsTable && col === "Festival Name") {
        const url = row["Source URL"];
        return url
          ? `<td class="festival-name"><a href="${url}" target="_blank">${val}</a></td>`
          : `<td class="festival-name">${val}</td>`;
      }

      if (!isFestivalsTable && col === "Source URL") {
        return val
          ? `<td><a href="${val}" target="_blank">link</a></td>`
          : `<td></td>`;
      }

      return `<td>${val}</td>`;
    }).join("");

    $tbody.append(`<tr>${tds}</tr>`);
  });

  if ($.fn.DataTable.isDataTable(`#${tableId}`)) {
    $(`#${tableId}`).DataTable().destroy();
  }

  const dt = $(`#${tableId}`).DataTable({
    responsive: false,
    scrollX: true,
    scrollY: "65vh",
    scrollCollapse: true,
    pageLength: 25,
    autoWidth: false,
    order: [],
    fixedHeader: true,
    fixedColumns: { leftColumns: 2 },
    columnDefs: dateCol ? [{
      targets: [displayCols.indexOf("__startISO"), displayCols.indexOf("__endISO")],
      visible: false,
      searchable: false
    }] : []
  });

  return {
    dt,
    cols: displayCols,
    startIdx: displayCols.indexOf("__startISO"),
    endIdx: displayCols.indexOf("__endISO")
  };
}

// =========================
// DATE HELPERS
// =========================

function parseStartEnd(text) {
  if (!text) return {};
  const clean = text.replace(/–/g, "-");
  const parts = clean.split("-");
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

  $(".tab").on("click", function () {
    $(".tab").removeClass("active");
    $(this).addClass("active");

    $(".panel").removeClass("active");
    $("#panel-" + $(this).data("tab")).addClass("active");
  });
})();
