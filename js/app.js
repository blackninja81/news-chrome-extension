import { ALL_FEEDS, FEEDS, SECTIONS, SOURCES, QUOTES, DEFAULTS, FEEDBACK_URL, MAX_CUSTOM_FEEDS } from "./config.js";
import { fetchFeed, mergeItems, probeFeed } from "./feed.js";
import { get, getMany, set, remove } from "./storage.js";
import { view, renderHero, renderCards, renderLatest, renderList, renderChips } from "./ui.js";

const $ = (id) => document.getElementById(id);

const PAGE = 30; // results per "Show more" page
const MAX_READ = 2000; // remembered read links
const CONCURRENCY = 6; // parallel feed fetches

const state = {
  section: "main",
  items: [], // items of the current section (browse mode)
  query: "",
  expanded: false,
  limit: PAGE,
  fSection: null, // active category filter (list mode)
  fSource: null, // active source filter
  settings: { ...DEFAULTS },
  loadId: 0,
  timer: null,
  customFeeds: [], // feeds the user added: { url, source, category, section }
  saved: [],
  savedSet: new Set(),
  read: new Set(),
  index: null, // every article from every enabled feed (built lazily for search)
  warming: false,
  warmedAt: 0,
  lastLoad: 0,
  searchTimer: null,
};

// url -> { t, items }: in-memory mirror of the per-feed storage cache.
const mem = new Map();
const cacheKey = (url) => `feed:${url}`;

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

/* ---------- Feed data ---------- */
const enabled = (f) => !state.settings.disabled.includes(f.source);
const allFeeds = () => [...ALL_FEEDS, ...state.customFeeds].filter(enabled);
const feedsFor = (section) =>
  [...(FEEDS[section] || []), ...state.customFeeds.filter((f) => f.section === section)].filter(enabled);
const ttl = () => state.settings.refresh * 60000;
const isStale = (f) => {
  const c = mem.get(f.url);
  return !c || Date.now() - c.t > ttl();
};

async function hydrate(feeds) {
  const missing = feeds.filter((f) => !mem.has(f.url));
  if (!missing.length) return;
  const res = await getMany(missing.map((f) => cacheKey(f.url)));
  for (const f of missing) {
    const c = res[cacheKey(f.url)];
    if (c) mem.set(f.url, c);
  }
}

const itemsFor = (feeds) =>
  mergeItems(feeds.map((f) => (mem.get(f.url)?.items || []).map((i) => ({ ...i, section: f.section }))));

// Adds the lowercase fields search matches against.
const prep = (i) =>
  i._h
    ? i
    : { ...i, _t: i.title.toLowerCase(), _h: `${i.title} ${i.summary} ${i.source} ${i.category} ${SECTIONS[i.section] || ""}`.toLowerCase() };

function getIndex() {
  if (!state.index) state.index = itemsFor(allFeeds()).map(prep);
  return state.index;
}

async function pool(tasks, n) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, tasks.length) }, async () => {
      while (next < tasks.length) await tasks[next++]();
    })
  );
}

// Fetch feeds in parallel, updating memory + storage. Returns failed source names.
async function refreshFeeds(feeds) {
  const failed = [];
  await pool(
    feeds.map((f) => async () => {
      try {
        const entry = { t: Date.now(), items: await fetchFeed(f) };
        mem.set(f.url, entry);
        await set(cacheKey(f.url), entry);
      } catch {
        failed.push(f.source);
      }
    }),
    CONCURRENCY
  );
  state.index = null;
  return failed;
}

/* ---------- Search ---------- */
// Supports: multiple words (all must match), "exact phrases", and -excluded words.
function parseQuery(q) {
  const include = [];
  const exclude = [];
  const re = /(-?)(?:"([^"]+)"|(\S+))/g;
  let m;
  while ((m = re.exec(q.toLowerCase()))) {
    const term = (m[2] || m[3] || "").trim();
    if (term) (m[1] ? exclude : include).push(term);
  }
  return { include, exclude };
}

