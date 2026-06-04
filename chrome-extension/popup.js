const urlInput = document.getElementById("article-url");
const downloadBtn = document.getElementById("download-btn");
const statusEl = document.getElementById("status");

function setStatus(message, isError = false) {
  statusEl.textContent = message || "";
  statusEl.style.color = isError ? "#f87171" : "";
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.startsWith("http")) urlInput.value = tab.url;
}

async function downloadPdf() {
  const url = urlInput.value.trim();
  if (!url) { setStatus("Enter a URL first.", true); return; }

  downloadBtn.disabled = true;
  setStatus("Generating PDF…");

  const response = await chrome.runtime.sendMessage({ type: "download", url });
  if (response?.ok) {
    setStatus("Download started.");
  } else {
    setStatus(response?.error || "Failed to generate PDF.", true);
  }
  downloadBtn.disabled = false;
}

downloadBtn.addEventListener("click", downloadPdf);
init();
