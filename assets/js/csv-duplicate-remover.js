(function () {
  const state = {
    cleanCsv: "",
    duplicatesCsv: "",
    headers: []
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function parseCsv(text) {
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    const rows = lines.map(parseCsvLine);
    if (rows.length < 2) throw new Error("Add a header row and at least one data row.");
    return {
      header: rows[0],
      rows: rows.slice(1)
    };
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

  function removeDuplicates(parsed, options) {
    const seen = new Set();
    const kept = [];
    const duplicates = [];
    const columnIndex = Number(options.columnIndex);

    parsed.rows.forEach((row) => {
      const key = options.mode === "column"
        ? buildColumnKey(row, columnIndex, options)
        : buildRowKey(row, options);

      if (seen.has(key)) {
        duplicates.push(row);
      } else {
        seen.add(key);
        kept.push(row);
      }
    });

    return { header: parsed.header, kept, duplicates };
  }

  function normalizeValue(value, options) {
    let normalized = String(value ?? "");
    if (options.trim) normalized = normalized.trim();
    if (options.collapseSpaces) normalized = normalized.replace(/\s+/g, " ");
    if (options.ignoreCase) normalized = normalized.toLowerCase();
    return normalized;
  }

  function buildRowKey(row, options) {
    return row.map((value) => normalizeValue(value, options)).join("\u001f");
  }

  function buildColumnKey(row, columnIndex, options) {
    return normalizeValue(row[columnIndex] ?? "", options);
  }

  function buildCsv(header, rows) {
    return [header].concat(rows).map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  }

  function escapeCsvValue(value) {
    const text = String(value ?? "");
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
    return text;
  }

  function updateColumnDropdown(headers) {
    const select = getElement("columnSelect");
    select.innerHTML = headers.map((header, index) => {
      const label = header || `Column ${index + 1}`;
      return `<option value="${index}">${escapeHtml(label)}</option>`;
    }).join("");
    select.disabled = headers.length === 0;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getOptions() {
    return {
      trim: getElement("trimSpaces").checked,
      collapseSpaces: getElement("collapseSpaces").checked,
      ignoreCase: getElement("ignoreCase").checked,
      mode: getCheckedValue("dedupeMode", "row"),
      columnIndex: getElement("columnSelect").value || "0"
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

  async function runDuplicateRemoval() {
    setStatus("Processing...", "warning");
    try {
      const text = await readInputText();
      if (!text.trim()) throw new Error("Paste CSV text or choose a .csv file first.");

      const parsed = parseCsv(text);
      state.headers = parsed.header;
      updateColumnDropdown(parsed.header);

      const result = removeDuplicates(parsed, getOptions());
      state.cleanCsv = buildCsv(result.header, result.kept);
      state.duplicatesCsv = result.duplicates.length ? buildCsv(result.header, result.duplicates) : "";

      getElement("cleanOutput").value = state.cleanCsv;
      getElement("duplicatesOutput").value = state.duplicatesCsv;
      updateStats(parsed.rows.length, result.duplicates.length, result.kept.length);
      setStatus(`Removed ${result.duplicates.length} duplicate row${result.duplicates.length === 1 ? "" : "s"}.`, "success");
    } catch (error) {
      state.cleanCsv = "";
      state.duplicatesCsv = "";
      getElement("cleanOutput").value = "";
      getElement("duplicatesOutput").value = "";
      updateStats(0, 0, 0);
      setStatus(error.message || "Could not process this CSV.", "error");
    }
  }

  function updateStats(total, removed, remaining) {
    getElement("totalRows").textContent = total.toLocaleString();
    getElement("duplicateRows").textContent = removed.toLocaleString();
    getElement("remainingRows").textContent = remaining.toLocaleString();
  }

  async function copyCleanCsv() {
    try {
      await window.copyTextToClipboard(getElement("cleanOutput").value);
      setStatus("Copied clean CSV to clipboard.", "success");
    } catch (error) {
      setStatus(error.message || "Copy failed.", "error");
    }
  }

  function downloadCleanCsv() {
    downloadCsv("cleanOutput", "cleaned.csv");
  }

  function downloadDuplicates() {
    downloadCsv("duplicatesOutput", "removed-duplicates.csv");
  }

  function downloadCsv(targetId, filename) {
    const output = getElement(targetId).value;
    if (!output) {
      setStatus("Nothing to download yet.", "warning");
      return;
    }
    window.downloadTextFile(output, filename, "text/csv;charset=utf-8");
    setStatus(`Downloaded ${filename}.`, "success");
  }

  function loadExample() {
    getElement("csvInput").value = [
      "name,city,note",
      "Alice,Denver,\"likes apples, oranges\"",
      " Alice , Denver ,\"likes apples, oranges\"",
      "Alice, Denver,\"likes apples, oranges\"",
      "Bob,Chicago,\"said \"\"hello\"\"\"",
      "bob, Chicago,\"said \"\"hello\"\"\""
    ].join("\n");
    getElement("fileInput").value = "";
    getElement("trimSpaces").checked = true;
    getElement("collapseSpaces").checked = true;
    setStatus("Example loaded. Click Remove Duplicates.", "success");
    try {
      updateColumnDropdown(parseCsv(getElement("csvInput").value).header);
    } catch {
      updateColumnDropdown([]);
    }
  }

  function clearTool() {
    getElement("csvInput").value = "";
    getElement("fileInput").value = "";
    getElement("cleanOutput").value = "";
    getElement("duplicatesOutput").value = "";
    state.cleanCsv = "";
    state.duplicatesCsv = "";
    state.headers = [];
    updateColumnDropdown([]);
    updateStats(0, 0, 0);
    setStatus("");
  }

  function syncColumnMode() {
    const columnMode = getCheckedValue("dedupeMode", "row") === "column";
    getElement("columnSelectWrap").classList.toggle("hidden", !columnMode);
  }

  function setStatus(message, type) {
    window.setToolStatus("status", message, type);
  }

  function init() {
    if (!getElement("csvInput")) return;
    getElement("removeBtn").addEventListener("click", runDuplicateRemoval);
    getElement("copyBtn").addEventListener("click", copyCleanCsv);
    getElement("downloadCleanBtn").addEventListener("click", downloadCleanCsv);
    getElement("downloadDuplicatesBtn").addEventListener("click", downloadDuplicates);
    getElement("clearBtn").addEventListener("click", clearTool);
    getElement("exampleBtn").addEventListener("click", loadExample);
    document.querySelectorAll("input[name='dedupeMode']").forEach((input) => input.addEventListener("change", syncColumnMode));
    getElement("csvInput").addEventListener("input", () => {
      try {
        updateColumnDropdown(parseCsv(getElement("csvInput").value).header);
      } catch {
        updateColumnDropdown([]);
      }
    });
    getElement("fileInput").addEventListener("change", async () => {
      try {
        updateColumnDropdown(parseCsv(await readInputText()).header);
      } catch {
        updateColumnDropdown([]);
      }
    });
    updateColumnDropdown([]);
    syncColumnMode();
    updateStats(0, 0, 0);
  }

  window.CsvDuplicateRemover = {
    parseCsv,
    parseCsvLine,
    removeDuplicates,
    normalizeValue,
    buildRowKey,
    buildColumnKey,
    buildCsv,
    escapeCsvValue,
    updateColumnDropdown,
    copyCleanCsv,
    downloadCleanCsv,
    downloadDuplicates,
    loadExample,
    clearTool
  };

  document.addEventListener("DOMContentLoaded", init);
})();