function search(base, pq) {
  const hits = [];
  for (const i of base) {
    if (pq.exclude.some((t) => i._h.includes(t))) continue;
    let score = 0;
    let ok = true;
    for (const t of pq.include) {
      if (!i._h.includes(t)) { ok = false; break; }
      score += i._t.includes(t) ? 3 : 1; // headline matches rank above summary matches
    }
    if (ok) hits.push({ i, score });
  }
  return hits.sort((a, b) => b.score - a.score || b.i.date - a.i.date).map((h) => h.i);
}

/* ---------- Rendering ---------- */
// Penalise each extra story from the same source by 25 minutes so one busy
// feed can't fill the whole front page.
function diversify(list) {
  const seen = {};
  return list
    .map((i) => {
      const k = (seen[i.source] = (seen[i.source] || 0) + 1) - 1;
      return { i, t: (i.date || 0) - k * 25 * 60000 };
    })
    .sort((a, b) => b.t - a.t)
    .map((x) => x.i);
}

function render() {
  view.newTab = state.settings.newTab;
  view.isRead = (l) => state.read.has(l);
  view.isSaved = (l) => state.savedSet.has(l);

  const q = state.query.trim();
  const savedView = state.section === "saved";
  const listMode = !!q || savedView;

  // 1. Base set: everything for search, saved items for Saved, the section otherwise.
  let base;
  let terms = [];
  if (listMode) {
    base = savedView ? state.saved.map(prep) : getIndex();
    if (q) {
      const pq = parseQuery(q);
      terms = pq.include;
      base = search(base, pq);
    } else {
      base = [...base].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    }
  } else {
    base = state.items;
  }

  // 2. Facet counts: each chip row counts items that pass the *other* filter.
  const inSection = (i) => !state.fSection || i.section === state.fSection;
  const inSource = (i) => !state.fSource || i.source === state.fSource;
  const secCounts = {};
  const srcCounts = {};
  for (const i of base) {
    if (inSource(i)) secCounts[i.section] = (secCounts[i.section] || 0) + 1;
    if (inSection(i)) srcCounts[i.source] = (srcCounts[i.source] || 0) + 1;
  }
  const list = base.filter((i) => inSection(i) && inSource(i));

  const secChips = listMode
    ? Object.keys(SECTIONS)
        .filter((s) => s !== "saved" && (secCounts[s] || state.fSection === s))
        .map((s) => ({ value: s, label: SECTIONS[s], n: secCounts[s] || 0 }))
    : [];
  const srcChips = Object.entries(srcCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, n]) => ({ value, label: value, n }));
  if (state.fSource && !srcCounts[state.fSource]) srcChips.push({ value: state.fSource, label: state.fSource, n: 0 });
  const total = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);
  renderChips($("chips-section"), "section", "All categories", total(secCounts), secChips, state.fSection);
  renderChips($("chips-source"), "source", "All sources", total(srcCounts), srcChips, state.fSource);

  // 3. Layout switch.
  $("hero").hidden = $("cards").hidden = $("latest-panel").hidden = listMode;
  $("results").hidden = !listMode;

  if (listMode) {
    const shown = list.slice(0, state.limit);
    const n = list.length;
    let head;
    if (q) {
      head = `${n} result${n === 1 ? "" : "s"} for “${q}” ${state.fSection ? `in ${SECTIONS[state.fSection]}` : "across all categories"}`;
      if (state.warming) head += " · still loading other sections…";
    } else {
      head = `${n} saved article${n === 1 ? "" : "s"}`;
    }
    $("results-head").textContent = head;
    const empty = q
      ? state.warming
        ? "No matches yet. Other sections are still loading…"
        : `No articles match “${q}”. Try fewer words, or remove a filter.`
      : state.saved.length
        ? "No saved articles match these filters."
        : "Nothing saved yet. Hover over any story and click the bookmark icon to keep it here.";
    renderList($("results-list"), shown, terms, empty);
    $("show-more").hidden = shown.length >= list.length;
    return;
  }

  const items = state.settings.mix ? diversify(list) : list;
  const heroIdx = Math.max(0, items.findIndex((i) => i.image));
  const rest = items.filter((_, i) => i !== heroIdx);

  renderHero(
    $("hero"),
    items[heroIdx],
    state.items.length ? "No articles from this source." : "No articles to show yet."
  );
  renderCards($("cards"), rest.slice(0, 3));
  renderLatest($("latest"), rest.slice(3, state.expanded ? 33 : 8));
  $("view-all").hidden = rest.length <= 11;
}

