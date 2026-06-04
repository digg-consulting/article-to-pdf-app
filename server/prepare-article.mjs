export const WAIT_FOR_CONTENT_JS = `(async function(){
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const contentSel = ".body.markup,.available-content,.post-content,article [data-testid='post-body'],article";
  let lastLen = 0;
  let stable = 0;
  for (let i = 0; i < 40 && stable < 4; i++) {
    var el = document.querySelector(contentSel);
    var len = el ? (el.innerText || "").trim().length : 0;
    if (len > lastLen) {
      lastLen = len;
      stable = 0;
    } else {
      stable++;
    }
    await delay(500);
  }
})()`;

export const SCROLL_FOR_IMAGES_JS = `(async function(){
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const waitImg = (img) => new Promise(function(resolve){
    if(img.complete && img.naturalWidth > 0) return resolve();
    img.addEventListener("load", resolve, { once: true });
    img.addEventListener("error", resolve, { once: true });
    setTimeout(resolve, 8000);
  });

  function hydrateImages(root){
    root.querySelectorAll("img").forEach(function(img){
      img.loading = "eager";
      img.removeAttribute("loading");
      var ds = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original");
      if(ds && (!img.src || img.src.indexOf("data:") === 0)) img.src = ds;
      if(!img.getAttribute("src") && img.currentSrc) img.setAttribute("src", img.currentSrc);
    });
  }

  let stable = 0;
  let lastHeight = 0;
  for (let pass = 0; pass < 20 && stable < 3; pass++) {
    hydrateImages(document);
    const h = document.body.scrollHeight;
    if (h === lastHeight) stable++;
    else { stable = 0; lastHeight = h; }
    for (let y = 0; y < h; y += 600) {
      window.scrollTo(0, y);
      await delay(120);
      hydrateImages(document);
    }
    window.scrollTo(0, 0);
    await delay(400);
  }

  hydrateImages(document);
  await Promise.all(Array.from(document.querySelectorAll("img")).map(waitImg));
  await delay(500);
})()`;

