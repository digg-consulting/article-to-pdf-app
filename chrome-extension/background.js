const HOST_NAME = "com.digg.articlepdf";
const MENU_ID = "article-to-pdf-save-page";

function sendToHost(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(HOST_NAME, payload, (response) => {
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

async function cookiesForUrl(url) {
  try {
    return await chrome.cookies.getAll({ url });
  } catch {
    return [];
  }
}

async function downloadArticlePdf(articleUrl) {
  if (!articleUrl?.startsWith("http")) {
    throw new Error("Invalid or missing URL");
  }

  const cookies = await cookiesForUrl(articleUrl);
  const { url, filename } = await sendToHost({ url: articleUrl, cookies });

  await chrome.downloads.download({
    url,
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