function setStatus(msg) {
  $("status").textContent = msg;
}
function setBusy(b) {
  $("refresh").classList.toggle("spinning", b);
  $("refresh").setAttribute("aria-busy", String(b));
}

/* ---------- Loading (cache first, then refresh stale feeds) ---------- */
async function load(section, force = false) {
  const id = ++state.loadId;
  state.lastLoad = Date.now();

  if (section === "saved") {
    state.items = [];
    setBusy(false);
    render();
    setStatus("Saved articles are kept on this device.");
    return;
  }

  const feeds = feedsFor(section);
  if (!feeds.length) {
    state.items = [];
    setBusy(false);
    render();
    setStatus("All sources for this section are switched off. Turn some on in Settings.");
    return;
  }

  await hydrate(feeds);
  if (id !== state.loadId) return;
  state.items = itemsFor(feeds);
  render();

  const stale = feeds.filter((f) => force || isStale(f));
  if (!stale.length) {
    setBusy(false);
    setStatus(`Up to date · ${[...new Set(feeds.map((f) => f.source))].join(", ")}`);
    return;
  }

  setBusy(true);
  setStatus("Updating…");
  const failed = await refreshFeeds(stale);
  if (id !== state.loadId) return;

  state.items = itemsFor(feeds);
  render();
  setBusy(false);

  if (failed.length && !state.items.length) {
    setStatus("Couldn't load the news. Check your connection and try again.");
  } else if (failed.length) {
    setStatus(`Couldn't refresh ${[...new Set(failed)].join(", ")}. Showing saved stories.`);
  } else {
    setStatus(`Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  }
}

// Load every feed (not just the current section) so search covers all categories.
async function warmAll(force = false) {
  if (state.warming) return;
  state.warming = true;
  try {
    const feeds = allFeeds();
    await hydrate(feeds);
    state.index = null;
    if (state.query.trim()) render();

    const stale = feeds.filter((f) => force || isStale(f));
    if (stale.length) {
      setBusy(true);
      setStatus(`Loading ${stale.length} feed${stale.length === 1 ? "" : "s"} for search…`);
      const failed = await refreshFeeds(stale);
      setStatus(
        failed.length
          ? `Couldn't refresh ${[...new Set(failed)].join(", ")}.`
          : `Searching ${getIndex().length} articles from ${new Set(feeds.map((f) => f.source)).size} sources`
      );
    }
    state.warmedAt = Date.now();
    if (state.section !== "saved") state.items = itemsFor(feedsFor(state.section));
  } finally {
    state.warming = false;
    setBusy(false);
    render();
  }
}

function forceRefresh() {
  if (state.query.trim()) warmAll(true);
  else if (state.section === "saved") setStatus("Saved articles are kept on this device.");
  else load(state.section, true);
}

function scheduleRefresh() {
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    if (!document.hidden && state.section !== "saved") load(state.section);
  }, ttl());
}

/* ---------- Navigation & search state ---------- */
function resetFilters() {
  state.fSection = null;
  state.fSource = null;
  state.limit = PAGE;
}

function selectSection(section) {
  if (!SECTIONS[section]) section = "main";
  state.section = section;
  state.query = "";
  state.expanded = false;
  resetFilters();
  $("search").value = "";
  $("search-clear").hidden = true;
  $("view-all").firstChild.textContent = "View all ";
  document.querySelectorAll("#nav .nav-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.section === section);
  });
  set("section", section);
  load(section);
}

