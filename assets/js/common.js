(function () {
  const tools = [
    {
      title: "Base64 + Gzip Decoder",
      href: "base64-gzip-decoder.html",
      category: "Developer Tools",
      tags: ["Base64", "Gzip", "Decode"],
      description: "Decode compressed Base64 payloads, detect JSON, CSV, XML, or text, then copy or download the result."
    },
    {
      title: "Base64 Decoder",
      href: "base64-decoder.html",
      category: "Developer Tools",
      tags: ["Base64", "Decode"],
      description: "Decode plain Base64 strings to readable text completely in your browser."
    },
    {
      title: "Base64 Encoder",
      href: "base64-encoder.html",
      category: "Developer Tools",
      tags: ["Base64", "Encode", "Files"],
      description: "Encode typed text or a local file into Base64 without uploading anything."
    },
    {
      title: "Gzip + Base64 Encoder",
      href: "gzip-base64-encoder.html",
      category: "Developer Tools",
      tags: ["Gzip", "Base64", "Encode"],
      description: "Compress text with gzip and encode it as Base64 for transport or testing."
    },
    {
      title: "Base64 to JSON Formatter",
      href: "base64-to-json.html",
      category: "Data Tools",
      tags: ["JSON", "Base64", "Format"],
      description: "Decode Base64 and format it as readable JSON when the decoded content is valid JSON."
    },
    {
      title: "CSV Splitter",
      href: "csv-splitter.html",
      category: "Data Tools",
      tags: ["CSV", "Split", "Rows", "Size"],
      description: "Split a large CSV into smaller browser-generated files by maximum KB size or rows per file."
    },
    {
      title: "CSV to JSON Converter",
      href: "csv-to-json.html",
      category: "Data Tools",
      tags: ["CSV", "JSON", "Nested"],
      description: "Convert CSV into flat or nested JSON using dot notation."
    },
    {
      title: "JSON to CSV Converter",
      href: "json-to-csv.html",
      category: "Data Tools",
      tags: ["JSON", "CSV", "Flatten"],
      description: "Convert flat or nested JSON into CSV using dot notation."
    },
    {
      title: "Online Notepad",
      href: "online-notepad.html",
      category: "Text Tools",
      tags: ["Notes", "Editor", "Files"],
      description: "Write, edit, open, search, highlight, copy, and download notes locally in the browser."
    },
    {
      title: "Online Code Editor",
      href: "online-code-editor.html",
      category: "Developer Tools",
      tags: ["Code", "Editor", "Syntax"],
      description: "A lightweight CodeMirror editor with line numbers, dark mode, and common syntax modes."
    },
    {
      title: "Text Compare",
      href: "text-compare.html",
      category: "Text Tools",
      tags: ["Compare", "Diff"],
      description: "Compare two text blocks line by line and spot additions, removals, and changed lines."
    },
    {
      title: "Word Counter",
      href: "word-counter.html",
      category: "Text Tools",
      tags: ["Words", "Characters", "Reading"],
      description: "Count words, characters, lines, sentences, and estimated reading time as you type."
    },
    {
      title: "Find and Replace",
      href: "find-and-replace.html",
      category: "Text Tools",
      tags: ["Find", "Replace", "Highlight"],
      description: "Find text, highlight matches with color, replace first match, or replace all matches."
    }
  ];

  window.ToolsDirectory = { tools };

  window.setToolStatus = function (elementOrId, message, type) {
    const element = typeof elementOrId === "string" ? document.getElementById(elementOrId) : elementOrId;
    if (!element) return;
    element.textContent = message || "";
    element.classList.remove("success", "error", "warning");
    if (type) element.classList.add(type);
  };

  window.downloadTextFile = function (text, filename, mimeType) {
    const blob = new Blob([text], { type: mimeType || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "download.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  window.copyTextToClipboard = async function (text) {
    if (!text) throw new Error("Nothing to copy.");
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  };

  function renderToolCards() {
    const grid = document.querySelector("[data-tool-grid]");
    if (!grid) return;

    const searchInput = document.querySelector("[data-tool-search]");
    const categoryButtons = Array.from(document.querySelectorAll("[data-category-filter]"));
    let activeCategory = "All";

    function render() {
      const query = (searchInput ? searchInput.value : "").trim().toLowerCase();
      const filtered = tools.filter((tool) => {
        const matchesCategory = activeCategory === "All" || tool.category === activeCategory;
        const haystack = `${tool.title} ${tool.category} ${tool.tags.join(" ")} ${tool.description}`.toLowerCase();
        return matchesCategory && (!query || haystack.includes(query));
      });

      grid.innerHTML = filtered.map((tool) => `
        <a class="tool-card" href="${tool.href}" data-tool-card>
          <span class="badge">${tool.category}</span>
          <h3>${tool.title}</h3>
          <p>${tool.description}</p>
          <span class="tag-row">${tool.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}</span>
        </a>
      `).join("");

      const empty = document.querySelector("[data-tool-empty]");
      if (empty) empty.classList.toggle("hidden", filtered.length !== 0);
    }

    categoryButtons.forEach((button) => {
      button.addEventListener("click", () => {
        activeCategory = button.dataset.categoryFilter;
        categoryButtons.forEach((item) => item.classList.toggle("active", item === button));
        render();
      });
    });

    if (searchInput) searchInput.addEventListener("input", render);
    render();
  }

  document.addEventListener("DOMContentLoaded", renderToolCards);
})();
