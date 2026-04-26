(function () {
  const state = {
    jsonText: "",
    warnings: []
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];

      if (char === "\"") {
        if (quoted && next === "\"") {
          field += "\"";
          index += 1;
        } else {
          quoted = !quoted;
        }
        continue;
      }

      if (char === "," && !quoted) {
        row.push(field);
        field = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !quoted) {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        if (char === "\r" && next === "\n") index += 1;
        continue;
      }

      field += char;
    }

    if (quoted) throw new Error("A quoted CSV field is not closed.");
    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function csvRowsToObjects(rows, options) {
    const cleanRows = options.ignoreEmptyRows ? rows.filter((row) => !isEmptyRow(row)) : rows;
    if (cleanRows.length < 2) throw new Error("Add a header row and at least one data row.");

    const headers = cleanRows[0].map((header) => options.trimSpaces ? header.trim() : header);
    validateHeaders(headers);

    return cleanRows.slice(1).map((row) => {
      const values = normalizeRow(row, headers.length);
      if (options.mode === "nested") return convertRowToNestedObject(headers, values, options);
      return convertRowToFlatObject(headers, values, options);
    });
  }

  function validateHeaders(headers) {
    const missing = headers.findIndex((header) => !header);
    if (missing !== -1) throw new Error(`Header ${missing + 1} is empty. Add a column name before converting.`);
  }

  function normalizeRow(row, length) {
    const values = row.slice(0, length);
    while (values.length < length) values.push("");
    return values;
  }

  function convertRowToFlatObject(headers, values, options) {
    const object = {};
    headers.forEach((header, index) => {
      const key = options.trimSpaces ? header.trim() : header;
      object[key] = parseValue(values[index], options);
    });
    return object;
  }

  function convertRowToNestedObject(headers, values, options) {
    const object = {};
    headers.forEach((header, index) => {
      const key = options.trimSpaces ? header.trim() : header;
      const value = parseValue(values[index], options);
      setNestedValue(object, key, value);
    });
    return object;
  }

  function setNestedValue(object, header, value) {
    const parts = header.split(".").filter(Boolean);
    if (parts.length <= 1) {
      if (Object.prototype.hasOwnProperty.call(object, header)) {
        addWarning(`Duplicate key "${header}" detected. The first value was kept.`);
        return;
      }
      object[header] = value;
      return;
    }

    let current = object;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      const last = index === parts.length - 1;

      if (last) {
        if (Object.prototype.hasOwnProperty.call(current, part)) {
          addWarning(`Nested key conflict detected at "${header}". The first value was kept.`);
          return;
        }
        current[part] = value;
        return;
      }

      if (!Object.prototype.hasOwnProperty.call(current, part)) {
        current[part] = {};
      } else if (!isPlainObject(current[part])) {
        addWarning(`Nested key conflict detected at "${header}" because "${parts.slice(0, index + 1).join(".")}" is already a value. The first value was kept.`);
        return;
      }

      current = current[part];
    }
  }

  function parseValue(value, options) {
    const text = options.trimSpaces ? value.trim() : value;
    if (!options.autoTypes || text === "") return text;
    if (/^-?(?:\d+|\d*\.\d+)$/.test(text)) return Number(text);
    if (text.toLowerCase() === "true") return true;
    if (text.toLowerCase() === "false") return false;
    return text;
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function isEmptyRow(row) {
    return row.every((field) => field.trim() === "");
  }

  function addWarning(message) {
    if (!state.warnings.includes(message)) state.warnings.push(message);
  }

  function getOptions() {
    return {
      mode: getCheckedValue("conversionMode", "flat"),
      autoTypes: getElement("autoTypes").checked,
      trimSpaces: getElement("trimSpaces").checked,
      ignoreEmptyRows: getElement("ignoreEmptyRows").checked,
      prettyPrint: getElement("prettyPrint").checked
    };
  }

  function getCheckedValue(name, fallback) {
    const selected = document.querySelector(`input[name="${name}"]:checked`);
    return selected ? selected.value : fallback;
  }

  async function readInputText() {
    const file = getElement("fileInput").files[0];
    if (file) return file.text();
    return getElement("csvInput").value;
  }

  async function convertCsv() {
    setBusy(true);
    setStatus("Converting...", "warning");
    state.warnings = [];

    try {
      const text = await readInputText();
      if (!text.trim()) throw new Error("Paste CSV text or choose a .csv file first.");

      const rows = parseCsv(text);
      const objects = csvRowsToObjects(rows, getOptions());
      state.jsonText = stringifyJson(objects, getOptions().prettyPrint);
      getElement("jsonOutput").value = state.jsonText;
      setSummary(objects.length);
      setStatus(successMessage(objects.length), state.warnings.length ? "warning" : "success");
    } catch (error) {
      state.jsonText = "";
      getElement("jsonOutput").value = "";
      setSummary(0);
      setStatus(error.message || "Could not convert this CSV.", "error");
    } finally {
      setBusy(false);
    }
  }

  function stringifyJson(objects, prettyPrint) {
    return JSON.stringify(objects, null, prettyPrint ? 2 : 0);
  }

  function successMessage(count) {
    const base = `Converted ${count} row${count === 1 ? "" : "s"} to JSON.`;
    return state.warnings.length ? `${base} Warning: ${state.warnings.join(" ")}` : base;
  }

  function setSummary(count) {
    const summary = getElement("summary");
    summary.textContent = count ? `Output contains ${count} JSON object${count === 1 ? "" : "s"}.` : "No JSON output yet.";
  }

  function setStatus(message, type) {
    window.setToolStatus("status", message, type);
  }

  function setBusy(isBusy) {
    getElement("convertBtn").disabled = isBusy;
  }

  async function copyOutput() {
    try {
      const output = getElement("jsonOutput").value;
      await window.copyTextToClipboard(output);
      setStatus("Copied JSON to clipboard.", "success");
    } catch (error) {
      setStatus(error.message || "Copy failed.", "error");
    }
  }

  function downloadJson() {
    const output = getElement("jsonOutput").value;
    if (!output) {
      setStatus("Convert CSV before downloading.", "warning");
      return;
    }
    window.downloadTextFile(output, "converted.json", "application/json;charset=utf-8");
    setStatus("Downloaded converted.json.", "success");
  }

  function loadExample() {
    getElement("csvInput").value = [
      "name,address.city,address.zip,contact.email,active,note",
      "Alice,Denver,80110,alice@example.com,true,\"likes apples, oranges, and grapes\"",
      "Bob,Chicago,60601,bob@example.com,false,\"said \"\"hello\"\"\""
    ].join("\n");
    getElement("fileInput").value = "";
    setMode("nested");
    setStatus("Nested example loaded. Click Convert to preview JSON.", "success");
  }

  function setMode(mode) {
    const input = document.querySelector(`input[name="conversionMode"][value="${mode}"]`);
    if (input) input.checked = true;
  }

  function clearTool() {
    getElement("csvInput").value = "";
    getElement("fileInput").value = "";
    getElement("jsonOutput").value = "";
    state.jsonText = "";
    state.warnings = [];
    setSummary(0);
    setStatus("");
  }

  function init() {
    if (!getElement("csvInput")) return;
    getElement("convertBtn").addEventListener("click", convertCsv);
    getElement("copyBtn").addEventListener("click", copyOutput);
    getElement("downloadBtn").addEventListener("click", downloadJson);
    getElement("clearBtn").addEventListener("click", clearTool);
    getElement("exampleBtn").addEventListener("click", loadExample);
    setSummary(0);
  }

  window.CsvToJson = {
    parseCsv,
    csvRowsToObjects,
    convertRowToFlatObject,
    convertRowToNestedObject,
    setNestedValue,
    parseValue
  };

  document.addEventListener("DOMContentLoaded", init);
})();
