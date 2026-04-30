(function () {
  const state = {
    pdfFile: null,
    csv: "",
    lines: []
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function loadPdfFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type && file.type !== "application/pdf") {
      showWarning("Please choose a PDF file.");
      return;
    }
    state.pdfFile = file;
    showStats({ fileName: file.name, pages: 0, lines: 0, rows: 0 });
    showWarning("");
    setStatus("PDF loaded. Click Extract PDF.", "success");
  }

  async function extractPdfText(file) {
    if (!window.pdfjsLib) throw new Error("PDF.js did not load. Please refresh and try again.");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const bytes = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const allLines = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const lines = await extractPageLines(page, pageNumber);
      allLines.push(...lines);
      showStats({ fileName: file.name, pages: pageNumber, lines: allLines.length, rows: 0 });
      await yieldToBrowser();
    }

    return { pages: pdf.numPages, lines: allLines };
  }

  async function extractPageLines(page, pageNumber) {
    const textContent = await page.getTextContent();
    return groupTextItemsIntoLines(textContent.items, pageNumber);
  }

  function groupTextItemsIntoLines(items, pageNumber) {
    const buckets = new Map();
    const tolerance = 3;

    items.forEach((item) => {
      const x = item.transform[4];
      const y = item.transform[5];
      const key = Math.round(y / tolerance) * tolerance;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ x, text: item.str || "" });
    });

    return Array.from(buckets.entries())
      .sort((a, b) => b[0] - a[0])
      .map((entry, index) => ({
        page: pageNumber,
        line: index + 1,
        text: entry[1].sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").trim()
      }))
      .filter((line) => line.text);
  }

  function convertLinesToCsv(lines, options) {
    const rows = lines.map((line) => {
      const fields = [];
      if (options.includePage) fields.push(String(line.page));
      if (options.includeLine) fields.push(String(line.line));
      fields.push(...splitLineByMode(line.text, options));
      return fields;
    });
    return generateCsv(rows);
  }

  function splitLineByMode(text, options) {
    const value = options.trim ? text.trim() : text;
    if (options.mode === "text") return [value];
    if (options.mode === "table") return value.split(/\s{2,}|\t+/).map((cell) => options.trim ? cell.trim() : cell);
    const pattern = customDelimiterPattern(options.delimiter);
    return value.split(pattern).map((cell) => options.trim ? cell.trim() : cell);
  }

  function customDelimiterPattern(delimiter) {
    const value = delimiter || ",";
    if (value === "\\t" || value.toLowerCase() === "tab") return /\t+/;
    if (value === "2+ spaces" || value === "spaces") return /\s{2,}/;
    if (value.length === 1) return new RegExp(escapeRegex(value));
    return new RegExp(value);
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function escapeCsvValue(value) {
    const text = String(value ?? "");
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
    return text;
  }

  function generateCsv(rows) {
    return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  }

  async function runExtraction() {
    try {
      if (!state.pdfFile) throw new Error("Upload a PDF file first.");
      setStatus("Extracting PDF text...", "warning");
      showWarning("");
      const result = await extractPdfText(state.pdfFile);
      state.lines = result.lines;

      if (!result.lines.length) {
        state.csv = "";
        getElement("csvOutput").value = "";
        showStats({ fileName: state.pdfFile.name, pages: result.pages, lines: 0, rows: 0 });
        showWarning("This PDF may be scanned or image-based. OCR is not included in this tool.");
        setStatus("No text found.", "warning");
        return;
      }

      state.csv = convertLinesToCsv(result.lines, getOptions());
      getElement("csvOutput").value = state.csv;
      showStats({ fileName: state.pdfFile.name, pages: result.pages, lines: result.lines.length, rows: result.lines.length });
      setStatus("Extracted PDF text to CSV.", "success");
    } catch (error) {
      setStatus(error.message || "Could not extract this PDF.", "error");
    }
  }

  function getOptions() {
    return {
      mode: getElement("modeSelect").value,
      delimiter: getElement("customDelimiter").value,
      includePage: getElement("includePage").checked,
      includeLine: getElement("includeLine").checked,
      trim: getElement("trimWhitespace").checked
    };
  }

  async function copyToClipboard() {
    try {
      await window.copyTextToClipboard(getElement("csvOutput").value);
      setStatus("Copied CSV to clipboard.", "success");
    } catch (error) {
      setStatus(error.message || "Copy failed.", "error");
    }
  }

  function downloadFile() {
    const output = getElement("csvOutput").value;
    if (!output) {
      setStatus("Extract or load example before downloading.", "warning");
      return;
    }
    window.downloadTextFile(output, "pdf-extracted.csv", "text/csv;charset=utf-8");
    setStatus("Downloaded pdf-extracted.csv.", "success");
  }

  function loadExample() {
    state.pdfFile = null;
    state.lines = [
      { page: 1, line: 1, text: "Invoice 1001    A101    Widget    10.00" },
      { page: 1, line: 2, text: "Invoice 1002    A102    Part      15.00" }
    ];
    getElement("fileInput").value = "";
    getElement("modeSelect").value = "table";
    state.csv = convertLinesToCsv(state.lines, getOptions());
    getElement("csvOutput").value = state.csv;
    showStats({ fileName: "Example extracted lines", pages: 1, lines: 2, rows: 2 });
    showWarning("");
    setStatus("Example loaded.", "success");
  }

  function clearAll() {
    state.pdfFile = null;
    state.csv = "";
    state.lines = [];
    getElement("fileInput").value = "";
    getElement("csvOutput").value = "";
    showStats({ fileName: "None", pages: 0, lines: 0, rows: 0 });
    showWarning("");
    setStatus("");
  }

  function showStats(stats) {
    getElement("fileName").textContent = stats.fileName || "None";
    getElement("pagesProcessed").textContent = String(stats.pages || 0);
    getElement("linesExtracted").textContent = String(stats.lines || 0);
    getElement("rowsGenerated").textContent = String(stats.rows || 0);
  }

  function showWarning(message) {
    const warning = getElement("warningPanel");
    warning.textContent = message || "";
    warning.classList.toggle("hidden", !message);
  }

  function setStatus(message, type) {
    window.setToolStatus("status", message, type);
  }

  function yieldToBrowser() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function init() {
    if (!getElement("fileInput")) return;
    getElement("fileInput").addEventListener("change", loadPdfFile);
    getElement("extractBtn").addEventListener("click", runExtraction);
    getElement("copyBtn").addEventListener("click", copyToClipboard);
    getElement("downloadBtn").addEventListener("click", downloadFile);
    getElement("clearBtn").addEventListener("click", clearAll);
    getElement("exampleBtn").addEventListener("click", loadExample);
    showStats({ fileName: "None", pages: 0, lines: 0, rows: 0 });
  }

  window.PdfToCsv = {
    loadPdfFile,
    extractPdfText,
    extractPageLines,
    groupTextItemsIntoLines,
    convertLinesToCsv,
    splitLineByMode,
    escapeCsvValue,
    generateCsv,
    copyToClipboard,
    downloadFile,
    loadExample,
    clearAll,
    showStats,
    showWarning
  };

  document.addEventListener("DOMContentLoaded", init);
})();
