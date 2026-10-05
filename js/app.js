import { FEEDS, SECTIONS, QUOTES, DEFAULTS } from "./config.js";
import { fetchFeed, mergeItems } from "./feed.js";
import { get, set } from "./storage.js";
import { renderHero, renderCards, renderLatest } from "./ui.js";

const $ = (id) => document.getElementById(id);

const state = {
  section: "main",
  items: [],
  query: "",
  expanded: false,
  settings: { ...DEFAULTS },
  loadId: 0,
  timer: null,
};

/* ---------- Clock ---------- */
function tick() {
  const now = new Date();
  $("clock-date").textContent = now.toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
  $("clock-time").textContent = now.toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", hour12: state.settings.clock === "12",
  });
}

/* ---------- Quote of the day ---------- */
function showQuote() {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const q = QUOTES[dayOfYear % QUOTES.length];
  $("quote-text").textContent = `“${q.text}”`;
  $("quote-author").textContent = `– ${q.author}`;
}

/* ---------- Rendering ---------- */
function visibleItems() {
  const q = state.query.trim().toLowerCase();
  if (!q) return state.items;
  return state.items.filter((i) =>
    `${i.title} ${i.summary} ${i.source} ${i.category}`.toLowerCase().includes(q)
  );
}

function render() {
  const list = visibleItems();
  // Prefer a story with a picture for the hero, unless the user is searching.
  const heroIdx = state.query ? 0 : Math.max(0, list.findIndex((i) => i.image));
  const rest = list.filter((_, i) => i !== heroIdx);

  renderHero(
    $("hero"),
    list[heroIdx],
    state.items.length ? "No articles match your search." : "No articles to show yet."
  );
  renderCards($("cards"), rest.slice(0, 3));
  renderLatest($("latest"), rest.slice(3, state.expanded ? 18 : 8));
}

function setStatus(msg) {
  $("status").textContent = msg;
}

/* ---------- Loading (cache first, then refresh stale feeds) ---------- */
const cacheKey = (url) => `feed:${url}`;

async function load(section, force = false) {
  const id = ++state.loadId;
  const feeds = FEEDS[section];
  const ttl = state.settings.refresh * 60000;

  const readAll = async () => Promise.all(feeds.map((f) => get(cacheKey(f.url))));

  let cached = await readAll();
  if (id !== state.loadId) return;

  const cachedItems = mergeItems(cached.map((c) => c?.items || []));
  if (cachedItems.length) {
    state.items = cachedItems;
    render();
  }

  const stale = feeds.filter((f, i) => force || !cached[i] || Date.now() - cached[i].t > ttl);
  if (!stale.length) {
    setStatus(`Up to date · ${feeds.map((f) => f.source).join(", ")}`);
    return;
  }

  setStatus("Updating…");
  const results = await Promise.allSettled(stale.map((f) => fetchFeed(f)));
  if (id !== state.loadId) return;

  const failed = [];
  await Promise.all(
    results.map((r, i) => {
      if (r.status === "fulfilled") return set(cacheKey(stale[i].url), { t: Date.now(), items: r.value });
      failed.push(stale[i].source);
      return null;
    })
  );

  cached = await readAll();
  if (id !== state.loadId) return;
  state.items = mergeItems(cached.map((c) => c?.items || []));
  render();

  if (failed.length && !state.items.length) {
    setStatus("Couldn't load the news. Check your connection and try again.");
  } else if (failed.length) {
    setStatus(`Couldn't refresh ${[...new Set(failed)].join(", ")}. Showing saved stories.`);
  } else {
    setStatus(`Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  }
}

function scheduleRefresh() {
  clearInterval(state.timer);
  state.timer = setInterval(() => load(state.section), state.settings.refresh * 60000);
}

/* ---------- Navigation ---------- */
function selectSection(section) {
  if (!SECTIONS[section]) section = "main";
  state.section = section;
  state.query = "";
  state.expanded = false;
  $("search").value = "";
  $("view-all").firstChild.textContent = "View all ";
  document.querySelectorAll("#nav .nav-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.section === section);
  });
  set("section", section);
  load(section);
}

/* ---------- Settings ---------- */
function applySettings() {
  document.documentElement.dataset.theme = state.settings.theme;
  tick();
}

function bindSettings() {
  const dlg = $("settings");
  const fields = {
    theme: $("set-theme"),
    clock: $("set-clock"),
    refresh: $("set-refresh"),
  };

  $("open-settings").addEventListener("click", () => {
    fields.theme.value = state.settings.theme;
    fields.clock.value = state.settings.clock;
    fields.refresh.value = String(state.settings.refresh);
    dlg.showModal();
  });

  const save = () => {
    state.settings.theme = fields.theme.value;
    state.settings.clock = fields.clock.value;
    state.settings.refresh = Number(fields.refresh.value);
    set("settings", state.settings);
    applySettings();
    scheduleRefresh();
  };
  Object.values(fields).forEach((f) => f.addEventListener("change", save));
}

/* ---------- Boot ---------- */
async function init() {
  const saved = await get("settings", {});
  state.settings = { ...DEFAULTS, ...saved };
  applySettings();
  setInterval(tick, 1000);
  showQuote();
  bindSettings();

  $("nav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-item");
    if (btn) selectSection(btn.dataset.section);
  });

  $("search-form").addEventListener("submit", (e) => e.preventDefault());
  $("search").addEventListener("input", (e) => {
    state.query = e.target.value;
    render();
  });

  $("view-all").addEventListener("click", () => {
    state.expanded = !state.expanded;
    $("view-all").firstChild.textContent = state.expanded ? "Show less " : "View all ";
    render();
  });

  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
    if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      $("search").focus();
    } else if (e.key === "Escape" && document.activeElement === $("search")) {
      $("search").value = "";
      state.query = "";
      render();
      $("search").blur();
    }
  });

  scheduleRefresh();
  selectSection(await get("section", state.settings.section));
}

init();
