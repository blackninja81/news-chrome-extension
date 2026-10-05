// DOM rendering helpers. No innerHTML with feed data anywhere.
import { SECTIONS } from "./config.js";

// app.js keeps these hooks current so rendering stays a pure function of the data.
export const view = {
  isRead: () => false,
  isSaved: () => false,
  newTab: false,
};

const ARROW =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const BOOKMARK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>';

function h(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) n.append(kid);
  return n;
}

export function timeAgo(ts) {
  if (!ts) return "";
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return `${days} d ago`;
}

function fullDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

// Article anchor: data-link lets app.js mark it read; new-tab is a setting.
function articleLink(item, cls, ...kids) {
  return h(
    "a",
    {
      class: cls,
      href: item.link,
      "data-link": item.link,
      target: view.newTab ? "_blank" : null,
      rel: view.newTab ? "noopener" : null,
    },
    ...kids
  );
}

function saveBtn(item, extra = "") {
  const saved = view.isSaved(item.link);
  const btn = h("button", {
    class: `save-btn ${extra}`.trim(),
    type: "button",
    "data-link": item.link,
    "aria-pressed": saved ? "true" : "false",
    "aria-label": "Save for later",
    title: saved ? "Remove from Saved" : "Save for later",
  });
  btn.insertAdjacentHTML("beforeend", BOOKMARK);
  return btn;
}

function media(item, cls, eager = false) {
  const box = h("div", { class: `${cls} media` });
  if (item.image) {
    const img = h("img", {
      src: item.image,
      alt: "",
      referrerpolicy: "no-referrer",
      loading: eager ? "eager" : "lazy",
    });
    img.addEventListener("error", () => {
      if (item.imageSmall && img.getAttribute("src") !== item.imageSmall) img.src = item.imageSmall;
      else img.remove();
    });
    box.append(img);
  }
  return box;
}

function meta(item, withDate = false) {
  const who = item.author || item.source;
  return h(
    "div",
    { class: "meta" },
    h("span", { class: "avatar", "aria-hidden": "true", text: initials(item.source) }),
    h("span", { class: "meta-who", text: who }),
    h("span", { class: "dot", "aria-hidden": "true", text: "·" }),
    h("span", { class: "meta-when", text: withDate ? fullDate(item.date) : timeAgo(item.date) })
  );
}

/* ---------- Browse layout ---------- */
export function renderHero(el, item, emptyMessage) {
  el.replaceChildren();
  el.classList.toggle("is-read", !!item && view.isRead(item.link));
  if (!item) {
    el.append(h("div", { class: "empty", text: emptyMessage }));
    return;
  }
  const read = articleLink(item, "btn-read", "Read Article");
  read.insertAdjacentHTML("beforeend", ARROW);

  el.append(
    media(item, "hero-media", true),
    h(
      "div",
      { class: "hero-body" },
      h("span", { class: "pill", text: item.category }),
      h("h1", { class: "hero-title" }, articleLink(item, "", item.title)),
      item.summary ? h("p", { class: "hero-desc", text: item.summary }) : null,
      h(
        "div",
        { class: "hero-foot" },
        meta(item, true),
        h("div", { class: "hero-actions" }, saveBtn(item, "save-lg"), read)
      )
    )
  );
}

export function renderCards(el, items) {
  el.replaceChildren(
    ...items.map((item) =>
      h(
        "article",
        { class: `card${view.isRead(item.link) ? " is-read" : ""}` },
        articleLink(
          item,
          "card-link",
          media(item, "card-media"),
          h("div", { class: "card-cat", text: `${item.source} · ${item.category}` }),
          h("div", { class: "card-title", text: item.title }),
          meta(item)
        ),
        saveBtn(item)
      )
    )
  );
}

export function renderLatest(el, items) {
  el.replaceChildren(
    ...items.map((item) =>
      h(
        "li",
        { class: view.isRead(item.link) ? "is-read" : null },
        articleLink(
          item,
          "latest-link",
          media(item, "thumb"),
          h(
            "div",
            {},
            h("div", { class: "latest-title", text: item.title }),
            h("div", { class: "latest-cat", text: `${item.source} · ${timeAgo(item.date)}` })
          )
        ),
        saveBtn(item)
      )
    )
  );
}

/* ---------- List layout (search results and Saved) ---------- */
function highlight(text, terms) {
  if (!terms.length) return [text];
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text
    .split(re)
    .map((part, i) => (i % 2 ? h("mark", { text: part }) : part))
    .filter((p) => p !== "");
}

export function renderList(el, items, terms, emptyMessage) {
  if (!items.length) {
    el.replaceChildren(h("li", { class: "empty", text: emptyMessage }));
    return;
  }
  el.replaceChildren(
    ...items.map((item) =>
      h(
        "li",
        { class: `result${view.isRead(item.link) ? " is-read" : ""}` },
        articleLink(
          item,
          "result-link",
          media(item, "result-media"),
          h(
            "div",
            { class: "result-body" },
            h("div", { class: "result-title" }, highlight(item.title, terms)),
            item.summary ? h("div", { class: "result-sum" }, highlight(item.summary, terms)) : null,
            h(
              "div",
              { class: "result-meta" },
              h("span", { class: "tag", text: SECTIONS[item.section] || item.category }),
              h("span", { text: item.source }),
              item.date ? h("span", { class: "dot", "aria-hidden": "true", text: "·" }) : null,
              item.date ? h("span", { text: timeAgo(item.date) }) : null
            )
          )
        ),
        saveBtn(item)
      )
    )
  );
}

/* ---------- Filter chips ---------- */
// chips: [{ value, label, n }]. Clicking is handled by delegation in app.js
// via data-kind / data-value (empty value = "All").
export function renderChips(el, kind, allLabel, allCount, chips, active) {
  if (chips.length < 2 && !active) {
    el.hidden = true;
    el.replaceChildren();
    return;
  }
  el.hidden = false;
  const chip = (value, label, n) =>
    h(
      "button",
      {
        class: `chip${(active || "") === value ? " active" : ""}`,
        type: "button",
        "data-kind": kind,
        "data-value": value,
        "aria-pressed": (active || "") === value ? "true" : "false",
      },
      label,
      h("span", { class: "chip-n", text: String(n) })
    );
  el.replaceChildren(chip("", allLabel, allCount), ...chips.map((c) => chip(c.value, c.label, c.n)));
}
