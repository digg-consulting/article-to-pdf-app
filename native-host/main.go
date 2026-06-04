// article-to-pdf native messaging host.
//
// Protocol: Chrome Native Messaging (4-byte LE length prefix + JSON).
// Input:  {"url": "https://..."}
// Output: {"ok": true,  "path": "/tmp/article.pdf"}
//      or {"ok": false, "error": "message"}
package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
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
  var removeSelectors = [
    "header","nav","footer","aside",
    "[role='banner']","[role='navigation']","[role='contentinfo']",
    "[aria-label*='cookie' i]","[id*='cookie' i]","[class*='cookie' i]",
    "[id*='consent' i]","[class*='consent' i]",
    "[id*='gdpr' i]","[class*='gdpr' i]",
    "[id*='modal' i]","[class*='modal' i]",
    "[id*='popup' i]","[class*='popup' i]",
    "[id*='newsletter' i]","[class*='newsletter' i]",
    "[id*='subscribe' i]","[class*='subscribe' i]",
    ".sticky",".floating",
    "[style*='position: fixed']","[style*='position:fixed']"
  ];
  removeSelectors.forEach(function(sel){
    document.querySelectorAll(sel).forEach(function(el){el.remove();});
  });

  function score(el){
    return (el.innerText||"").trim().length +
      el.querySelectorAll("p").length*300 +
      el.querySelectorAll("img").length*150;
  }

  var candidates = Array.from(document.querySelectorAll(
    "article,.body.markup,.available-content,main,[role='main'],.post-content,.article-content,.entry-content,.content"
  ));
  if(!candidates.length) candidates = Array.from(document.body.children);
  if(!candidates.length) return;

  var best = candidates.reduce(function(a,b){return score(b)>score(a)?b:a;}, candidates[0]);
  var clone = best.cloneNode(true);

  ["script","style","noscript","nav","header","footer","aside",
   "form","button","input","select","textarea","[aria-hidden='true']"
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

  document.body.innerHTML = "";
  var container = document.createElement("main");
  Object.assign(container.style,{
    width:"100%",maxWidth:"none",margin:"0",padding:"8px 6px",
    fontSize:"17px",lineHeight:"1.55",
    fontFamily:"system-ui,-apple-system,'Segoe UI',sans-serif"
  });
  container.appendChild(clone);
  document.body.appendChild(container);

  var style = document.createElement("style");
  style.textContent = [
    "*{box-sizing:border-box}",
    "body{margin:0!important}",
    "main,article,section,div{width:auto!important;max-width:none!important}",
    "p,li,blockquote{max-width:none!important}",
    "img,video,iframe{max-width:100%!important;height:auto!important}",
    "pre,code{white-space:pre-wrap!important;word-break:break-word!important}",
    "p{margin:0 0 .8em}",
    "h1,h2,h3,h4{margin:1em 0 .4em;line-height:1.25}",
    "a{color:#0f4c81;text-decoration:none}"
  ].join("");
  document.head.appendChild(style);
})();`

// ── PDF generation ────────────────────────────────────────────────────────────

func generatePDF(rawURL string, parsed *url.URL) (string, error) {
	chromePath, err := findChrome()
	if err != nil {
		return "", err
	}

	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath(chromePath),
		chromedp.Flag("headless", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
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
				WithMarginTop(0.5).
				WithMarginBottom(0.5).
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
		return "", fmt.Errorf("PDF generation failed: %w", err)
	}

	// Write to temp file; extension will prompt user for final save location.
	tmpDir := os.TempDir()
	// Prefer the last URL path segment (e.g. "what-to-do-when-buyers-start-in-llms"),
	// fall back to the page title if the path has no useful slug.
	slug := strings.Trim(parsed.Path, "/")
	if idx := strings.LastIndex(slug, "/"); idx >= 0 {
		slug = slug[idx+1:]
	}
	if slug == "" {
		slug = toSafeFileName(pageTitle)
	}
	name := slug + ".pdf"
	outPath := filepath.Join(tmpDir, name)
	if err := os.WriteFile(outPath, pdfBuf, 0o644); err != nil {
		return "", fmt.Errorf("failed to write PDF: %w", err)
	}
	return outPath, nil
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
	msg, err := readMsg()
	if err != nil {
		_ = writeMsg(map[string]any{"ok": false, "error": "failed to read message: " + err.Error()})
		os.Exit(1)
	}

	rawURL := strings.TrimSpace(msg["url"])
	if rawURL == "" || !isAllowedURL(rawURL) {
		_ = writeMsg(map[string]any{"ok": false, "error": "invalid or missing URL"})
		os.Exit(1)
	}

	parsed, err := url.Parse(rawURL)
	if err != nil {
		_ = writeMsg(map[string]any{"ok": false, "error": "invalid URL"})
		os.Exit(1)
	}

	path, err := generatePDF(rawURL, parsed)
	if err != nil {
		_ = writeMsg(map[string]any{"ok": false, "error": err.Error()})
		os.Exit(1)
	}

	_ = writeMsg(map[string]any{"ok": true, "path": path})
}
