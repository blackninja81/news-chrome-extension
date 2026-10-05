// DOM rendering helpers. No innerHTML with feed data anywhere.

const ARROW =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

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
    h("span", { text: who }),
    h("span", { class: "dot", "aria-hidden": "true", text: "·" }),
    h("span", { text: withDate ? fullDate(item.date) : timeAgo(item.date) })
  );
}

export function renderHero(el, item, emptyMessage) {
  el.replaceChildren();
  if (!item) {
    el.append(h("div", { class: "empty", text: emptyMessage }));
    return;
  }
  const read = h("a", { class: "btn-read", href: item.link, text: "Read Article" });
  read.insertAdjacentHTML("beforeend", ARROW);

  el.append(
    media(item, "hero-media", true),
    h(
      "div",
      { class: "hero-body" },
      h("span", { class: "pill", text: item.category }),
      h("h1", { class: "hero-title" }, h("a", { href: item.link, text: item.title })),
      item.summary ? h("p", { class: "hero-desc", text: item.summary }) : null,
      h("div", { class: "hero-foot" }, meta(item, true), read)
    )
  );
}

export function renderCards(el, items) {
  el.replaceChildren(
    ...items.map((item) =>
      h(
        "a",
        { class: "card", href: item.link },
        media(item, "card-media"),
        h("div", { class: "card-cat", text: `Category: ${item.category}` }),
        h("div", { class: "card-title", text: item.title }),
        meta(item)
      )
    )
  );
}

export function renderLatest(el, items) {
  el.replaceChildren(
    ...items.map((item) =>
      h(
        "li",
        {},
        h(
          "a",
          { href: item.link },
          media(item, "thumb"),
          h(
            "div",
            {},
            h("div", { class: "latest-title", text: item.title }),
            h("div", { class: "latest-cat", text: `Category: ${item.category}` })
          )
        )
      )
    )
  );
}
