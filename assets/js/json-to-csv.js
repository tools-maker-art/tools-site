(function () {
  const state = {
    csvText: "",
    warnings: []
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function parseJsonInput(text, prettyValidate) {
    const parsed = JSON.parse(text);
    if (prettyValidate) {
      getElement("jsonInput").value = JSON.stringify(parsed, null, 2);
    }
    return parsed;
  }

  function normalizeRows(input) {
    const values = Array.isArray(input) ? input : [input];
    const rows = [];

    values.forEach((value, index) => {
      if (isPlainObject(value)) {
        rows.push(value);
      } else {
        addWarning(`Item ${index + 1} is not an object and was skipped.`);
      }
    });

    if (!rows.length) throw new Error("JSON must be an object or an array containing at least one object.");
    return rows;
  }

  function addWarning(message) {
    if (!state.warnings.includes(message)) state.warnings.push(message);
  }

  function flattenObject(object, options, prefix) {
    const row = {};
    Object.keys(object).forEach((key) => {
      const path = prefix ? `${prefix}.${key}` : key;
      const value = object[key];

      if (options.flattenNested && isPlainObject(value)) {
        Object.assign(row, flattenObject(value, options, path));
      } else if (Array.isArray(value) && options.arraysAsJson) {
        row[path] = JSON.stringify(value);
      } else if (isPlainObject(value)) {
        row[path] = JSON.stringify(value);
      } else {
        row[path] = normalizeCellValue(value, options);
      }
    });
    return row;
  }

  function normalizeCellValue(value, options) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return options.trimStrings ? value.trim() : value;
    return value;
  }

  function collectHeaders(rows) {
    const headers = [];
    const seen = new Set();
    rows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (!seen.has(key)) {
          seen.add(key);
          headers.push(key);
        }
      });
    });
    return headers;
  }

  function buildCsv(rows, options) {
    const flatRows = rows.map((row) => flattenObject(row, options, ""));
    const headers = collectHeaders(flatRows);
    if (!headers.length) throw new Error("No keys were found to build CSV headers.");

    const lines = [];
    if (options.includeHeaders) {
      lines.push(headers.map(escapeCsvValue).join(","));
    }

    flatRows.forEach((row) => {
      lines.push(headers.map((header) => escapeCsvValue(row[header] ?? "")).join(","));
    });

    return {
      csv: lines.join("\n"),
      rowCount: flatRows.length,
      headers
    };
  }

  function escapeCsvValue(value) {
    const text = String(value);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, "\"\"")}"`;
    }
    return text;
  }

  function getOptions() {
    return {
      prettyValidate: getElement("prettyValidate").checked,
      flattenNested: getElement("flattenNested").checked,
      includeHeaders: getElement("includeHeaders").checked,
      trimStrings: getElement("trimStrings").checked,
      arraysAsJson: getElement("arraysAsJson").checked
    };
  }

  async function readInputText() {
    const file = getElement("fileInput").files[0];
    if (file) return file.text();
    return getElement("jsonInput").value;
  }

  async function convertJson() {
    setBusy(true);
    setStatus("Converting...", "warning");
    state.warnings = [];

    try {
      const text = await readInputText();
      if (!text.trim()) throw new Error("Paste JSON or choose a .json file first.");

      const options = getOptions();
      const parsed = parseJsonInput(text, options.prettyValidate);
      const rows = normalizeRows(parsed);
      const result = buildCsv(rows, options);

      state.csvText = result.csv;
      getElement("csvOutput").value = result.csv;
      setSummary(result);
      setStatus(successMessage(result.rowCount), state.warnings.length ? "warning" : "success");
    } catch (error) {
      state.csvText = "";
      getElement("csvOutput").value = "";
      setSummary(null);
      setStatus(friendlyError(error), "error");
    } finally {
      setBusy(false);
    }
  }

  function friendlyError(error) {
    if (error instanceof SyntaxError) return "Invalid JSON. Check for missing commas, quotes, or brackets.";
    return error.message || "Could not convert this JSON.";
  }

  function successMessage(count) {
    const base = `Converted ${count} row${count === 1 ? "" : "s"} to CSV.`;
    return state.warnings.length ? `${base} Warning: ${state.warnings.join(" ")}` : base;
  }

  function setSummary(result) {
    const summary = getElement("summary");
    if (!result) {
      summary.textContent = "No CSV output yet.";
      return;
    }
    summary.textContent = `Output has ${result.rowCount} row${result.rowCount === 1 ? "" : "s"} and ${result.headers.length} column${result.headers.length === 1 ? "" : "s"}.`;
  }

  function setStatus(message, type) {
    window.setToolStatus("status", message, type);
  }

  function setBusy(isBusy) {
    getElement("convertBtn").disabled = isBusy;
  }

  async function copyOutput() {
    try {
      await window.copyTextToClipboard(getElement("csvOutput").value);
      setStatus("Copied CSV to clipboard.", "success");
    } catch (error) {
      setStatus(error.message || "Copy failed.", "error");
    }
  }

  function downloadCsv() {
    const output = getElement("csvOutput").value;
    if (!output) {
      setStatus("Convert JSON before downloading.", "warning");
      return;
    }
    window.downloadTextFile(output, "converted.csv", "text/csv;charset=utf-8");
    setStatus("Downloaded converted.csv.", "success");
  }

  function loadExample() {
    getElement("jsonInput").value = JSON.stringify([
      {
        name: "Alice",
        age: 30,
        address: { city: "Denver", zip: 80110 },
        contact: { email: "alice@example.com" },
        tags: ["lead", "newsletter"],
        note: "likes apples, oranges, and grapes"
      },
      {
        name: "Bob",
        age: 25,
        address: { city: "Chicago", zip: 60601 },
        contact: { email: "bob@example.com" },
        tags: ["trial"],
        note: "said \"hello\""
      }
    ], null, 2);
    getElement("fileInput").value = "";
    setStatus("Example loaded. Click Convert to preview CSV.", "success");
  }

  function clearTool() {
    getElement("jsonInput").value = "";
    getElement("fileInput").value = "";
    getElement("csvOutput").value = "";
    state.csvText = "";
    state.warnings = [];
    setSummary(null);
    setStatus("");
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function init() {
    if (!getElement("jsonInput")) return;
    getElement("convertBtn").addEventListener("click", convertJson);
    getElement("copyBtn").addEventListener("click", copyOutput);
    getElement("downloadBtn").addEventListener("click", downloadCsv);
    getElement("clearBtn").addEventListener("click", clearTool);
    getElement("exampleBtn").addEventListener("click", loadExample);
    setSummary(null);
  }

  window.JsonToCsv = {
    parseJsonInput,
    normalizeRows,
    flattenObject,
    collectHeaders,
    buildCsv,
    escapeCsvValue
  };

  document.addEventListener("DOMContentLoaded", init);
})();
