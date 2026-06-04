const HOST_NAME = "com.digg.articlepdf";
const MENU_ID = "article-to-pdf-save-page";

function sendToHost(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(HOST_NAME, { url }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response?.ok) {
        reject(new Error(response?.error || "Unknown error from native host"));
      } else {
        resolve(response.path);
      }
    });
  });
}

async function downloadArticlePdf(articleUrl) {
  const pdfPath = await sendToHost(articleUrl);
  // Convert the local file path to a file:// URL for chrome.downloads
  const fileUrl = "file://" + pdfPath;
  await chrome.downloads.download({ url: fileUrl, saveAs: true });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Save page as article PDF",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID || !info.pageUrl) return;
  try {
    await downloadArticlePdf(info.pageUrl);
  } catch (error) {
    console.error("PDF download failed:", error);
  }
});

// Handle messages from popup.js
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "download") return false;
  downloadArticlePdf(msg.url)
    .then(() => sendResponse({ ok: true }))
    .catch((e) => sendResponse({ ok: false, error: e.message }));
  return true; // keep channel open for async response
});
