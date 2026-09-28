const fileInput = document.getElementById("file");
const fileLabel = document.getElementById("fileLabel");
const originalSizePreview = document.getElementById("originalSizePreview");
const targetValue = document.getElementById("targetValue");
const targetUnit = document.getElementById("targetUnit");
const targetHint = document.getElementById("targetHint");
const quality = document.getElementById("quality");
const qualityValue = document.getElementById("qualityValue");
const compressButton = document.getElementById("compressButton");

const loading = document.getElementById("loading");
const result = document.getElementById("result");

const resultName = document.getElementById("resultName");
const resultOriginal = document.getElementById("resultOriginal");
const resultTarget = document.getElementById("resultTarget");
const resultCompressed = document.getElementById("resultCompressed");
const resultReduction = document.getElementById("resultReduction");
const message = document.getElementById("message");
const downloadButton = document.getElementById("downloadButton");

let selectedFile = null;

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function getTargetBytes() {
  const value = Number.parseFloat(targetValue.value);

  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  const multiplier = targetUnit.value === "MB" ? 1024 * 1024 : 1024;
  return Math.floor(value * multiplier);
}

function updateButtonState() {
  const targetBytes = getTargetBytes();

  const valid =
    selectedFile &&
    targetBytes > 0 &&
    targetBytes < selectedFile.size;

  compressButton.disabled = !valid;

  if (!selectedFile) {
    targetHint.textContent =
      "Select a file first. The target must be smaller than the original.";
  } else if (targetBytes <= 0) {
    targetHint.textContent = "Enter the size you want the compressed file to reach.";
  } else if (targetBytes >= selectedFile.size) {
    targetHint.textContent =
      "Your target must be smaller than the original file size.";
  } else {
    targetHint.textContent =
      `The server will try to make the final file about ${formatBytes(targetBytes)} or smaller.`;
  }
}

fileInput.addEventListener("change", () => {
  selectedFile = fileInput.files[0] || null;

  if (!selectedFile) {
    fileLabel.textContent = "Choose a file";
    originalSizePreview.textContent = "--";
    updateButtonState();
    return;
  }

  fileLabel.textContent = selectedFile.name;
  originalSizePreview.textContent = formatBytes(selectedFile.size);

  // Helpful default: target starts at about half of the original size.
  const half = selectedFile.size / 2;
  if (half >= 1024 * 1024) {
    targetUnit.value = "MB";
    targetValue.value = (half / (1024 * 1024)).toFixed(2);
  } else {
    targetUnit.value = "KB";
    targetValue.value = Math.max(1, Math.round(half / 1024));
  }

  updateButtonState();
});

targetValue.addEventListener("input", updateButtonState);
targetUnit.addEventListener("change", updateButtonState);

quality.addEventListener("input", () => {
  qualityValue.textContent = quality.value;
});

compressButton.addEventListener("click", async () => {
  if (!selectedFile) return;

  const formData = new FormData();
  formData.append("file", selectedFile);
  formData.append("targetValue", targetValue.value);
  formData.append("targetUnit", targetUnit.value);
  formData.append("quality", quality.value);

  compressButton.disabled = true;
  loading.classList.remove("hidden");
  result.classList.add("hidden");

  try {
    const response = await fetch("/api/compress", {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Compression failed.");
    }

    resultName.textContent = data.originalName;
    resultOriginal.textContent = data.originalSizeFormatted;
    resultTarget.textContent = data.targetSizeFormatted;
    resultCompressed.textContent = data.compressedSizeFormatted;
    resultReduction.textContent = `${data.reduction}%`;

    if (data.achievedTarget) {
      message.className = "message success";
      message.textContent =
        `${data.outputType} created successfully within your target size.`;
    } else {
      message.className = "message warning";
      message.textContent =
        `${data.outputType} was created, but the requested target could not be reached for this file. ` +
        `The smallest practical result produced by this demo was ${data.compressedSizeFormatted}.`;
    }

    downloadButton.href =
      `/api/download/${encodeURIComponent(data.resultId)}`;

    result.classList.remove("hidden");
  } catch (error) {
    alert(error.message);
  } finally {
    loading.classList.add("hidden");
    updateButtonState();
  }
});