export const PREPARE_ARTICLE_JS = `(function(){
  function score(el){
    return (el.innerText||"").trim().length +
      el.querySelectorAll("p").length*300 +
      el.querySelectorAll("img").length*150;
  }

  function formatDate(raw){
    if(!raw) return "";
    try {
      var d = new Date(raw);
      if(!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"});
      }
    } catch(e) {}
    return raw.trim();
  }

  function metaContent(prop){
    var el = document.querySelector('meta[property="'+prop+'"], meta[name="'+prop+'"]');
    return el && el.content ? el.content.trim() : "";
  }

  function extractMeta(){
    var titleEl = document.querySelector(
      "h1.post-title, h1[class*='post-title'], .post-header h1, article h1, main h1, h1.title"
    );
    var scope = titleEl ? (titleEl.closest("article, main, [class*='post']") || document) : document;

    var meta = {
      publication: "",
      publicationUrl: "",
      title: titleEl ? titleEl.innerText.trim() : "",
      subtitle: "",
      author: "",
      authorUrl: "",
      date: ""
    };

    var pubEl = document.querySelector(
      "a.publ-name, .pub-name, .publication-name, .navbar-title-link, " +
      "header a[href*='substack.com'], .pencraft a[href*='.substack.com']"
    );
    if(pubEl) {
      meta.publication = pubEl.innerText.trim();
      meta.publicationUrl = pubEl.href || "";
    } else {
      meta.publication = metaContent("og:site_name");
      var canonical = document.querySelector("link[rel='canonical']");
      meta.publicationUrl = canonical && canonical.href ? new URL(canonical.href).origin : (metaContent("og:url") ? new URL(metaContent("og:url")).origin : "");
    }

    if(!meta.title) meta.title = metaContent("og:title");

    if(titleEl) {
      var sib = titleEl.nextElementSibling;
      for(var i = 0; i < 6 && sib; i++, sib = sib.nextElementSibling) {
        var txt = (sib.innerText || "").trim();
        if(!txt || txt.length > 300) continue;
        if(sib.querySelector("time") || sib.querySelector("a[href*='/@']")) continue;
        if(/subtitle|deck/i.test(sib.className || "") || sib.tagName === "H3" || sib.tagName === "H2") {
          meta.subtitle = txt;
          break;
        }
        if(!meta.subtitle && sib.tagName === "P") {
          meta.subtitle = txt;
          break;
        }
      }
    }
    if(!meta.subtitle) {
      var subEl = scope.querySelector(".subtitle, h3.subtitle, [class*='subtitle'], .post-subtitle, .deck");
      if(subEl) meta.subtitle = subEl.innerText.trim();
    }

    var authorEl = scope.querySelector(
      "a[href*='/@'], a[href*='/profile'], [rel='author'], .byline a, .post-contributors a, .profile-hover-card-target"
    );
    if(authorEl) {
      meta.author = authorEl.innerText.trim();
      meta.authorUrl = authorEl.href || "";
    }
    if(!meta.author) meta.author = metaContent("author");

    var dateEl = scope.querySelector("time[datetime], .byline time, [class*='post-date'] time");
    if(dateEl) {
      meta.date = formatDate(dateEl.getAttribute("datetime") || dateEl.innerText);
    } else {
      var published = metaContent("article:published_time") || metaContent("published_time");
      if(published) meta.date = formatDate(published);
    }

    try {
      document.querySelectorAll('script[type="application/ld+json"]').forEach(function(s){
        var data = JSON.parse(s.textContent);
        var items = data["@graph"] || [data];
        items.forEach(function(d){
          if(!d || (d["@type"] !== "NewsArticle" && d["@type"] !== "BlogPosting" && d["@type"] !== "Article")) return;
          if(!meta.title && d.headline) meta.title = d.headline;
          if(!meta.subtitle && d.description && d.description.length < 300) meta.subtitle = d.description;
          if(!meta.author && d.author) {
            meta.author = typeof d.author === "string" ? d.author : (d.author.name || "");
            if(d.author.url) meta.authorUrl = d.author.url;
          }
          if(!meta.date && d.datePublished) meta.date = formatDate(d.datePublished);
          if(!meta.publication && d.publisher && d.publisher.name) {
            meta.publication = d.publisher.name;
            if(d.publisher.url) meta.publicationUrl = d.publisher.url;
          }
        });
      });
    } catch(e){}

    return meta;
  }

  var meta = extractMeta();
  window.__articlePdfMeta = meta;

  document.querySelectorAll("iframe").forEach(function(iframe){
    var src = iframe.src || iframe.getAttribute("data-src") || "";
    if(!src) { iframe.remove(); return; }
    var url = src.replace("/embed/", "/watch?v=").replace("youtube-nocookie.com", "youtube.com");
    var placeholder = document.createElement("p");
    placeholder.innerHTML = '▶ Video: <a href="' + url + '">' + url + '</a>';
    placeholder.style.cssText = "padding:12px;background:#f3f4f6;border-radius:6px;margin:1em 0;";
    iframe.parentNode.replaceChild(placeholder, iframe);
  });

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

  var clone = best.cloneNode(true);

  // Remove title-block duplicates from body — header carries attribution.
  if(meta.title) {
    clone.querySelectorAll("h1").forEach(function(h){
      if(h.innerText.trim() === meta.title) h.remove();
    });
  }
  if(meta.subtitle) {
    clone.querySelectorAll("h2,h3,p").forEach(function(el){
      if(el.innerText.trim() === meta.subtitle) el.remove();
    });
  }

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
    var ds = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original");
    if(ds && (!img.getAttribute("src") || img.getAttribute("src").indexOf("data:") === 0)) img.setAttribute("src", ds);
    if(!img.getAttribute("src") && img.currentSrc) img.setAttribute("src", img.currentSrc);
  });

  document.body.innerHTML = "";
  var container = document.createElement("main");
  Object.assign(container.style,{
    width:"100%",maxWidth:"none",margin:"0",padding:"8px 6px",
    fontSize:"17px",lineHeight:"1.55",
    fontFamily:"system-ui,-apple-system,'Segoe UI',sans-serif",
    color:"#111",background:"#fff"
  });

  // Attribution header: publication, title, subtitle, author (linked), date
  var header = document.createElement("header");
  header.style.cssText = "margin:0 0 1.5em;padding-bottom:1em;border-bottom:1px solid #ddd;";

  if(meta.publication) {
    var pub = document.createElement("p");
    pub.style.cssText = "font-size:13px;color:#666;margin:0 0 .6em;letter-spacing:.02em;font-weight:600;";
    if(meta.publicationUrl) {
      pub.innerHTML = '<a href="' + meta.publicationUrl + '">' + meta.publication + '</a>';
    } else {
      pub.textContent = meta.publication;
    }
    header.appendChild(pub);
  }

  if(meta.title) {
    var h1 = document.createElement("h1");
    h1.textContent = meta.title;
    h1.style.cssText = "margin:0 0 .35em;line-height:1.2;font-size:1.65em;font-weight:700;";
    header.appendChild(h1);
  }

  if(meta.subtitle) {
    var sub = document.createElement("p");
    sub.textContent = meta.subtitle;
    sub.style.cssText = "font-size:1.05em;color:#444;margin:0 0 .75em;line-height:1.4;";
    header.appendChild(sub);
  }

  if(meta.author || meta.date) {
    var byline = document.createElement("p");
    byline.style.cssText = "font-size:13px;color:#555;margin:0;";
    var parts = [];
    if(meta.author) {
      if(meta.authorUrl) {
        parts.push('<a href="' + meta.authorUrl + '">' + meta.author + '</a>');
      } else {
        parts.push(meta.author);
      }
    }
    if(meta.date) parts.push(meta.date);
    byline.innerHTML = parts.join(" · ");
    header.appendChild(byline);
  }

  if(header.childNodes.length) container.appendChild(header);

  container.appendChild(clone);
  document.body.appendChild(container);

  var style = document.createElement("style");
  style.textContent = [
    "*{box-sizing:border-box;color:#111!important;background:transparent!important}",
    "body{margin:0!important;background:#fff!important}",
    "main{background:#fff!important;padding-bottom:0!important}",
    "main,article,section,div{width:auto!important;max-width:none!important}",
    "p,li,blockquote{max-width:none!important}",
    "img,video,svg{max-width:100%!important;height:auto!important;display:block!important}",
    "img{page-break-inside:avoid!important;object-fit:contain!important}",
    "pre,code{white-space:pre-wrap!important;word-break:break-word!important;background:#f5f5f5!important}",
    "p{margin:0 0 .8em}",
    "h1,h2,h3,h4{margin:1em 0 .4em;line-height:1.25}",
    "header a{color:#0f4c81!important;text-decoration:none}",
    "header p{margin:0 0 .4em}",
    "a{color:#0f4c81!important;text-decoration:none}",
    "main>*:last-child{margin-bottom:0!important;padding-bottom:0!important}"
  ].join("");
  document.head.appendChild(style);
})();`;