function onQuery(value) {
  const wasEmpty = !state.query.trim();
  state.query = value;
  if (wasEmpty !== !value.trim()) resetFilters(); // entering/leaving search starts clean
  state.limit = PAGE;
  $("search-clear").hidden = !value;
  render();
}

function clearSearch() {
  $("search").value = "";
  onQuery("");
}

/* ---------- Saved & read ---------- */
const SAVE_FIELDS = ["title", "link", "summary", "date", "author", "source", "category", "image", "imageSmall", "section"];

function findItem(link) {
  return (
    state.items.find((i) => i.link === link) ||
    getIndex().find((i) => i.link === link) ||
    state.saved.find((i) => i.link === link)
  );
}

function updateSavedCount() {
  const el = $("saved-count");
  el.textContent = String(state.saved.length);
  el.hidden = !state.saved.length;
}

function toggleSave(link) {
  if (state.savedSet.has(link)) {
    state.saved = state.saved.filter((s) => s.link !== link);
    state.savedSet.delete(link);
  } else {
    const item = findItem(link);
    if (!item) return;
    const copy = Object.fromEntries(SAVE_FIELDS.map((k) => [k, item[k] ?? ""]));
    state.saved.unshift({ ...copy, savedAt: Date.now() });
    state.savedSet.add(link);
  }
  set("saved", state.saved);
  updateSavedCount();

  if (state.section === "saved") return render();
  const on = state.savedSet.has(link);
  document.querySelectorAll(".save-btn").forEach((b) => {
    if (b.dataset.link !== link) return;
    b.setAttribute("aria-pressed", String(on));
    b.title = on ? "Remove from Saved" : "Save for later";
  });
}

function markRead(link) {
  if (state.read.has(link)) return;
  state.read.add(link);
  if (state.read.size > MAX_READ) state.read.delete(state.read.values().next().value);
  set("read", [...state.read]);
  document.querySelectorAll("a[data-link]").forEach((a) => {
    if (a.dataset.link === link) a.closest(".card, li, .hero")?.classList.add("is-read");
  });
}

/* ---------- Settings ---------- */
function applySettings() {
  document.documentElement.dataset.theme = state.settings.theme;
  tick();
}

function buildSourceList() {
  $("set-sources").replaceChildren(
    ...SOURCES.map((name) => {
      const label = document.createElement("label");
      label.className = "check";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = name;
      cb.checked = !state.settings.disabled.includes(name);
      label.append(cb, document.createTextNode(name));
      return label;
    })
  );
}

function bindSettings() {
  const dlg = $("settings");

  $("open-settings").addEventListener("click", () => {
    $("set-theme").value = state.settings.theme;
    $("set-clock").value = state.settings.clock;
    $("set-refresh").value = String(state.settings.refresh);
    $("set-newtab").checked = state.settings.newTab;
    $("set-mix").checked = state.settings.mix;
    $("clear-read").textContent = `Clear read history (${state.read.size})`;
    buildSourceList();
    renderCustomList();
    $("add-msg").textContent = "";
    if (state.section !== "saved") $("add-section").value = state.section;
    dlg.showModal();
  });

  $("add-section").replaceChildren(
    ...Object.entries(SECTIONS)
      .filter(([k]) => k !== "saved")
      .map(([k, label]) => new Option(label, k))
  );
  $("add-feed").addEventListener("click", addFeed);
  $("add-url").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // don't submit (and close) the dialog form
      addFeed();
    }
  });
  $("custom-list").addEventListener("click", (e) => {
    const btn = e.target.closest(".custom-remove");
    if (btn) removeFeed(btn.dataset.url);
  });
  if (FEEDBACK_URL) {
    $("feedback").href = FEEDBACK_URL;
    $("feedback").hidden = false;
  }

  dlg.addEventListener("change", (e) => {
    if (e.target.closest("#custom-box")) return;
    const before = state.settings.disabled.join("|");
    const disabled = [...$("set-sources").querySelectorAll("input:not(:checked)")].map((i) => i.value);
    state.settings = {
      ...state.settings,
      theme: $("set-theme").value,
      clock: $("set-clock").value,
      refresh: Number($("set-refresh").value),
      newTab: $("set-newtab").checked,
      mix: $("set-mix").checked,
      disabled,
    };
    set("settings", state.settings);
    applySettings();
    scheduleRefresh();
    if (before !== disabled.join("|")) {
      state.index = null;
      load(state.section);
    } else {
      render();
    }
  });

  $("clear-read").addEventListener("click", () => {
    state.read.clear();
    set("read", []);
    $("clear-read").textContent = "Clear read history (0)";
    render();
  });
}

