// Feed fetching and parsing (RSS 2.0 and Atom). Everything pulled from a feed
// is treated as untrusted text: it is only ever inserted with textContent /
// validated URLs.

const TIMEOUT_MS = 10000;
const MAX_ITEMS_PER_FEED = 40;
const MAX_SUMMARY = 320;

/* ---------- DOM helpers (namespace-agnostic) ---------- */
const kids = (parent, name) => [...parent.children].filter((c) => c.localName === name);
const kid = (parent, name) => kids(parent, name)[0] || null;
const kidText = (parent, ...names) => {
  for (const name of names) {
    const t = kid(parent, name)?.textContent.trim();
    if (t) return t;
  }
  return "";
};
const descendants = (parent, name) => [...parent.getElementsByTagNameNS("*", name)];

function safeUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

/* ---------- Text / HTML helpers ---------- */
// Parse an HTML fragment inertly (no scripts run, no images load) and pull out
// its plain text and first real <img>.
function parseHtml(html) {
  if (!html) return { text: "", img: "" };
  const doc = new DOMParser().parseFromString(html, "text/html");
  let img = "";
  for (const el of doc.querySelectorAll("img[src]")) {
    const tiny = ["width", "height"].some((a) => Number(el.getAttribute(a)) > 0 && Number(el.getAttribute(a)) <= 2);
    const url = safeUrl(el.getAttribute("src"));
    if (url && !tiny) { img = url; break; }
  }
  return { text: (doc.body.textContent || "").replace(/\s+/g, " ").trim(), img };
}

function truncate(text, max = MAX_SUMMARY) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ") > max * 0.6 ? cut.lastIndexOf(" ") : max).trimEnd() + "…";
}

/* ---------- Field extraction ---------- */
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

// Pick the widest image the entry offers (Guardian lists several sizes).
function findImage(item) {
  let best = "";
  let bestWidth = -1;
  const consider = (url, width) => {
    if (url && width > bestWidth) { best = url; bestWidth = width; }
  };

  for (const n of [...descendants(item, "thumbnail"), ...descendants(item, "content")]) {
    const url = safeUrl(n.getAttribute("url") || "");
    if (url && isImageNode(n, url)) consider(url, parseInt(n.getAttribute("width") || "0", 10) || 0);
  }
  for (const enc of kids(item, "enclosure")) {
    if ((enc.getAttribute("type") || "").startsWith("image")) consider(safeUrl(enc.getAttribute("url") || ""), 0);
  }
  for (const l of kids(item, "link")) {
    if (l.getAttribute("rel") === "enclosure" && (l.getAttribute("type") || "").startsWith("image")) {
      consider(safeUrl(l.getAttribute("href") || ""), 0);
    }
  }
  return best;
}

function findLink(item) {
  const orig = kidText(item, "origLink"); // FeedBurner's un-proxied URL
  if (safeUrl(orig)) return safeUrl(orig);
  for (const l of kids(item, "link")) {
    const rel = l.getAttribute("rel");
    if (rel && rel !== "alternate") continue; // skip atom rel="self" etc.
    const url = safeUrl((l.getAttribute("href") || l.textContent).trim());
    if (url) return url;
  }
  const guid = kidText(item, "guid", "id");
  return /^https?:/.test(guid) ? safeUrl(guid) : "";
}

function cleanAuthor(raw) {
  if (!raw) return "";
  if (raw.includes("@")) return /\(([^)]+)\)/.exec(raw)?.[1] || ""; // "mail@x.com (Jane Doe)"
  return raw.length > 60 ? "" : raw;
}

function findAuthor(item) {
  const creator = kidText(item, "creator");
  if (creator) return cleanAuthor(creator);
  const a = kid(item, "author");
  return a ? cleanAuthor(kidText(a, "name") || a.textContent.trim()) : "";
}

/* ---------- Parser ---------- */
export function parseFeed(xml, feed) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid feed");

  let nodes = [...doc.getElementsByTagName("item")]; // RSS
  if (!nodes.length) nodes = descendants(doc, "entry"); // Atom

  return nodes
    .slice(0, MAX_ITEMS_PER_FEED)
    .map((item) => {
      const link = findLink(item);
      let title = parseHtml(kidText(item, "title")).text;
      if (!link || !title) return null;

      // Google News appends " - Publisher" to headlines.
      let summary = "";
      let htmlImg = "";
      if (feed.googleNews) {
        const pub = kidText(item, "source");
        if (pub && title.endsWith(` - ${pub}`)) title = title.slice(0, -(pub.length + 3));
      } else {
        const fields = ["description", "summary", "encoded", "content"].map((n) => parseHtml(kidText(item, n)));
        summary = fields.find((f) => f.text)?.text || "";
        htmlImg = fields.find((f) => f.img)?.img || "";
        if (summary === title) summary = "";
      }

      const imageSmall = findImage(item) || htmlImg;
      return {
        title,
        link,
        summary: truncate(summary),
        date: Date.parse(kidText(item, "pubDate", "published", "updated", "date")) || 0,
        author: findAuthor(item),
        source: feed.source,
        category: feed.category,
        image: imageSmall ? upscale(imageSmall) : "",
        imageSmall,
      };
    })
    .filter(Boolean);
}

async function fetchText(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchFeed(feed) {
  return parseFeed(await fetchText(feed.url), feed);
}

/* ---------- Adding a feed by URL ---------- */
const userError = (message) => Object.assign(new Error(message), { user: true });

function feedTitle(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return "";
  const root = doc.getElementsByTagName("channel")[0] || doc.documentElement;
  return parseHtml(kidText(root, "title")).text;
}

// If the user pasted a normal web page, find its advertised RSS/Atom feed.
function discoverFeedUrl(html, base) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const l of doc.querySelectorAll('link[rel~="alternate"]')) {
    if (!/(rss|atom)\+xml/i.test(l.getAttribute("type") || "")) continue;
    try {
      return safeUrl(new URL(l.getAttribute("href"), base).href);
    } catch {
      /* try the next one */
    }
  }
  return "";
}

// Fetch a URL, confirm it parses as a feed with articles, and report its title.
// Returns { url, title, count } (url may differ if a feed link was discovered).
export async function probeFeed(url) {
  const tryParse = (text) => {
    try {
      const parsed = parseFeed(text, { source: "", category: "" });
      if (parsed.length) return parsed;
      // Zero items: a genuine empty feed has a feed root; anything else is just a web page.
      const root = new DOMParser().parseFromString(text, "application/xml").documentElement.localName;
      return /^(rss|feed|RDF)$/.test(root) ? parsed : null;
    } catch {
      return null;
    }
  };
  let feedUrl = url;
  let text = await fetchText(url);
  let items = tryParse(text);
  if (!items) {
    const found = discoverFeedUrl(text, url);
    if (found) {
      feedUrl = found;
      text = await fetchText(feedUrl);
      items = tryParse(text);
    }
  }
  if (!items) throw userError("That address isn't an RSS or Atom feed, and no feed link was found on the page.");
  if (!items.length) throw userError("That feed loaded but contains no articles.");
  return { url: feedUrl, title: feedTitle(text), count: items.length };
}

export function mergeItems(lists) {
  const seen = new Set();
  return lists
    .flat()
    .sort((a, b) => b.date - a.date)
    .filter((i) => !seen.has(i.link) && seen.add(i.link));
}
