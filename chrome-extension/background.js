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
        resolve(response);
      }
    });
  });
}

async function downloadArticlePdf(articleUrl) {
  const { data, filename } = await sendToHost(articleUrl);
  // Use a data URL — Chrome handles these reliably with downloads API
  const dataUrl = "data:application/pdf;base64," + data;
  await chrome.downloads.download({
    url: dataUrl,
    filename: filename || "article.pdf",
    saveAs: true,
  });
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "download") return false;
  downloadArticlePdf(msg.url)
    .then(() => sendResponse({ ok: true }))
    .catch((e) => sendResponse({ ok: false, error: e.message }));
  return true;
});
