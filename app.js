// State Management
const state = {
  files: [],
  selectedFileId: null,
};

// DOM Elements
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const filesList = document.getElementById("files-list");
const clearQueueBtn = document.getElementById("clear-queue-btn");
const resultPlaceholder = document.getElementById("result-placeholder");
const resultContent = document.getElementById("result-content");
const resultFilename = document.getElementById("result-filename");
const fileTypeBadge = document.getElementById("file-type-badge");
const metaSource = document.getElementById("meta-source");
const metaStatus = document.getElementById("meta-status");
const metaCharCount = document.getElementById("meta-char-count");
const metaPageCount = document.getElementById("meta-page-count");
const metaPageCountContainer = document.getElementById("meta-page-count-container");
const extractedTextView = document.getElementById("extracted-text-view");
const copyBtn = document.getElementById("copy-btn");
const endpointInput = document.getElementById("endpoint-url");
const langsInput = document.getElementById("ocr-langs");
const accessKeyInput = document.getElementById("access-key");

// Drag & Drop Handlers
["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("dragover");
  }, false);
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("dragover");
  }, false);
});

dropzone.addEventListener("drop", (e) => {
  const dt = e.dataTransfer;
  const files = dt.files;
  handleFiles(files);
});

fileInput.addEventListener("change", (e) => {
  handleFiles(fileInput.files);
});

// File Management
function handleFiles(fileList) {
  const newFiles = Array.from(fileList).filter((file) => {
    const validTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    const extension = file.name.split(".").pop().toLowerCase();
    const validExtensions = ["pdf", "png", "jpg", "jpeg"];
    return validTypes.includes(file.type) || validExtensions.includes(extension);
  });

  if (newFiles.length === 0) return;

  newFiles.forEach((file) => {
    const fileId = crypto.randomUUID();
    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
    
    const fileItem = {
      id: fileId,
      fileObj: file,
      name: file.name,
      size: formatBytes(file.size),
      type: isPdf ? "pdf" : "image",
      status: "pending",
      result: null,
      error: null,
    };

    state.files.push(fileItem);
    processFile(fileItem);
  });

  // Automatically select the first newly added file if nothing is selected
  if (!state.selectedFileId && state.files.length > 0) {
    state.selectedFileId = state.files[state.files.length - newFiles.length].id;
  }

  renderQueue();
  renderViewer();
}

