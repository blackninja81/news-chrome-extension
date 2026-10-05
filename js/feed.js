// RSS fetching and parsing. Everything pulled from a feed is treated as
// untrusted text: it is only ever inserted with textContent / validated URLs.

const TIMEOUT_MS = 8000;

const nodeText = (parent, tag) => {
  const n = parent.getElementsByTagName(tag)[0];
  return n ? n.textContent.trim() : "";
};

const byLocalName = (parent, name) => [...parent.getElementsByTagNameNS("*", name)];

function stripHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

function safeUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

// BBC serves 240px thumbnails by default; ask for a larger rendition.
// ui.js falls back to the original if the larger one 404s.
function upscale(url) {
  return url
    .replace(/\/ace\/standard\/\d+\//, "/ace/standard/976/")
    .replace(/\/news\/\d+\//, "/news/976/");
}

function isImageNode(n, url) {
  if (n.localName === "thumbnail") return true;
  const type = n.getAttribute("type") || "";
  const medium = n.getAttribute("medium") || "";
  return medium === "image" || type.startsWith("image") || /\.(jpe?g|png|webp)(\?|$)/i.test(url);
}

function findImage(item) {
  const nodes = [...byLocalName(item, "thumbnail"), ...byLocalName(item, "content")];
  for (const n of nodes) {
    const url = safeUrl(n.getAttribute("url") || "");
    if (url && isImageNode(n, url)) return url;
  }
  const enc = item.getElementsByTagName("enclosure")[0];
  if (enc && (enc.getAttribute("type") || "").startsWith("image")) {
    return safeUrl(enc.getAttribute("url") || "");
  }
  return "";
}

export function parseRss(xml, feed) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid feed");

  return [...doc.getElementsByTagName("item")]
    .map((item) => {
      const link = safeUrl(nodeText(item, "link"));
      const title = stripHtml(nodeText(item, "title"));
      if (!link || !title) return null;

      const imageSmall = findImage(item);
      return {
        title,
        link,
        summary: stripHtml(nodeText(item, "description")),
        date: Date.parse(nodeText(item, "pubDate")) || 0,
        author: byLocalName(item, "creator")[0]?.textContent.trim() || "",
        source: feed.source,
        category: feed.category,
        image: imageSmall ? upscale(imageSmall) : "",
        imageSmall,
      };
    })
    .filter(Boolean);
}

export async function fetchFeed(feed) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(feed.url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseRss(await res.text(), feed);
  } finally {
    clearTimeout(timer);
  }
}

export function mergeItems(lists) {
  const seen = new Set();
  return lists
    .flat()
    .sort((a, b) => b.date - a.date)
    .filter((i) => !seen.has(i.link) && seen.add(i.link));
}
