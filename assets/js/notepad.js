(function () {
  let editor = null;
  let darkMode = false;
  let marks = [];

  function textArea() {
    return document.getElementById("editor");
  }

  function getText() {
    return editor ? editor.getValue() : (textArea() ? textArea().value : "");
  }

  function setText(value) {
    if (editor) editor.setValue(value);
    else if (textArea()) textArea().value = value;
    clearHighlights();
    updateStats();
  }

  function setStatus(message, type) {
    window.setToolStatus("status", message, type);
  }

  function codeMirrorModeFromFile(name) {
    const lower = (name || "").toLowerCase();
    if (lower.endsWith(".js") || lower.endsWith(".json")) return "javascript";
    if (lower.endsWith(".html") || lower.endsWith(".htm")) return "htmlmixed";
    if (lower.endsWith(".css")) return "css";
    if (lower.endsWith(".xml") || lower.endsWith(".svg")) return "xml";
    if (lower.endsWith(".md")) return "markdown";
    return "text/plain";
  }

  function initEditor() {
    const area = textArea();
    if (!area) return;
    if (window.CodeMirror) {
      editor = window.CodeMirror.fromTextArea(area, {
        lineNumbers: true,
        lineWrapping: true,
        mode: document.body.dataset.editorMode || "text/plain",
        theme: "default"
      });
      editor.on("change", updateStats);
    } else {
      area.addEventListener("input", updateStats);
    }
    updateStats();
  }

  function updateStats() {
    const text = getText();
    const trimmed = text.trim();
    const lines = text ? text.split(/\r?\n/).length : 0;
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const chars = text.length;
    const charsNoSpaces = text.replace(/\s/g, "").length;
    const sentences = trimmed ? (trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).length : 0;
    const readingMinutes = Math.max(1, Math.ceil(words / 225));

    document.querySelectorAll("[data-stat='lines']").forEach((item) => item.textContent = lines);
    document.querySelectorAll("[data-stat='words']").forEach((item) => item.textContent = words);
    document.querySelectorAll("[data-stat='chars']").forEach((item) => item.textContent = chars);
    document.querySelectorAll("[data-stat='charsNoSpaces']").forEach((item) => item.textContent = charsNoSpaces);
    document.querySelectorAll("[data-stat='sentences']").forEach((item) => item.textContent = sentences);
    document.querySelectorAll("[data-stat='reading']").forEach((item) => item.textContent = `${readingMinutes} min`);
  }

  function newFile() {
    setText("");
    const name = document.getElementById("fileName");
    if (name) name.value = "notes.txt";
    setStatus("New blank document ready.", "success");
  }

  function openFile() {
    const input = document.getElementById("fileInput");
    const file = input && input.files ? input.files[0] : null;
    if (!file) {
      setStatus("Choose a local file first.", "warning");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setText(String(event.target.result || ""));
      const name = document.getElementById("fileName");
      if (name) name.value = file.name;
      const mode = document.getElementById("modeSelect");
      if (mode && editor) {
        mode.value = codeMirrorModeFromFile(file.name);
        editor.setOption("mode", mode.value);
      }
      setStatus(`Opened ${file.name} locally.`, "success");
    };
    reader.onerror = () => setStatus("Could not read that file.", "error");
    reader.readAsText(file);
  }

  function downloadFile() {
    const name = (document.getElementById("fileName") || {}).value || "notes.txt";
    window.downloadTextFile(getText(), name.trim() || "notes.txt", "text/plain;charset=utf-8");
    setStatus(`Downloaded ${name.trim() || "notes.txt"}.`, "success");
  }

  async function copyText() {
    try {
      await window.copyTextToClipboard(getText());
      setStatus("Copied text to clipboard.", "success");
    } catch (error) {
      setStatus(error.message || "Copy failed.", "error");
    }
  }

  function changeMode() {
    const mode = document.getElementById("modeSelect");
    if (editor && mode) editor.setOption("mode", mode.value);
  }

  function toggleTheme() {
    darkMode = !darkMode;
    if (editor) editor.setOption("theme", darkMode ? "material-darker" : "default");
    document.body.classList.toggle("editor-dark", darkMode);
    setStatus(darkMode ? "Dark mode enabled." : "Light mode enabled.", "success");
  }

  function getFindValue() {
    return (document.getElementById("findText") || {}).value || "";
  }

  function getReplaceValue() {
    return (document.getElementById("replaceText") || {}).value || "";
  }

  function findNext() {
    const query = getFindValue();
    if (!query) {
      setStatus("Enter text to find.", "warning");
      return;
    }
    const text = getText();
    const start = editor ? editor.indexFromPos(editor.getCursor()) : 0;
    let index = text.indexOf(query, start + (editor ? 1 : 0));
    if (index === -1) index = text.indexOf(query);
    if (index === -1) {
      setStatus("No match found.", "warning");
      return;
    }
    if (editor) {
      const from = editor.posFromIndex(index);
      const to = editor.posFromIndex(index + query.length);
      editor.setSelection(from, to);
      editor.scrollIntoView({ from, to }, 90);
    } else {
      textArea().setSelectionRange(index, index + query.length);
      textArea().focus();
    }
    setStatus(`Found match at character ${index + 1}.`, "success");
  }

  function markMatches(color) {
    clearHighlights();
    const query = getFindValue();
    if (!query) {
      setStatus("Enter text to find.", "warning");
      return 0;
    }
    const text = getText();
    let count = 0;
    let index = 0;
    while ((index = text.indexOf(query, index)) !== -1) {
      count += 1;
      if (editor) {
        marks.push(editor.markText(editor.posFromIndex(index), editor.posFromIndex(index + query.length), {
          css: `background:${color || "#fff176"}; color:#111827;`
        }));
      }
      index += query.length || 1;
    }
    setStatus(count ? `Found ${count} match(es).` : "No matches found.", count ? "success" : "warning");
    return count;
  }

  function clearHighlights() {
    marks.forEach((mark) => mark.clear());
    marks = [];
  }

  function replaceFirst() {
    const find = getFindValue();
    if (!find) {
      setStatus("Enter text to find.", "warning");
      return;
    }
    const text = getText();
    const index = text.indexOf(find);
    if (index === -1) {
      setStatus("No match found.", "warning");
      return;
    }
    setText(text.slice(0, index) + getReplaceValue() + text.slice(index + find.length));
    setStatus("Replaced the first match.", "success");
  }

  function replaceAllText() {
    const find = getFindValue();
    if (!find) {
      setStatus("Enter text to find.", "warning");
      return;
    }
    const text = getText();
    const count = text.split(find).length - 1;
    setText(text.split(find).join(getReplaceValue()));
    setStatus(count ? `Replaced ${count} match(es).` : "No matches found.", count ? "success" : "warning");
  }

  function compareText() {
    const left = (document.getElementById("leftText") || {}).value || getText();
    const right = (document.getElementById("rightText") || {}).value || "";
    const leftLines = left.split(/\r?\n/);
    const rightLines = right.split(/\r?\n/);
    const max = Math.max(leftLines.length, rightLines.length);
    const result = [];
    let changes = 0;
    for (let i = 0; i < max; i++) {
      const lineNo = i + 1;
      const a = leftLines[i];
      const b = rightLines[i];
      if (a === b) {
        result.push(`Line ${lineNo}: same`);
      } else {
        changes += 1;
        if (a !== undefined) result.push(`Line ${lineNo} left : ${a}`);
        if (b !== undefined) result.push(`Line ${lineNo} right: ${b}`);
      }
    }
    const output = document.getElementById("compareOutput");
    if (output) output.textContent = result.join("\n") || "Both inputs are empty.";
    setStatus(`Compare complete: ${changes} changed line(s).`, changes ? "warning" : "success");
  }

  function wireActions() {
    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const color = (document.getElementById("highlightColor") || {}).value || "#fff176";
        const action = button.dataset.action;
        if (action === "new") newFile();
        if (action === "open") openFile();
        if (action === "download") downloadFile();
        if (action === "copy") copyText();
        if (action === "theme") toggleTheme();
        if (action === "mode") changeMode();
        if (action === "findNext") findNext();
        if (action === "findAll") markMatches(color);
        if (action === "highlight") markMatches(color);
        if (action === "clearHighlights") {
          clearHighlights();
          setStatus("Highlights cleared.", "success");
        }
        if (action === "replaceFirst") replaceFirst();
        if (action === "replaceAll") replaceAllText();
        if (action === "compare") compareText();
      });
    });

    const mode = document.getElementById("modeSelect");
    if (mode) mode.addEventListener("change", changeMode);
    document.querySelectorAll("[data-live-stats]").forEach((item) => item.addEventListener("input", updateStats));
  }

  document.addEventListener("DOMContentLoaded", () => {
    initEditor();
    wireActions();
  });
})();
