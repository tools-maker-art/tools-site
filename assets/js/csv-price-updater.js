(function () {
  const state = {
    main: null,
    updates: null,
    updatedCsv: "",
    missingCsv: ""
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function parseCsv(text) {
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    const rows = lines.map(parseCsvLine);
    if (rows.length < 2) throw new Error("CSV must include a header row and at least one data row.");
    return { header: rows[0], rows: rows.slice(1) };
  }

  function parseCsvLine(line) {
    const cells = [];
    let cell = "";
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (char === "\"") {
        if (quoted && next === "\"") {
          cell += "\"";
          index += 1;
        } else {
          quoted = !quoted;
        }
        continue;
      }
      if (char === "," && !quoted) {
        cells.push(cell);
        cell = "";
      } else {
        cell += char;
      }
    }

    if (quoted) throw new Error("A quoted CSV field is not closed.");
    cells.push(cell);
    return cells;
  }

  function buildUpdateMap(parsed, options) {
    const map = new Map();
    parsed.rows.forEach((row) => {
      const sku = normalizeValue(row[options.updateSkuIndex] ?? "", options);
      if (sku) map.set(sku, row[options.updatePriceIndex] ?? "");
    });
    return map;
  }

  function normalizeValue(value, options) {
    let normalized = String(value ?? "");
    if (options.trim) normalized = normalized.trim();
    if (options.ignoreCase) normalized = normalized.toLowerCase();
    return normalized;
  }

  function applyUpdates(main, updates, options) {
    const updateMap = buildUpdateMap(updates, options);
    const foundSkus = new Set();
    let updatedRows = 0;
    let unchangedRows = 0;

    const rows = main.rows.map((row) => {
      const next = row.slice();
      const sku = normalizeValue(row[options.mainSkuIndex] ?? "", options);
      if (updateMap.has(sku)) {
        next[options.mainPriceIndex] = updateMap.get(sku);
        foundSkus.add(sku);
        updatedRows += 1;
      } else {
        unchangedRows += 1;
      }
      return next;
    });

    const missingRows = updates.rows.filter((row) => {
      const sku = normalizeValue(row[options.updateSkuIndex] ?? "", options);
      return sku && !foundSkus.has(sku);
    });

    return {
      header: main.header,
      rows,
      missingHeader: updates.header,
      missingRows,
      stats: {
        totalRows: main.rows.length,
        updatedRows,
        unchangedRows,
        missingSkus: missingRows.length
      }
    };
  }

  function generateCsv(header, rows) {
    return [header].concat(rows).map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  }

  function escapeCsvValue(value) {
    const text = String(value ?? "");
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
    return text;
  }

  function updateDropdowns() {
    fillSelect("mainSkuColumn", state.main ? state.main.header : []);
    fillSelect("mainPriceColumn", state.main ? state.main.header : []);
    fillSelect("updateSkuColumn", state.updates ? state.updates.header : []);
    fillSelect("updatePriceColumn", state.updates ? state.updates.header : []);
    selectByName("mainSkuColumn", ["sku", "id"]);
    selectByName("mainPriceColumn", ["price", "cost"]);
    selectByName("updateSkuColumn", ["sku", "id"]);
    selectByName("updatePriceColumn", ["new_price", "price", "new price"]);
  }

  function fillSelect(id, headers) {
    const select = getElement(id);
    select.innerHTML = headers.map((header, index) => `<option value="${index}">${escapeHtml(header || `Column ${index + 1}`)}</option>`).join("");
    select.disabled = headers.length === 0;
  }

  function selectByName(id, names) {
    const select = getElement(id);
    const options = Array.from(select.options);
    const match = options.find((option) => names.includes(option.textContent.trim().toLowerCase()));
    if (match) select.value = match.value;
  }

  function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  async function loadCsvFromFile(inputId, type) {
    const file = getElement(inputId).files[0];
    if (!file) return;
    try {
      const parsed = parseCsv(await file.text());
      state[type] = parsed;
      updateDropdowns();
      setStatus(`${type === "main" ? "Main" : "Update"} CSV loaded.`, "success");
    } catch (error) {
      state[type] = null;
      updateDropdowns();
      setStatus(error.message || "Could not parse CSV.", "error");
    }
  }

  function getOptions() {
    return {
      trim: getElement("trimSkus").checked,
      ignoreCase: getElement("ignoreCase").checked,
      mainSkuIndex: Number(getElement("mainSkuColumn").value),
      mainPriceIndex: Number(getElement("mainPriceColumn").value),
      updateSkuIndex: Number(getElement("updateSkuColumn").value),
      updatePriceIndex: Number(getElement("updatePriceColumn").value)
    };
  }

  function runApplyUpdates() {
    try {
      if (!state.main || !state.updates) throw new Error("Upload both the main CSV and update CSV first.");
      const result = applyUpdates(state.main, state.updates, getOptions());
      state.updatedCsv = generateCsv(result.header, result.rows);
      state.missingCsv = result.missingRows.length ? generateCsv(result.missingHeader, result.missingRows) : "";
      getElement("updatedOutput").value = state.updatedCsv;
      getElement("missingOutput").value = state.missingCsv;
      updateStats(result.stats);
      setStatus(`Applied ${result.stats.updatedRows} price update${result.stats.updatedRows === 1 ? "" : "s"}.`, "success");
    } catch (error) {
      setStatus(error.message || "Could not apply updates.", "error");
    }
  }

  function updateStats(stats) {
    getElement("totalRows").textContent = stats.totalRows.toLocaleString();
    getElement("updatedRows").textContent = stats.updatedRows.toLocaleString();
    getElement("unchangedRows").textContent = stats.unchangedRows.toLocaleString();
    getElement("missingSkus").textContent = stats.missingSkus.toLocaleString();
  }

  function downloadFile(targetId, filename) {
    const output = getElement(targetId).value;
    if (!output) {
      setStatus("Nothing to download yet.", "warning");
      return;
    }
    window.downloadTextFile(output, filename, "text/csv;charset=utf-8");
    setStatus(`Downloaded ${filename}.`, "success");
  }

  async function copyToClipboard() {
    try {
      await window.copyTextToClipboard(getElement("updatedOutput").value);
      setStatus("Copied updated CSV to clipboard.", "success");
    } catch (error) {
      setStatus(error.message || "Copy failed.", "error");
    }
  }

  function loadExample() {
    state.main = parseCsv("sku,name,price\nA101,Widget,10.00\nA102,Part,15.00");
    state.updates = parseCsv("sku,new_price\nA101,12.50\nA999,20.00");
    getElement("mainFileInput").value = "";
    getElement("updateFileInput").value = "";
    updateDropdowns();
    runApplyUpdates();
    setStatus("Example loaded and updates applied.", "success");
  }

  function clearAll() {
    state.main = null;
    state.updates = null;
    state.updatedCsv = "";
    state.missingCsv = "";
    getElement("mainFileInput").value = "";
    getElement("updateFileInput").value = "";
    getElement("updatedOutput").value = "";
    getElement("missingOutput").value = "";
    updateDropdowns();
    updateStats({ totalRows: 0, updatedRows: 0, unchangedRows: 0, missingSkus: 0 });
    setStatus("");
  }

  function setStatus(message, type) {
    window.setToolStatus("status", message, type);
  }

  function init() {
    if (!getElement("mainFileInput")) return;
    getElement("mainFileInput").addEventListener("change", () => loadCsvFromFile("mainFileInput", "main"));
    getElement("updateFileInput").addEventListener("change", () => loadCsvFromFile("updateFileInput", "updates"));
    getElement("applyBtn").addEventListener("click", runApplyUpdates);
    getElement("copyBtn").addEventListener("click", copyToClipboard);
    getElement("downloadUpdatedBtn").addEventListener("click", () => downloadFile("updatedOutput", "updated-prices.csv"));
    getElement("downloadMissingBtn").addEventListener("click", () => downloadFile("missingOutput", "missing-skus.csv"));
    getElement("clearBtn").addEventListener("click", clearAll);
    getElement("exampleBtn").addEventListener("click", loadExample);
    updateDropdowns();
    updateStats({ totalRows: 0, updatedRows: 0, unchangedRows: 0, missingSkus: 0 });
  }

  window.CsvPriceUpdater = {
    parseCsv,
    parseCsvLine,
    buildUpdateMap,
    normalizeValue,
    applyUpdates,
    generateCsv,
    downloadFile,
    copyToClipboard,
    updateDropdowns,
    loadExample,
    clearAll
  };

  document.addEventListener("DOMContentLoaded", init);
})();
