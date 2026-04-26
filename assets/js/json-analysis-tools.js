(function () {
  let validatorOutput = "";
  let diffOutput = "";

  function getElement(id) {
    return document.getElementById(id);
  }

  function parseJsonSafely(text) {
    try {
      return { ok: true, value: JSON.parse(text.trim()) };
    } catch (error) {
      return { ok: false, error };
    }
  }

  function extractErrorPosition(message) {
    const patterns = [
      /position\s+(\d+)/i,
      /at\s+position\s+(\d+)/i,
      /column\s+(\d+)/i
    ];
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) return Math.max(0, Number(match[1]) - (pattern.source.includes("column") ? 1 : 0));
    }
    return null;
  }

  function getLineColumn(text, position) {
    const before = text.slice(0, position);
    const lines = before.split(/\r\n|\r|\n/);
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1
    };
  }

  function getErrorContext(text, position) {
    const start = Math.max(0, position - 45);
    const end = Math.min(text.length, position + 45);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < text.length ? "..." : "";
    return `${prefix}${text.slice(start, end)}${suffix}`;
  }

  function validateJson(text) {
    const result = parseJsonSafely(text);
    if (result.ok) {
      return {
        ok: true,
        value: result.value,
        formatted: JSON.stringify(result.value, null, 2),
        stats: getJsonStats(result.value, text.trim().length)
      };
    }

    const position = extractErrorPosition(result.error.message);
    return {
      ok: false,
      message: result.error.message,
      position,
      location: position === null ? null : getLineColumn(text, position),
      context: position === null ? "" : getErrorContext(text, position)
    };
  }

  function getJsonStats(value, characters) {
    const rootType = Array.isArray(value) ? "array" : typeof value;
    const keys = isPlainObject(value) ? Object.keys(value).length : null;
    const length = Array.isArray(value) ? value.length : null;
    return { characters, rootType, keys, length };
  }

  function compareJson(left, right) {
    const diff = { added: [], removed: [], changed: [], typeChanged: [] };
    compareValues(left, right, "", diff);
    return diff;
  }

  function compareValues(left, right, path, diff) {
    if (getType(left) !== getType(right)) {
      diff.typeChanged.push({ path: formatPath(path), left, right, leftType: getType(left), rightType: getType(right) });
      return;
    }
    if (Array.isArray(left)) {
      compareArrays(left, right, path, diff);
      return;
    }
    if (isPlainObject(left)) {
      compareObjects(left, right, path, diff);
      return;
    }
    if (!Object.is(left, right)) {
      diff.changed.push({ path: formatPath(path), left, right });
    }
  }

  function compareObjects(left, right, path, diff) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    keys.forEach((key) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (!Object.prototype.hasOwnProperty.call(left, key)) {
        diff.added.push({ path: nextPath, value: right[key] });
      } else if (!Object.prototype.hasOwnProperty.call(right, key)) {
        diff.removed.push({ path: nextPath, value: left[key] });
      } else {
        compareValues(left[key], right[key], nextPath, diff);
      }
    });
  }

  function compareArrays(left, right, path, diff) {
    const max = Math.max(left.length, right.length);
    for (let index = 0; index < max; index += 1) {
      const nextPath = `${path || "root"}[${index}]`;
      if (index >= left.length) {
        diff.added.push({ path: nextPath, value: right[index] });
      } else if (index >= right.length) {
        diff.removed.push({ path: nextPath, value: left[index] });
      } else {
        compareValues(left[index], right[index], nextPath, diff);
      }
    }
  }

  function formatPath(path) {
    return path || "root";
  }

  function stringifyValue(value) {
    if (typeof value === "string") return `"${value}"`;
    return JSON.stringify(value);
  }

  function formatDiff(diff) {
    const lines = [];
    addDiffSection(lines, "Changed", diff.changed, (item) => `${item.path}: ${stringifyValue(item.left)} -> ${stringifyValue(item.right)}`);
    addDiffSection(lines, "Type changes", diff.typeChanged, (item) => `${item.path}: ${item.leftType} -> ${item.rightType}`);
    addDiffSection(lines, "Added", diff.added, (item) => `${item.path}: ${stringifyValue(item.value)}`);
    addDiffSection(lines, "Removed", diff.removed, (item) => `${item.path}: ${stringifyValue(item.value)}`);
    return lines.length ? lines.join("\n") : "No differences found.";
  }

  function addDiffSection(lines, title, items, formatter) {
    if (!items.length) return;
    lines.push(`${title}:`);
    items.forEach((item) => lines.push(`- ${formatter(item)}`));
    lines.push("");
  }

  async function readFileOrText(fileId, textId) {
    const file = getElement(fileId).files[0];
    if (file) return file.text();
    return getElement(textId).value;
  }

  async function runValidator() {
    setStatus("validatorStatus", "Validating...", "warning");
    const text = await readFileOrText("fileInput", "jsonInput");
    if (!text.trim()) {
      setStatus("validatorStatus", "Paste JSON or choose a .json file first.", "warning");
      return;
    }
    const result = validateJson(text);
    if (result.ok) {
      validatorOutput = result.formatted;
      getElement("formattedOutput").value = result.formatted;
      getElement("resultPanel").textContent = formatValidationSuccess(result.stats);
      setStatus("validatorStatus", "Valid JSON.", "success");
    } else {
      validatorOutput = "";
      getElement("formattedOutput").value = "";
      getElement("resultPanel").textContent = formatValidationError(result);
      setStatus("validatorStatus", "Invalid JSON.", "error");
    }
  }

  function formatValidationSuccess(stats) {
    const lines = [
      "Valid JSON",
      `Character count: ${stats.characters.toLocaleString()}`,
      `Root type: ${stats.rootType}`
    ];
    if (stats.keys !== null) lines.push(`Top-level keys: ${stats.keys}`);
    if (stats.length !== null) lines.push(`Array length: ${stats.length}`);
    return lines.join("\n");
  }

  function formatValidationError(result) {
    const lines = ["Invalid JSON", `Error: ${result.message}`];
    if (result.position !== null && result.location) {
      lines.push(`Approximate position: character ${result.position + 1}`);
      lines.push(`Line: ${result.location.line}, Column: ${result.location.column}`);
      lines.push("Context:");
      lines.push(result.context);
    }
    return lines.join("\n");
  }

  async function runDiff() {
    setStatus("diffStatus", "Comparing...", "warning");
    const leftText = await readFileOrText("leftFileInput", "leftJsonInput");
    const rightText = await readFileOrText("rightFileInput", "rightJsonInput");
    const left = parseJsonSafely(leftText);
    const right = parseJsonSafely(rightText);

    if (!leftText.trim() || !rightText.trim()) {
      setStatus("diffStatus", "Paste or upload JSON on both sides first.", "warning");
      return;
    }
    if (!left.ok) {
      showDiffParseError("Left JSON", left.error, leftText);
      return;
    }
    if (!right.ok) {
      showDiffParseError("Right JSON", right.error, rightText);
      return;
    }

    const diff = compareJson(left.value, right.value);
    diffOutput = formatDiff(diff);
    getElement("diffOutput").value = diffOutput;
    getElement("diffJsonOutput").value = JSON.stringify(diff, null, 2);
    setStatus("diffStatus", diffOutput === "No differences found." ? "JSON documents match." : "JSON differences found.", diffOutput === "No differences found." ? "success" : "warning");
  }

  function showDiffParseError(label, error, text) {
    const position = extractErrorPosition(error.message);
    const location = position === null ? "" : ` Line ${getLineColumn(text, position).line}, column ${getLineColumn(text, position).column}.`;
    diffOutput = `${label} is invalid. ${error.message}.${location}`;
    getElement("diffOutput").value = diffOutput;
    getElement("diffJsonOutput").value = "";
    setStatus("diffStatus", `${label} is invalid.`, "error");
  }

  async function copyOutput(targetId, statusId) {
    try {
      await window.copyTextToClipboard(getElement(targetId).value);
      setStatus(statusId, "Copied output to clipboard.", "success");
    } catch (error) {
      setStatus(statusId, error.message || "Copy failed.", "error");
    }
  }

  function downloadOutput(targetId, filename, statusId) {
    const output = getElement(targetId).value;
    if (!output) {
      setStatus(statusId, "Run the tool before downloading.", "warning");
      return;
    }
    window.downloadTextFile(output, filename, filename.endsWith(".json") ? "application/json;charset=utf-8" : "text/plain;charset=utf-8");
    setStatus(statusId, `Downloaded ${filename}.`, "success");
  }

  function loadValidatorExample() {
    getElement("jsonInput").value = "{\n  \"name\": \"Alice\",\n  \"age\": 30,\n}";
    getElement("fileInput").value = "";
    getElement("formattedOutput").value = "";
    getElement("resultPanel").textContent = "Example loaded. Validate to see the error details.";
    setStatus("validatorStatus", "Invalid JSON example loaded.", "success");
  }

  function loadDiffExample() {
    getElement("leftJsonInput").value = "{\n  \"name\": \"Alice\",\n  \"age\": 30,\n  \"address\": {\n    \"city\": \"Denver\"\n  },\n  \"items\": [{\"name\":\"Book\"}]\n}";
    getElement("rightJsonInput").value = "{\n  \"name\": \"Alice\",\n  \"age\": 31,\n  \"address\": {\n    \"city\": \"Chicago\"\n  },\n  \"active\": true,\n  \"items\": [{\"name\":\"Pen\"}]\n}";
    getElement("leftFileInput").value = "";
    getElement("rightFileInput").value = "";
    getElement("diffOutput").value = "";
    getElement("diffJsonOutput").value = "";
    setStatus("diffStatus", "Diff example loaded.", "success");
  }

  function clearTool() {
    document.querySelectorAll("textarea").forEach((textarea) => { textarea.value = ""; });
    document.querySelectorAll("input[type='file']").forEach((input) => { input.value = ""; });
    const panel = getElement("resultPanel");
    if (panel) panel.textContent = "No validation result yet.";
    validatorOutput = "";
    diffOutput = "";
    setStatus("validatorStatus", "");
    setStatus("diffStatus", "");
  }

  function setStatus(id, message, type) {
    window.setToolStatus(id, message, type);
  }

  function getType(value) {
    if (Array.isArray(value)) return "array";
    if (value === null) return "null";
    return typeof value;
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function initValidator() {
    if (!getElement("validateBtn")) return;
    getElement("validateBtn").addEventListener("click", runValidator);
    getElement("copyBtn").addEventListener("click", () => copyOutput("formattedOutput", "validatorStatus"));
    getElement("downloadBtn").addEventListener("click", () => downloadOutput("formattedOutput", "validated.json", "validatorStatus"));
    getElement("clearBtn").addEventListener("click", clearTool);
    getElement("exampleBtn").addEventListener("click", loadValidatorExample);
  }

  function initDiff() {
    if (!getElement("compareBtn")) return;
    getElement("compareBtn").addEventListener("click", runDiff);
    getElement("copyBtn").addEventListener("click", () => copyOutput("diffOutput", "diffStatus"));
    getElement("downloadBtn").addEventListener("click", () => downloadOutput("diffOutput", "json-diff.txt", "diffStatus"));
    getElement("clearBtn").addEventListener("click", clearTool);
    getElement("exampleBtn").addEventListener("click", loadDiffExample);
  }

  window.JsonAnalysisTools = {
    parseJsonSafely,
    extractErrorPosition,
    getLineColumn,
    getErrorContext,
    validateJson,
    compareJson,
    compareValues,
    compareObjects,
    compareArrays,
    formatPath,
    stringifyValue
  };

  document.addEventListener("DOMContentLoaded", () => {
    initValidator();
    initDiff();
  });
})();
