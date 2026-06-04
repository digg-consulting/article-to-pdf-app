const HOST_NAME = "com.digg.articlepdf";
const MENU_ID = "article-to-pdf-save-page";

async function sendToHost(url) {
  const response = await browser.runtime.sendNativeMessage(HOST_NAME, { url });
  if (!response?.ok) throw new Error(response?.error || "Unknown error from native host");
  return response;
}

async function downloadArticlePdf(articleUrl) {
  const { data, filename } = await sendToHost(articleUrl);
  const dataUrl = "data:application/pdf;base64," + data;
  await browser.downloads.download({
    url: dataUrl,
    filename: filename || "article.pdf",
    saveAs: true,
  });
}

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: MENU_ID,
    title: "Save page as article PDF",
    contexts: ["page"],
  });
});

browser.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID || !info.pageUrl) return;
  try {
    await downloadArticlePdf(info.pageUrl);
  } catch (error) {
    console.error("PDF download failed:", error);
  }
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "download") return;
  return downloadArticlePdf(msg.url)
    .then(() => ({ ok: true }))
    .catch((e) => ({ ok: false, error: e.message }));
});
