(function () {
  const state = {
    image: null,
    svg: "",
    fileName: "traced-logo.svg"
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type && file.type !== "image/png") {
      setStatus("Please choose a PNG file.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => loadImage(String(reader.result), file.name);
    reader.onerror = () => setStatus("Could not read that PNG file.", "error");
    reader.readAsDataURL(file);
  }

  function loadImage(src, fileName) {
    const image = new Image();
    image.onload = () => {
      state.image = image;
      state.fileName = makeSvgName(fileName);
      getElement("originalPreview").src = src;
      getElement("originalPreview").classList.remove("hidden");
      getElement("svgPreview").innerHTML = "";
      getElement("svgOutput").value = "";
      state.svg = "";
      drawToCanvas(image);
      setStatus("PNG loaded. Adjust options, then convert to SVG.", "success");
    };
    image.onerror = () => setStatus("Could not load that PNG image.", "error");
    image.src = src;
  }

  function makeSvgName(fileName) {
    return (fileName || "traced-logo.png").replace(/\.png$/i, "") + ".svg";
  }

  function drawToCanvas(image) {
    const canvas = getElement("sourceCanvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const size = fitSize(image.naturalWidth || image.width, image.naturalHeight || image.height, 900);
    canvas.width = size.width;
    canvas.height = size.height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }

  function fitSize(width, height, maxSide) {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    };
  }

  function applyThreshold(imageData, options) {
    const pixels = imageData.data;
    const bitmap = new Uint8Array(imageData.width * imageData.height);

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] / 255;
      const gray = ((pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114)) * alpha + 255 * (1 - alpha);
      const dark = gray < options.threshold;
      bitmap[index / 4] = options.invert ? Number(!dark) : Number(dark);
    }

    return {
      width: imageData.width,
      height: imageData.height,
      bitmap
    };
  }

  function runPotrace(binary) {
    const paths = [];

    for (let y = 0; y < binary.height; y += 1) {
      let x = 0;
      while (x < binary.width) {
        while (x < binary.width && !isFilled(binary, x, y)) x += 1;
        if (x >= binary.width) break;

        const start = x;
        while (x < binary.width && isFilled(binary, x, y)) x += 1;
        paths.push(`M${start} ${y}H${x}V${y + 1}H${start}Z`);
      }
    }

    return paths.join("");
  }

  function isFilled(binary, x, y) {
    return binary.bitmap[y * binary.width + x] === 1;
  }

  function generateSVG(binary, pathData) {
    const body = pathData
      ? `<path fill="currentColor" d="${pathData}"/>`
      : "";
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${binary.width} ${binary.height}" role="img">`,
      body,
      "</svg>"
    ].join("");
  }

  function convertToSvg() {
    if (!state.image) {
      setStatus("Upload a PNG before converting.", "warning");
      return;
    }

    const canvas = getElement("sourceCanvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    drawToCanvas(state.image);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const binary = applyThreshold(imageData, getOptions());
    const pathData = runPotrace(binary);
    state.svg = generateSVG(binary, pathData);

    getElement("svgPreview").innerHTML = state.svg;
    getElement("svgOutput").value = state.svg;
    setStatus(pathData ? "Converted to SVG." : "Converted, but no foreground shape was detected. Try adjusting threshold or invert.", pathData ? "success" : "warning");
  }

  function getOptions() {
    return {
      threshold: Number(getElement("threshold").value),
      invert: getElement("invertColors").checked
    };
  }

  function downloadSVG() {
    if (!state.svg) {
      setStatus("Convert the PNG before downloading.", "warning");
      return;
    }
    window.downloadTextFile(state.svg, state.fileName, "image/svg+xml;charset=utf-8");
    setStatus(`Downloaded ${state.fileName}.`, "success");
  }

  async function copySVG() {
    try {
      await window.copyTextToClipboard(state.svg || getElement("svgOutput").value);
      setStatus("Copied SVG to clipboard.", "success");
    } catch (error) {
      setStatus(error.message || "Copy failed.", "error");
    }
  }

  function clearAll() {
    getElement("fileInput").value = "";
    getElement("originalPreview").removeAttribute("src");
    getElement("originalPreview").classList.add("hidden");
    getElement("svgPreview").innerHTML = "";
    getElement("svgOutput").value = "";
    getElement("sourceCanvas").width = 0;
    getElement("sourceCanvas").height = 0;
    state.image = null;
    state.svg = "";
    state.fileName = "traced-logo.svg";
    setStatus("");
  }

  function updateThresholdLabel() {
    getElement("thresholdValue").textContent = getElement("threshold").value;
  }

  function setStatus(message, type) {
    window.setToolStatus("status", message, type);
  }

  function init() {
    if (!getElement("fileInput")) return;
    getElement("fileInput").addEventListener("change", handleFileUpload);
    getElement("convertBtn").addEventListener("click", convertToSvg);
    getElement("downloadBtn").addEventListener("click", downloadSVG);
    getElement("copyBtn").addEventListener("click", copySVG);
    getElement("clearBtn").addEventListener("click", clearAll);
    getElement("threshold").addEventListener("input", updateThresholdLabel);
    updateThresholdLabel();
  }

  window.PngToSvgTool = {
    handleFileUpload,
    drawToCanvas,
    applyThreshold,
    runPotrace,
    generateSVG,
    downloadSVG,
    copySVG,
    clearAll
  };

  document.addEventListener("DOMContentLoaded", init);
})();
