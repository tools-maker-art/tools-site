(function () {
  const state = {
    chunks: [],
    warnings: []
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function parseCsv(text) {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized.split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    if (lines.length < 2) throw new Error("Add a header row and at least one data row.");
    return {
      header: lines[0],
      rows: lines.slice(1)
    };
  }

  function buildCsvChunk(parts) {
    return [parts.header].concat(parts.rows).join("\n") + "\n";
  }

  function calculateSize(text) {
    return new Blob([text]).size;
  }

  function createChunk(csv, index) {
    return {
      csv,
      name: `chunk_${index + 1}.csv`,
      size: calculateSize(csv),
      preview: csv.split(/\n/).slice(0, 6).join("\n").trim()
    };
  }

  async function splitByLines(parsed, linesPerFile, onProgress) {
    const chunks = [];
    for (let start = 0; start < parsed.rows.length; start += linesPerFile) {
      const rows = parsed.rows.slice(start, start + linesPerFile);
      const csv = buildCsvChunk({ header: parsed.header, rows });
      chunks.push(createChunk(csv, chunks.length));
      if (onProgress) onProgress(Math.min(start + linesPerFile, parsed.rows.length), parsed.rows.length);
      await yieldToBrowser();
    }
    return chunks;
  }

  function findRowsThatFit(context) {
    let low = 1;
    let high = context.rows.length - context.start;
    let best = 0;

    while (low <= high) {
      const count = Math.floor((low + high) / 2);
      const rows = context.rows.slice(context.start, context.start + count);
      const csv = buildCsvChunk({ header: context.header, rows });
      const size = calculateSize(csv);

      if (size <= context.limitBytes) {
        best = count;
        low = count + 1;
      } else {
        high = count - 1;
      }
    }

    return best;
  }

  async function splitBySize(parsed, limitBytes, onProgress) {
    const chunks = [];
    let start = 0;

    while (start < parsed.rows.length) {
      const count = findRowsThatFit({
        header: parsed.header,
        rows: parsed.rows,
        start,
        limitBytes
      });

      const safeCount = count || 1;
      const rows = parsed.rows.slice(start, start + safeCount);
      const csv = buildCsvChunk({ header: parsed.header, rows });
      const chunk = createChunk(csv, chunks.length);
      chunks.push(chunk);

      if (!count) {
        state.warnings.push(`${chunk.name} is larger than the selected size because one row cannot fit inside the limit with the header.`);
      }

      start += safeCount;
      if (onProgress) onProgress(start, parsed.rows.length);
      await yieldToBrowser();
    }

    return chunks;
  }

  function yieldToBrowser() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function validateOptions(mode) {
    if (mode === "size") {
      const maxKb = Number(getElement("maxSizeKb").value);
      if (!Number.isFinite(maxKb) || maxKb <= 0) throw new Error("Enter a max size greater than 0 KB.");
      return Math.floor(maxKb * 1024);
    }

    const lines = Number.parseInt(getElement("linesPerFile").value, 10);
    if (!Number.isFinite(lines) || lines <= 0) throw new Error("Enter lines per file greater than 0.");
    return lines;
  }

  function getSelectedMode() {
    const selected = document.querySelector("input[name='splitMode']:checked");
    return selected ? selected.value : "size";
  }

  function setBusy(isBusy) {
    getElement("splitBtn").disabled = isBusy;
    getElement("downloadAllBtn").disabled = isBusy || state.chunks.length === 0;
  }

  function setStatus(message, type) {
    window.setToolStatus("status", message, type);
  }

  function setProgress(message) {
    const progress = getElement("progress");
    if (progress) progress.textContent = message || "";
  }

  function renderChunks() {
    const summary = getElement("summary");
    const output = getElement("chunkList");
    const count = state.chunks.length;
    summary.textContent = count ? `Generated ${count} file${count === 1 ? "" : "s"}.` : "No files generated yet.";
    output.innerHTML = state.chunks.map((chunk, index) => `
      <article class="chunk-card">
        <header>
          <div>
            <h3>${chunk.name}</h3>
            <span class="badge">${formatBytes(chunk.size)}</span>
          </div>
          <button type="button" data-download-index="${index}">Download</button>
        </header>
        <pre class="chunk-preview">${escapeHtml(chunk.preview || "(empty chunk)")}</pre>
      </article>
    `).join("");
    getElement("downloadAllBtn").disabled = count === 0;
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  async function readFileInput() {
    const file = getElement("fileInput").files[0];
    if (!file) return "";
    return file.text();
  }

  async function getInputText() {
    const fileText = await readFileInput();
    const pasted = getElement("csvInput").value;
    return fileText || pasted;
  }

  async function splitCsv() {
    setBusy(true);
    state.chunks = [];
    state.warnings = [];
    renderChunks();
    setStatus("Processing...", "warning");
    setProgress("");

    try {
      const text = await getInputText();
      if (!text.trim()) throw new Error("Paste CSV text or choose a .csv file first.");

      const parsed = parseCsv(text);
      const mode = getSelectedMode();
      const option = validateOptions(mode);

      if (mode === "lines") {
        state.chunks = await splitByLines(parsed, option, (done, total) => {
          setProgress(`Processed ${done.toLocaleString()} of ${total.toLocaleString()} rows.`);
        });
      } else {
        state.chunks = await splitBySize(parsed, option, (done, total) => {
          setProgress(`Processed ${done.toLocaleString()} of ${total.toLocaleString()} rows.`);
        });
      }

      renderChunks();
      const warning = state.warnings.length ? ` ${state.warnings.join(" ")}` : "";
      setStatus(`Split into ${state.chunks.length} files.${warning}`, state.warnings.length ? "warning" : "success");
      setProgress("");
    } catch (error) {
      state.chunks = [];
      renderChunks();
      setStatus(error.message || "Could not split this CSV.", "error");
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  function downloadChunk(index) {
    const chunk = state.chunks[index];
    if (!chunk) return;
    window.downloadTextFile(chunk.csv, chunk.name, "text/csv;charset=utf-8");
  }

  async function downloadAll() {
    if (!state.chunks.length) {
      setStatus("Split the CSV before downloading.", "warning");
      return;
    }

    for (let index = 0; index < state.chunks.length; index += 1) {
      downloadChunk(index);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    setStatus(`Started downloads for ${state.chunks.length} files.`, "success");
  }

  function clearAll() {
    getElement("csvInput").value = "";
    getElement("fileInput").value = "";
    state.chunks = [];
    state.warnings = [];
    renderChunks();
    setStatus("");
    setProgress("");
  }

  function syncOptionVisibility() {
    const mode = getSelectedMode();
    getElement("sizeOptions").classList.toggle("hidden", mode !== "size");
    getElement("lineOptions").classList.toggle("hidden", mode !== "lines");
  }

  function init() {
    if (!getElement("csvInput")) return;
    document.querySelectorAll("input[name='splitMode']").forEach((input) => {
      input.addEventListener("change", syncOptionVisibility);
    });
    getElement("splitBtn").addEventListener("click", splitCsv);
    getElement("downloadAllBtn").addEventListener("click", downloadAll);
    getElement("clearBtn").addEventListener("click", clearAll);
    getElement("chunkList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-download-index]");
      if (button) downloadChunk(Number(button.dataset.downloadIndex));
    });
    syncOptionVisibility();
    renderChunks();
  }

  window.CsvSplitter = {
    parseCsv,
    splitByLines,
    splitBySize,
    buildCsvChunk,
    calculateSize
  };

  document.addEventListener("DOMContentLoaded", init);
})();