/* ---------- Your feeds (add by URL) ---------- */
const canRequestAccess = typeof chrome !== "undefined" && chrome.permissions;
const originPattern = (url) => `${new URL(url).origin}/*`;

// Built-in sources have fixed host permissions; user feeds ask for their own site
// the moment they're added (optional_host_permissions), so nothing broad is requested up front.
async function ensureAccess(url) {
  if (!canRequestAccess) return true;
  const origins = [originPattern(url)];
  return (await chrome.permissions.contains({ origins })) || chrome.permissions.request({ origins });
}

function renderCustomList() {
  const list = $("custom-list");
  if (!state.customFeeds.length) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = "No feeds added yet.";
    list.replaceChildren(li);
    return;
  }
  list.replaceChildren(
    ...state.customFeeds.map((f) => {
      const li = document.createElement("li");
      li.className = "custom-item";
      const name = document.createElement("span");
      name.className = "custom-name";
      name.textContent = `${f.source} · ${SECTIONS[f.section]}`;
      name.title = f.url;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "custom-remove";
      btn.dataset.url = f.url;
      btn.setAttribute("aria-label", `Remove ${f.source}`);
      btn.textContent = "×";
      li.append(name, btn);
      return li;
    })
  );
}

async function addFeed() {
  const msg = (t) => ($("add-msg").textContent = t);
  const btn = $("add-feed");
  let raw = $("add-url").value.trim();
  if (!raw) return;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return msg("That doesn't look like a web address.");
  }
  if (!/^https?:$/.test(url.protocol)) return msg("Only web addresses (https://) are supported.");
  url.protocol = "https:"; // extensions can only reach https sites
  const known = () => [...ALL_FEEDS, ...state.customFeeds].some((f) => f.url === url.href);
  if (known()) return msg("That feed is already in your list.");
  if (state.customFeeds.length >= MAX_CUSTOM_FEEDS) return msg(`You can add up to ${MAX_CUSTOM_FEEDS} feeds.`);

  btn.disabled = true;
  msg("Checking…");
  try {
    if (!(await ensureAccess(url.href))) throw Object.assign(new Error("Access to that site wasn't allowed."), { user: true });
    const found = await probeFeed(url.href);
    if ([...ALL_FEEDS, ...state.customFeeds].some((f) => f.url === found.url)) {
      throw Object.assign(new Error("That feed is already in your list."), { user: true });
    }
    const section = $("add-section").value;
    const source = found.title.slice(0, 40) || new URL(found.url).hostname.replace(/^www\./, "");
    state.customFeeds.push({ url: found.url, source, category: SECTIONS[section], section });
    await set("customFeeds", state.customFeeds);
    state.index = null;
    state.warmedAt = 0; // let search pick the new feed up
    $("add-url").value = "";
    renderCustomList();
    msg(`Added “${source}” to ${SECTIONS[section]} (${found.count} articles).`);
    load(state.section);
  } catch (e) {
    msg(
      e.user
        ? e.message
        : /^HTTP/.test(e.message)
          ? `The site answered with an error (${e.message}).`
          : "Couldn't read that address. If it's a website, try pasting its RSS link directly."
    );
  } finally {
    btn.disabled = false;
  }
}

