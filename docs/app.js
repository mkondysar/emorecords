/* =========================
   Elder Emo Tour Archive - script.js
   Tabs (Tours/Festivals) + DataTables init
   Safe for hidden tabs (fixes header/column misalignment)
   ========================= */

document.addEventListener("DOMContentLoaded", () => {
  // ---------- Helpers
  const $id = (id) => document.getElementById(id);

  // ---------- Required elements (must match your HTML)
  const tabTours = $id("tabTours");
  const tabFestivals = $id("tabFestivals");
  const toursSection = $id("toursSection");
  const festivalsSection = $id("festivalsSection");

  // If any of these are missing, don't hard-crash the page
  if (!tabTours || !tabFestivals || !toursSection || !festivalsSection) {
    console.warn(
      "[Archive] Missing tab elements. Expected ids: tabTours, tabFestivals, toursSection, festivalsSection"
    );
  }

  // ---------- DataTables init (only if tables exist)
  const hasToursTable = document.querySelector("#toursTable");
  const hasFestivalsTable = document.querySelector("#festivalsTable");

  let toursDT = null;
  let festivalsDT = null;

  // Use safe defaults. Avoid scrollX/FixedColumns until everything is stable.
  if (hasToursTable && window.jQuery && $.fn.dataTable) {
    toursDT = $("#toursTable").DataTable({
      responsive: true,
      autoWidth: false,
      paging: true,
      searching: true,
      ordering: true,
      info: true
    });
  } else if (hasToursTable) {
    console.warn("[Archive] DataTables not loaded for toursTable (check script include order).");
  }

  if (hasFestivalsTable && window.jQuery && $.fn.dataTable) {
    festivalsDT = $("#festivalsTable").DataTable({
      responsive: true,
      autoWidth: false,
      paging: true,
      searching: true,
      ordering: true,
      info: true
    });
  } else if (hasFestivalsTable) {
    console.warn("[Archive] DataTables not loaded for festivalsTable (check script include order).");
  }

  // ---------- Alignment fixer (critical for tables inside hidden tabs)
  function adjustTables() {
    // Small delay lets layout settle (fonts, panel display, etc.)
    setTimeout(() => {
      try {
        if (toursDT) {
          toursDT.columns.adjust();
          if (toursDT.responsive) toursDT.responsive.recalc();
        }
        if (festivalsDT) {
          festivalsDT.columns.adjust();
          if (festivalsDT.responsive) festivalsDT.responsive.recalc();
        }
      } catch (err) {
        console.warn("[Archive] adjustTables error:", err);
      }
    }, 80);
  }

  // ---------- Tabs show/hide
  function showTours() {
    if (tabTours) tabTours.classList.add("is-active");
    if (tabFestivals) tabFestivals.classList.remove("is-active");
    if (toursSection) toursSection.classList.add("is-active");
    if (festivalsSection) festivalsSection.classList.remove("is-active");
    adjustTables();
  }

  function showFestivals() {
    if (tabFestivals) tabFestivals.classList.add("is-active");
    if (tabTours) tabTours.classList.remove("is-active");
    if (festivalsSection) festivalsSection.classList.add("is-active");
    if (toursSection) toursSection.classList.remove("is-active");
    adjustTables();
  }

  // Hook up tab clicks (only if elements exist)
  if (tabTours) tabTours.addEventListener("click", showTours);
  if (tabFestivals) tabFestivals.addEventListener("click", showFestivals);

  // ---------- Run once on load (helps first paint)
  adjustTables();

  // ---------- Also fix on resize
  window.addEventListener("resize", adjustTables);
});