// Network Request (File Processing)
async function processFile(fileItem) {
  fileItem.status = "processing";
  renderQueue();

  const endpoint = endpointInput.value.trim() || "http://localhost:54330";
  const langs = langsInput.value.trim() || "en";

  const targetUrl = new URL(endpoint);
  targetUrl.searchParams.set("langs", langs);

  const formData = new FormData();
  formData.append("file", fileItem.fileObj);

  const accessKey = accessKeyInput.value.trim();

  try {
    const headers = {};
    if (accessKey) {
      headers["x-access-key"] = accessKey;
    }

    const response = await fetch(targetUrl.toString(), {
      method: "POST",
      headers: headers,
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr;
      try {
        parsedErr = JSON.parse(errText);
      } catch (e) {}
      throw new Error((parsedErr && parsedErr.error) || `Server error (${response.status})`);
    }

    const data = await response.json();
    fileItem.status = "success";
    fileItem.result = data;
  } catch (error) {
    console.error("OCR Request Error:", error);
    fileItem.status = "failed";
    fileItem.error = error.message || "Failed to contact Edge Function server.";
  }

  renderQueue();
  if (state.selectedFileId === fileItem.id) {
    renderViewer();
  }
}

// Render queue list in sidebar
function renderQueue() {
  if (state.files.length === 0) {
    filesList.innerHTML = `
      <div class="empty-state">
        <i data-lucide="info"></i>
        <p>No files uploaded yet</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  filesList.innerHTML = "";

  state.files.forEach((file) => {
    const isSelected = state.selectedFileId === file.id;
    const fileItemDiv = document.createElement("div");
    fileItemDiv.className = `file-item fade-in ${isSelected ? "selected" : ""}`;
    fileItemDiv.onclick = () => selectFile(file.id);

    const iconType = file.type === "pdf" ? "file-text" : "image";
    const iconClass = file.type === "pdf" ? "pdf" : "image";

    fileItemDiv.innerHTML = `
      <div class="file-info-block">
        <div class="file-icon-wrapper ${iconClass}">
          <i data-lucide="${iconType}"></i>
        </div>
        <div class="file-name-meta">
          <span class="file-name" title="${file.name}">${file.name}</span>
          <div class="file-meta-row">
            <span>${file.size}</span>
            <span>•</span>
            <span class="status-badge ${file.status}">${file.status}</span>
          </div>
        </div>
      </div>
      ${file.status === "processing" ? `
        <div class="progress-bar-container">
          <div class="progress-bar"></div>
        </div>
      ` : ""}
    `;

    filesList.appendChild(fileItemDiv);
  });

  lucide.createIcons();
}

// Render active file details & results in viewer
function renderViewer() {
  const activeFile = state.files.find((f) => f.id === state.selectedFileId);

  if (!activeFile) {
    resultPlaceholder.classList.remove("hidden");
    resultContent.classList.add("hidden");
    return;
  }

  resultPlaceholder.classList.add("hidden");
  resultContent.classList.remove("hidden");

  // Basic Info
  resultFilename.textContent = activeFile.name;
  fileTypeBadge.textContent = activeFile.type.toUpperCase();
  fileTypeBadge.className = `file-badge ${activeFile.type}`;

  // Reset metadata views
  metaSource.className = "meta-value source-badge";
  metaSource.textContent = "-";
  metaStatus.textContent = activeFile.status.toUpperCase();
  metaCharCount.textContent = "-";
  metaPageCountContainer.classList.add("hidden");

  if (activeFile.status === "processing") {
    metaStatus.innerHTML = `<span style="color: var(--warning)">Processing...</span>`;
    extractedTextView.textContent = activeFile.type === "pdf" 
      ? "Checking PDF text layer (manual extraction)..." 
      : "Sending image directly to EasyOCR API...";
    copyBtn.disabled = true;
  } else if (activeFile.status === "failed") {
    metaStatus.innerHTML = `<span style="color: var(--danger)">Failed</span>`;
    metaSource.textContent = "N/A";
    extractedTextView.textContent = `ERROR: ${activeFile.error}`;
    copyBtn.disabled = true;
  } else if (activeFile.status === "success" && activeFile.result) {
    metaStatus.innerHTML = `<span style="color: var(--success)">Complete</span>`;
    copyBtn.disabled = false;

    const res = activeFile.result;
    
    // Source details
    if (res.source === "manual_extraction") {
      metaSource.textContent = "Direct Text Layer (Manual)";
      metaSource.classList.add("manual");
    } else {
      metaSource.textContent = `EasyOCR API`;
      metaSource.classList.add("ocr");
    }

    metaCharCount.textContent = (res.full_text || "").length.toLocaleString();

    // Render page count if pages details exist
    if (res.pages && res.pages.length > 0) {
      metaPageCountContainer.classList.remove("hidden");
      metaPageCount.textContent = res.pages.length;
    }

    // Render Text View
    if (!res.full_text || res.full_text.trim() === "") {
      extractedTextView.textContent = "[Document parsed successfully, but no readable text was found]";
    } else {
      extractedTextView.textContent = res.full_text;
    }
  }
}

function selectFile(id) {
  state.selectedFileId = id;
  renderQueue();
  renderViewer();
}

// Queue clearing
clearQueueBtn.addEventListener("click", () => {
  state.files = [];
  state.selectedFileId = null;
  renderQueue();
  renderViewer();
});

// Clipboard Management
copyBtn.addEventListener("click", () => {
  const text = extractedTextView.textContent;
  if (!text) return;

  navigator.clipboard.writeText(text).then(() => {
    const originalHTML = copyBtn.innerHTML;
    copyBtn.innerHTML = `<i data-lucide="check"></i> Copied!`;
    lucide.createIcons();
    copyBtn.style.background = "var(--success)";
    
    setTimeout(() => {
      copyBtn.innerHTML = originalHTML;
      lucide.createIcons();
      copyBtn.style.background = "";
    }, 2000);
  }).catch((err) => {
    console.error("Clipboard copy failed:", err);
  });
});

// Utilities
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// Initialize interface on load
renderQueue();
renderViewer();
console.log("OmniOCR UI successfully initialized.");
