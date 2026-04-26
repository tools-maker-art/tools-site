(function () {
  const examples = {
    pretty: "{\"name\":\"Alice\",\"age\":30,\"address\":{\"city\":\"Denver\"},\"active\":true}",
    minify: [
      "{",
      "  \"name\": \"Alice\",",
      "  \"age\": 30,",
      "  \"address\": {",
      "    \"city\": \"Denver\"",
      "  }",
      "}"
    ].join("\n")
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function parseJsonInput(text) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Paste JSON or choose a .json file first.");
    return JSON.parse(trimmed);
  }

  function prettyPrintJson(data) {
    return JSON.stringify(data, null, 2);
  }

  function minifyJson(data) {
    return JSON.stringify(data);
  }

  function getMode() {
    return document.body.dataset.jsonToolMode || "pretty";
  }

  async function readInputText() {
    const file = getElement("fileInput").files[0];
    if (file) return file.text();
    return getElement("jsonInput").value;
  }

  async function runTool() {
    setBusy(true);
    setStatus(getMode() === "pretty" ? "Formatting..." : "Minifying...", "warning");

    try {
      const input = await readInputText();
      const originalSize = input.trim().length;
      const parsed = parseJsonInput(input);
      const output = getMode() === "pretty" ? prettyPrintJson(parsed) : minifyJson(parsed);
      getElement("jsonOutput").value = output;
      updateCounts(originalSize, output.length);
      setStatus(getMode() === "pretty" ? "Formatted successfully." : "Minified successfully.", "success");
    } catch (error) {
      getElement("jsonOutput").value = "";
      updateCounts(0, 0);
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  function showError(error) {
    const message = error instanceof SyntaxError ? enhanceSyntaxError(error.message) : error.message;
    setStatus(message || "Invalid JSON.", "error");
  }

  function enhanceSyntaxError(message) {
    const match = message.match(/position\s+(\d+)/i);
    if (match) return `Invalid JSON near character ${Number(match[1]) + 1}. Check nearby commas, quotes, or brackets.`;
    return "Invalid JSON. Check commas, quotes, brackets, and trailing commas.";
  }

  async function copyOutput() {
    try {
      await window.copyTextToClipboard(getElement("jsonOutput").value);
      setStatus("Copied output to clipboard.", "success");
    } catch (error) {
      setStatus(error.message || "Copy failed.", "error");
    }
  }

  function downloadJson() {
    const output = getElement("jsonOutput").value;
    if (!output) {
      setStatus("Run the tool before downloading.", "warning");
      return;
    }
    const filename = getMode() === "pretty" ? "formatted.json" : "minified.json";
    window.downloadTextFile(output, filename, "application/json;charset=utf-8");
    setStatus(`Downloaded ${filename}.`, "success");
  }

  function loadExample() {
    const mode = getMode();
    getElement("jsonInput").value = examples[mode] || examples.pretty;
    getElement("fileInput").value = "";
    getElement("jsonOutput").value = "";
    updateCounts(getElement("jsonInput").value.length, 0);
    setStatus("Example loaded.", "success");
  }

  function clearTool() {
    getElement("jsonInput").value = "";
    getElement("fileInput").value = "";
    getElement("jsonOutput").value = "";
    updateCounts(0, 0);
    setStatus("");
  }

  function updateCounts(original, output) {
    const originalElement = getElement("originalCount");
    const outputElement = getElement("outputCount");
    if (originalElement) originalElement.textContent = `${original.toLocaleString()} chars`;
    if (outputElement) outputElement.textContent = `${output.toLocaleString()} chars`;
  }

  function setStatus(message, type) {
    window.setToolStatus("status", message, type);
  }

  function setBusy(isBusy) {
    getElement("runBtn").disabled = isBusy;
  }

  function init() {
    if (!getElement("jsonInput")) return;
    getElement("runBtn").addEventListener("click", runTool);
    getElement("copyBtn").addEventListener("click", copyOutput);
    getElement("downloadBtn").addEventListener("click", downloadJson);
    getElement("clearBtn").addEventListener("click", clearTool);
    getElement("exampleBtn").addEventListener("click", loadExample);
    getElement("jsonInput").addEventListener("input", () => {
      updateCounts(getElement("jsonInput").value.trim().length, getElement("jsonOutput").value.length);
    });
    updateCounts(0, 0);
  }

  window.JsonTools = {
    parseJsonInput,
    prettyPrintJson,
    minifyJson,
    copyOutput,
    downloadJson,
    loadExample,
    clearTool,
    showError
  };

  document.addEventListener("DOMContentLoaded", init);
})();