async function removeFeed(url) {
  state.customFeeds = state.customFeeds.filter((f) => f.url !== url);
  mem.delete(url);
  await Promise.all([set("customFeeds", state.customFeeds), remove(cacheKey(url))]);
  if (canRequestAccess && !state.customFeeds.some((f) => originPattern(f.url) === originPattern(url))) {
    try {
      await chrome.permissions.remove({ origins: [originPattern(url)] }); // no-op for built-in hosts
    } catch {
      /* built-in host permissions can't be removed */
    }
  }
  state.index = null;
  renderCustomList();
  load(state.section);
}

/* ---------- Boot ---------- */
async function init() {
  const [settings, saved, read, custom] = await Promise.all([
    get("settings", {}),
    get("saved", []),
    get("read", []),
    get("customFeeds", []),
  ]);
  state.settings = { ...DEFAULTS, ...settings };
  state.saved = Array.isArray(saved) ? saved : [];
  state.savedSet = new Set(state.saved.map((s) => s.link));
  state.read = new Set(Array.isArray(read) ? read : []);
  state.customFeeds = (Array.isArray(custom) ? custom : [])
    .filter((f) => f && typeof f.url === "string" && typeof f.source === "string")
    .map((f) => ({ ...f, section: SECTIONS[f.section] && f.section !== "saved" ? f.section : "main", category: f.category || SECTIONS[f.section] || "" }));
  applySettings();
  updateSavedCount();
  setInterval(tick, 1000);
  showQuote();
  bindSettings();

  $("nav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-item");
    if (btn) selectSection(btn.dataset.section);
  });

  // Search: debounce typing; load every section's feeds the first time it's used.
  $("search-form").addEventListener("submit", (e) => e.preventDefault());
  $("search").addEventListener("input", (e) => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => onQuery(e.target.value), 100);
  });
  $("search").addEventListener("focus", () => {
    if (Date.now() - state.warmedAt > ttl()) warmAll();
  });
  $("search-clear").addEventListener("click", () => {
    clearSearch();
    $("search").focus();
  });

  $("refresh").addEventListener("click", forceRefresh);
  $("show-more").addEventListener("click", () => {
    state.limit += PAGE;
    render();
  });
  $("view-all").addEventListener("click", () => {
    state.expanded = !state.expanded;
    $("view-all").firstChild.textContent = state.expanded ? "Show less " : "View all ";
    render();
  });

  // Filter chips, bookmarks and read tracking via delegation (survives re-renders).
  document.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) {
      const value = chip.dataset.value || null;
      if (chip.dataset.kind === "section") state.fSection = value;
      else state.fSource = value;
      state.limit = PAGE;
      render();
      return;
    }
    const save = e.target.closest(".save-btn");
    if (save) {
      e.preventDefault();
      toggleSave(save.dataset.link);
      return;
    }
    const a = e.target.closest("a[data-link]");
    if (a) markRead(a.dataset.link);
  });
  document.addEventListener("auxclick", (e) => {
    const a = e.target.closest("a[data-link]");
    if (a) markRead(a.dataset.link); // middle-click
  });

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const dialogOpen = $("settings").open;
    if (e.key === "Escape") {
      if (!dialogOpen && (state.query || document.activeElement === $("search"))) {
        clearSearch();
        $("search").blur();
      }
      return;
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
    if (typing || dialogOpen) return;
    if (e.key === "/") {
      e.preventDefault();
      $("search").focus();
    } else if (e.key === "r") {
      forceRefresh();
    } else if (/^[1-9]$/.test(e.key)) {
      const btn = document.querySelectorAll("#nav .nav-item")[Number(e.key) - 1];
      if (btn) selectSection(btn.dataset.section);
    }
  });

  // Coming back to a stale tab refreshes it.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.section !== "saved" && Date.now() - state.lastLoad > ttl()) load(state.section);
  });

  scheduleRefresh();
  selectSection(await get("section", state.settings.section));
}

init();
