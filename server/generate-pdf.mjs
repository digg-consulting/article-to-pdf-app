import { chromium } from "playwright";
import {
  WAIT_FOR_CONTENT_JS,
  SCROLL_FOR_IMAGES_JS,
  PREPARE_ARTICLE_JS,
} from "./prepare-article.mjs";

const SAME_SITE = {
  no_restriction: "None",
  lax: "Lax",
  strict: "Strict",
  unspecified: "Lax",
};

export function toPlaywrightCookies(cookies, pageUrl) {
  if (!cookies?.length) return [];
  const origin = new URL(pageUrl).origin;

  return cookies.map((c) => {
    const entry = {
      name: c.name,
      value: c.value,
      path: c.path || "/",
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure),
      sameSite: SAME_SITE[c.sameSite] ?? "Lax",
    };
    if (c.domain) entry.domain = c.domain;
    else entry.url = origin + (c.path || "/");
    if (c.expirationDate) entry.expires = Math.floor(c.expirationDate);
    return entry;
  });
}

export function filenameFromUrl(rawUrl, pageTitle = "") {
  try {
    const parsed = new URL(rawUrl);
    let slug = parsed.pathname.replace(/^\/+|\/+$/g, "");
    const idx = slug.lastIndexOf("/");
    if (idx >= 0) slug = slug.slice(idx + 1);
    if (!slug && pageTitle) {
      slug = pageTitle
        .replace(/[^a-zA-Z0-9\-_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
    }
    if (!slug) return "article.pdf";
    slug = slug
      .replace(/[^a-zA-Z0-9\-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
    return (slug || "article") + ".pdf";
  } catch {
    return "article.pdf";
  }
}

/** Run a script string inside the page (Playwright-safe vs raw evaluate). */
async function runInPage(page, script) {
  await page.evaluate(async (expr) => {
    await eval(expr);
  }, script);
}

export async function generatePdf(rawUrl, cookies) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const pwCookies = toPlaywrightCookies(cookies, rawUrl);
    if (pwCookies.length) await context.addCookies(pwCookies);

    const page = await context.newPage();
    // Substack/Medium keep long-polling open — networkidle never fires.
    await page.goto(rawUrl, { waitUntil: "load", timeout: 60_000 });
    await page.waitForSelector("body", { timeout: 15_000 });
    await page
      .waitForSelector(
        ".body.markup,.available-content,.post-content,article,[data-testid='post-body']",
        { timeout: 15_000 }
      )
      .catch(() => {});

    await runInPage(page, WAIT_FOR_CONTENT_JS);
    await runInPage(page, SCROLL_FOR_IMAGES_JS);
    await runInPage(page, PREPARE_ARTICLE_JS);

    const title = await page.title();
    const pdfBuf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "0.4in",
        bottom: "0.3in",
        left: "0.5in",
        right: "0.5in",
      },
    });

    return { pdfBuf: Buffer.from(pdfBuf), filename: filenameFromUrl(rawUrl, title) };
  } finally {
    await browser.close();
  }
}
