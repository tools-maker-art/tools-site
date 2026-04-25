(function () {
  const textDecoder = new TextDecoder("utf-8", { fatal: false });
  const textEncoder = new TextEncoder();
  let latestOutput = "";
  let latestDetection = detectContent("");

  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const clean = value.replace(/\s/g, "");
    if (!clean) throw new Error("Paste Base64 input first.");
    try {
      const binary = atob(clean);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    } catch (error) {
      throw new Error("That does not look like valid Base64. Check for missing characters or pasted labels.");
    }
  }

  function detectContent(text) {
    const trimmed = text.trim();
    if (isJson(trimmed)) return { label: "JSON", extension: "json", mimeType: "application/json;charset=utf-8" };
    if (isCsv(trimmed)) return { label: "CSV", extension: "csv", mimeType: "text/csv;charset=utf-8" };
    if (looksLikeXml(trimmed)) return { label: "XML", extension: "xml", mimeType: "application/xml;charset=utf-8" };
    return { label: "TXT", extension: "txt", mimeType: "text/plain;charset=utf-8" };
  }

  function isJson(text) {
    if (!text || (!text.startsWith("{") && !text.startsWith("["))) return false;
    try {
      JSON.parse(text);
      return true;
    } catch (error) {
      return false;
    }
  }

  function isCsv(text) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return false;
    const delimiter = [",", "\t", ";", "|"].find((item) => splitCsvLine(lines[0], item).length > 1);
    if (!delimiter) return false;
    const expected = splitCsvLine(lines[0], delimiter).length;
    const checked = lines.slice(1, 8);
    return checked.length > 0 && checked.every((line) => Math.abs(splitCsvLine(line, delimiter).length - expected) <= 1);
  }

  function splitCsvLine(line, delimiter) {
    const values = [];
    let current = "";
    let quoted = false;
    for (const char of line) {
      if (char === "\"") {
        quoted = !quoted;
        current += char;
      } else if (char === delimiter && !quoted) {
        values.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  }

  function looksLikeXml(text) {
    return text.startsWith("<") && text.endsWith(">") && /<([A-Za-z_:][\w:.-]*)(\s[^>]*)?>[\s\S]*<\/\1>/.test(text);
  }

  function setOutput(text, detection) {
    latestOutput = text;
    latestDetection = detection || detectContent(text);
    const output = document.getElementById("output");
    const badge = document.getElementById("typeBadge");
    const download = document.getElementById("downloadBtn");
    if (output) output.value = text;
    if (badge) badge.textContent = latestDetection.label;
    if (download) download.textContent = `Download .${latestDetection.extension}`;
  }

  function setStatus(message, type) {
    window.setToolStatus("status", message, type);
  }

  function decodeBase64Text(value) {
    return textDecoder.decode(base64ToBytes(value));
  }

  function decodeGzipBase64Text(value) {
    if (!window.pako) throw new Error("Gzip support did not load. Please refresh and try again.");
    return window.pako.inflate(base64ToBytes(value), { to: "string" });
  }

  function handleDecode(mode) {
    const input = document.getElementById("input").value;
    try {
      let decoded = mode === "gzip-decode" ? decodeGzipBase64Text(input) : decodeBase64Text(input);
      let detection = detectContent(decoded);
      if (mode === "json-format") {
        const parsed = JSON.parse(decoded);
        decoded = JSON.stringify(parsed, null, 2);
        detection = { label: "JSON", extension: "json", mimeType: "application/json;charset=utf-8" };
      } else if (detection.extension === "json") {
        decoded = JSON.stringify(JSON.parse(decoded), null, 2);
      }
      setOutput(decoded, detection);
      setStatus(`Done. Detected ${detection.label} output and kept everything in your browser.`, "success");
    } catch (error) {
      setOutput("", detectContent(""));
      setStatus(error.message || "Unable to decode this input.", "error");
    }
  }

  async function handleEncode(mode) {
    const fileInput = document.getElementById("fileInput");
    const textInput = document.getElementById("input").value;
    try {
      let bytes;
      if (fileInput && fileInput.files && fileInput.files[0]) {
        bytes = new Uint8Array(await fileInput.files[0].arrayBuffer());
      } else {
        if (!textInput) throw new Error("Enter text or choose a local file first.");
        bytes = textEncoder.encode(textInput);
      }

      if (mode === "gzip-encode") {
        if (!window.pako) throw new Error("Gzip support did not load. Please refresh and try again.");
        bytes = window.pako.gzip(bytes);
      }

      setOutput(bytesToBase64(bytes), { label: "Base64", extension: "txt", mimeType: "text/plain;charset=utf-8" });
      setStatus("Encoded locally in your browser. No upload happened.", "success");
    } catch (error) {
      setStatus(error.message || "Unable to encode this input.", "error");
    }
  }

  function clearAll() {
    const input = document.getElementById("input");
    const output = document.getElementById("output");
    const file = document.getElementById("fileInput");
    if (input) input.value = "";
    if (output) output.value = "";
    if (file) file.value = "";
    setOutput("", detectContent(""));
    setStatus("");
  }

  async function copyOutput() {
    try {
      await window.copyTextToClipboard(latestOutput || document.getElementById("output").value);
      setStatus("Copied output to clipboard.", "success");
    } catch (error) {
      setStatus(error.message || "Copy failed.", "error");
    }
  }

  function downloadOutput() {
    const text = latestOutput || document.getElementById("output").value;
    if (!text) {
      setStatus("Nothing to download yet.", "warning");
      return;
    }
    window.downloadTextFile(text, `tools-site-output.${latestDetection.extension}`, latestDetection.mimeType);
    setStatus(`Downloaded tools-site-output.${latestDetection.extension}.`, "success");
  }

  function loadExample() {
    const input = document.getElementById("input");
    if (!input) return;
    const mode = document.body.dataset.toolMode;
    if (mode === "gzip-decode") {
      input.value = "H4sIAAAAAAAACqtWyk0tLk5MT1WyUvJIzcnJV0grys9VSCrKLy9OLVJIr8osUNJRKijKLEtMrlSyUsrJT07MUcjPy6lUqgUAvCsf3jwAAAA=";
    } else if (mode === "json-format") {
      input.value = "eyJuYW1lIjoiVG9vbHMgU2l0ZSIsInByaXZhY3kiOiJicm93c2VyIG9ubHkiLCJ0b29scyI6WyJiYXNlNjQiLCJub3RlcGFkIl19";
    } else {
      input.value = "SGVsbG8gZnJvbSBhIGJyb3dzZXItb25seSB0b29sLg==";
    }
    setStatus("Example loaded. Run the tool to see the output.", "success");
  }

  function init() {
    const mode = document.body.dataset.toolMode;
    if (!mode) return;
    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.action;
        if (action === "decode") handleDecode(mode);
        if (action === "encode") handleEncode(mode);
        if (action === "copy") copyOutput();
        if (action === "download") downloadOutput();
        if (action === "clear") clearAll();
        if (action === "example") loadExample();
      });
    });
  }

  window.Base64Tools = { detectContent };
  document.addEventListener("DOMContentLoaded", init);
})();
