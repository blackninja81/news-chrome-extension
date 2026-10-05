// Thin wrapper over chrome.storage.local, with a localStorage fallback so the
// page can also be opened as a plain file during development.

const hasChrome =
  typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

export async function get(key, fallback = null) {
  try {
    if (hasChrome) {
      const res = await chrome.storage.local.get(key);
      return res[key] ?? fallback;
    }
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function set(key, value) {
  try {
    if (hasChrome) await chrome.storage.local.set({ [key]: value });
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: ignore, the app still works */
  }
}
