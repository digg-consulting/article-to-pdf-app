// article-to-pdf native messaging host.
//
// Protocol: Chrome Native Messaging (4-byte LE length prefix + JSON).
// Input:  {"url": "https://..."}
// Output: {"ok": true,  "path": "/tmp/article.pdf"}
//      or {"ok": false, "error": "message"}
package main

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"time"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
)

// ── Native messaging I/O ──────────────────────────────────────────────────────

func readMsg() (map[string]string, error) {
	var length uint32
	if err := binary.Read(os.Stdin, binary.LittleEndian, &length); err != nil {
		return nil, err
	}
	buf := make([]byte, length)
	if _, err := io.ReadFull(os.Stdin, buf); err != nil {
		return nil, err
	}
	var msg map[string]string
	return msg, json.Unmarshal(buf, &msg)
}

func writeMsg(v any) error {
	buf, err := json.Marshal(v)
	if err != nil {
		return err
	}
	if err := binary.Write(os.Stdout, binary.LittleEndian, uint32(len(buf))); err != nil {
		return err
	}
	_, err = os.Stdout.Write(buf)
	return err
}

// ── Chrome finder ─────────────────────────────────────────────────────────────

func findChrome() (string, error) {
	candidates := map[string][]string{
		"darwin": {
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
		},
		"linux": {
			"/usr/bin/google-chrome",
			"/usr/bin/google-chrome-stable",
			"/usr/bin/chromium-browser",
			"/usr/bin/chromium",
		},
		"windows": {
			`C:\Program Files\Google\Chrome\Application\chrome.exe`,
			`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
		},
	}
	for _, path := range candidates[runtime.GOOS] {
		if _, err := os.Stat(path); err == nil {
			return path, nil
		}
	}
	// Fall back to PATH
	for _, name := range []string{"google-chrome", "google-chrome-stable", "chromium-browser", "chromium", "chrome"} {
		if p, err := exec.LookPath(name); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("Chrome not found; install Google Chrome or Chromium")
}

// ── Article DOM cleanup (mirrors server.js prepareArticleView) ─────────────

const prepareArticleJS = `(function(){
  function score(el){
    return (el.innerText||"").trim().length +
      el.querySelectorAll("p").length*300 +
      el.querySelectorAll("img").length*150;
  }

  // 1. Capture title and subtitle BEFORE any DOM changes.
  var titleEl = document.querySelector("h1.post-title, article h1, h1[class*='post-title']");
  var subtitleEl = document.querySelector(".subtitle, h3.subtitle, [class*='subtitle']");
  var titleText = titleEl ? titleEl.innerText.trim() : "";
  var subtitleText = subtitleEl ? subtitleEl.innerText.trim() : "";

  // 2. Replace iframes (YouTube etc.) with link placeholders BEFORE cloning.
  document.querySelectorAll("iframe").forEach(function(iframe){
    var src = iframe.src || iframe.getAttribute("data-src") || "";
    if(!src) { iframe.remove(); return; }
    // Convert embed URLs to watch URLs
    var url = src.replace("/embed/", "/watch?v=").replace("youtube-nocookie.com", "youtube.com");
    var placeholder = document.createElement("p");
    placeholder.innerHTML = "▶ Video: <a href=\"" + url + "\">" + url + "</a>";
    placeholder.style.cssText = "padding:12px;background:#f3f4f6;border-radius:6px;margin:1em 0;";
    iframe.parentNode.replaceChild(placeholder, iframe);
  });

  // 3. Find best content element.
  var candidates = Array.from(document.querySelectorAll(
    ".body.markup,.available-content,.post-content,.article-content,.entry-content,article,main,[role='main'],.content"
  ));
  if(!candidates.length) candidates = Array.from(document.body.children);
  if(!candidates.length) return;

  var filtered = candidates.filter(function(el){
    return !candidates.some(function(other){ return other !== el && el.contains(other) && score(other) > 500; });
  });
  if(!filtered.length) filtered = candidates;

  var best = filtered.reduce(function(a,b){return score(b)>score(a)?b:a;}, filtered[0]);
  if(!best) return;

  // 4. Clone the content.
  var clone = best.cloneNode(true);

  // 5. Clean the clone.
  ["script","style","noscript","nav","header","footer","aside",
   "form","button","input","select","textarea","[aria-hidden='true']",
   "[id*='cookie' i]","[class*='cookie' i]","[id*='consent' i]","[class*='consent' i]",
   "[id*='gdpr' i]","[class*='gdpr' i]","[id*='modal' i]","[class*='modal' i]",
   "[id*='popup' i]","[class*='popup' i]",
   "[class*='subscription' i]","[class*='subscribe' i]","[class*='newsletter' i]",
   "[class*='share' i]","[class*='social' i]","[class*='related' i]",
   "[class*='recommendation' i]","[class*='comment' i]","[class*='footer' i]"
  ].forEach(function(sel){
    clone.querySelectorAll(sel).forEach(function(el){el.remove();});
  });

  var allowed = new Set(["src","srcset","alt","href","colspan","rowspan"]);
  var walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
  while(walker.nextNode()){
    var el = walker.currentNode;
    Array.from(el.attributes).forEach(function(a){
      if(!allowed.has(a.name.toLowerCase())) el.removeAttribute(a.name);
    });
  }
  clone.querySelectorAll("img").forEach(function(img){
    if(!img.getAttribute("src") && img.currentSrc) img.setAttribute("src", img.currentSrc);
  });

  // 6. Build new page: title + subtitle + content.
  document.body.innerHTML = "";
  var container = document.createElement("main");
  Object.assign(container.style,{
    width:"100%",maxWidth:"none",margin:"0",padding:"8px 6px",
    fontSize:"17px",lineHeight:"1.55",
    fontFamily:"system-ui,-apple-system,'Segoe UI',sans-serif",
    color:"#111",background:"#fff"
  });

  // Add title if it wasn't already inside the content
  if(titleText && clone.innerText.indexOf(titleText) === -1) {
    var h1 = document.createElement("h1");
    h1.textContent = titleText;
    h1.style.cssText = "margin:0 0 .3em;line-height:1.2;";
    container.appendChild(h1);
  }
  if(subtitleText) {
    var sub = document.createElement("p");
    sub.textContent = subtitleText;
    sub.style.cssText = "font-size:1.15em;color:#555;margin:0 0 1.5em;";
    container.appendChild(sub);
  }

  container.appendChild(clone);
  document.body.appendChild(container);

  var style = document.createElement("style");
  style.textContent = [
    "*{box-sizing:border-box;color:#111!important;background:transparent!important}",
    "body{margin:0!important;background:#fff!important}",
    "main{background:#fff!important;padding-bottom:0!important}",
    "main,article,section,div{width:auto!important;max-width:none!important}",
    "p,li,blockquote{max-width:none!important}",
    "img,video{max-width:100%!important;height:auto!important}",
    "pre,code{white-space:pre-wrap!important;word-break:break-word!important;background:#f5f5f5!important}",
    "p{margin:0 0 .8em}",
    "h1,h2,h3,h4{margin:1em 0 .4em;line-height:1.25}",
    "a{color:#0f4c81!important;text-decoration:none}",
    "main>*:last-child{margin-bottom:0!important;padding-bottom:0!important}"
  ].join("");
  document.head.appendChild(style);
})();`

// ── PDF generation ────────────────────────────────────────────────────────────

func generatePDF(rawURL string, parsed *url.URL) (pdfData string, filename string, err error) {
	chromePath, err := findChrome()
	if err != nil {
		return "", "", err
	}

	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath(chromePath),
		chromedp.Flag("headless", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-quic", true),
		chromedp.Flag("ignore-certificate-errors", true),
		chromedp.Flag("disable-http2", true),
	)

	allocCtx, cancelAlloc := chromedp.NewExecAllocator(context.Background(), opts...)
	defer cancelAlloc()

	ctx, cancelCtx := chromedp.NewContext(allocCtx)
	defer cancelCtx()

	ctx, cancelTimeout := context.WithTimeout(ctx, 60*time.Second)
	defer cancelTimeout()

	var pdfBuf []byte
	var pageTitle string
	err = chromedp.Run(ctx,
		chromedp.Navigate(rawURL),
		// Wait for network to settle so dynamic content (Substack, Medium, etc.) is fully rendered.
		chromedp.ActionFunc(func(ctx context.Context) error {
			return chromedp.WaitReady("body", chromedp.ByQuery).Do(ctx)
		}),
		chromedp.Sleep(2*time.Second),
		chromedp.Title(&pageTitle),
		chromedp.Evaluate(prepareArticleJS, nil),
		chromedp.ActionFunc(func(ctx context.Context) error {
			buf, _, err := page.PrintToPDF().
				WithPrintBackground(true).
				WithPaperWidth(8.27).   // A4
				WithPaperHeight(11.69).
				WithMarginTop(0.4).
				WithMarginBottom(0.3).
				WithMarginLeft(0.5).
				WithMarginRight(0.5).
				Do(ctx)
			if err != nil {
				return err
			}
			pdfBuf = buf
			return nil
		}),
	)
	if err != nil {
		return "", "", fmt.Errorf("PDF generation failed: %w", err)
	}

	// Derive filename from URL slug, fall back to page title.
	slug := strings.Trim(parsed.Path, "/")
	if idx := strings.LastIndex(slug, "/"); idx >= 0 {
		slug = slug[idx+1:]
	}
	if slug == "" {
		slug = toSafeFileName(pageTitle)
	}
	name := slug + ".pdf"

	return base64.StdEncoding.EncodeToString(pdfBuf), name, nil
}

// ── Sanitise URL ──────────────────────────────────────────────────────────────

var unsafeChars = regexp.MustCompile(`[^a-zA-Z0-9\-_]+`)
var multiDash = regexp.MustCompile(`-{2,}`)

func toSafeFileName(s string) string {
	if s == "" {
		return "article"
	}
	s = unsafeChars.ReplaceAllString(s, "-")
	s = multiDash.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > 80 {
		s = s[:80]
	}
	if s == "" {
		return "article"
	}
	return s
}

func isAllowedURL(raw string) bool {
	return strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://")
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	// Debug log to file
	logFile, _ := os.OpenFile("/tmp/article-to-pdf.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if logFile != nil {
		fmt.Fprintf(logFile, "--- invoked at %s ---\n", time.Now().Format(time.RFC3339))
		defer logFile.Close()
	}

	msg, err := readMsg()
	if err != nil {
		if logFile != nil { fmt.Fprintf(logFile, "readMsg error: %v\n", err) }
		_ = writeMsg(map[string]any{"ok": false, "error": "failed to read message: " + err.Error()})
		os.Exit(1)
	}
	if logFile != nil { fmt.Fprintf(logFile, "msg: %v\n", msg) }

	rawURL := strings.TrimSpace(msg["url"])
	if rawURL == "" || !isAllowedURL(rawURL) {
		if logFile != nil { fmt.Fprintf(logFile, "invalid URL: %q\n", rawURL) }
		_ = writeMsg(map[string]any{"ok": false, "error": "invalid or missing URL"})
		os.Exit(1)
	}

	parsed, err := url.Parse(rawURL)
	if err != nil {
		_ = writeMsg(map[string]any{"ok": false, "error": "invalid URL"})
		os.Exit(1)
	}

	pdfData, filename, err := generatePDF(rawURL, parsed)
	if err != nil {
		if logFile != nil { fmt.Fprintf(logFile, "generatePDF error: %v\n", err) }
		_ = writeMsg(map[string]any{"ok": false, "error": err.Error()})
		os.Exit(1)
	}

	if logFile != nil { fmt.Fprintf(logFile, "success: filename=%s dataLen=%d\n", filename, len(pdfData)) }
	_ = writeMsg(map[string]any{"ok": true, "data": pdfData, "filename": filename})
}
