#!/usr/bin/env node
/**
 * Chrome Native Messaging host — spawned automatically by the browser.
 * No npm start, no background server. Playwright runs headless per request.
 */
import fs from "fs";
import http from "http";
import { generatePdf } from "./generate-pdf.mjs";

const LOG = "/tmp/article-to-pdf.log";

function log(line) {
  try {
    fs.appendFileSync(LOG, line + "\n");
  } catch {
    // ignore
  }
}

function readExact(n) {
  const buf = Buffer.alloc(n);
  let offset = 0;
  while (offset < n) {
    const read = fs.readSync(0, buf, offset, n - offset);
    if (read === 0) throw new Error("stdin closed");
    offset += read;
  }
  return buf;
}

function readMessage() {
  const len = readExact(4).readUInt32LE(0);
  return JSON.parse(readExact(len).toString("utf8"));
}

function writeMessage(obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  fs.writeSync(1, header);
  fs.writeSync(1, body);
}

function isAllowedUrl(raw) {
  return raw.startsWith("http://") || raw.startsWith("https://");
}

function servePdfOnce(pdfBuf, filename) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename.replace(/"/g, "")}"`
      );
      res.end(pdfBuf);
      server.close();
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}/${encodeURIComponent(filename)}`);
    });
  });
}

async function main() {
  log(`--- invoked ${new Date().toISOString()} ---`);

  let msg;
  try {
    msg = readMessage();
  } catch (err) {
    log(`read error: ${err.message}`);
    writeMessage({ ok: false, error: "failed to read message: " + err.message });
    process.exit(1);
  }

  const rawUrl = (msg.url || "").trim();
  log(`url: ${rawUrl} cookies: ${msg.cookies?.length ?? 0}`);

  if (!rawUrl || !isAllowedUrl(rawUrl)) {
    writeMessage({ ok: false, error: "invalid or missing URL" });
    process.exit(1);
  }

  try {
    const { pdfBuf, filename } = await generatePdf(rawUrl, msg.cookies);
    const pdfUrl = await servePdfOnce(pdfBuf, filename);
    log(`success: ${filename} (${pdfBuf.length} bytes) → ${pdfUrl}`);
    writeMessage({ ok: true, url: pdfUrl, filename });

    // Keep alive briefly so Chrome can download from localhost.
    await new Promise((r) => setTimeout(r, 30_000));
  } catch (err) {
    log(`error: ${err.stack || err.message}`);
    writeMessage({ ok: false, error: err.message || String(err) });
    process.exit(1);
  }
}

main();
