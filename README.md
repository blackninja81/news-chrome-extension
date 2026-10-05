# UBC News – New Tab extension

A Manifest V3 browser extension that replaces the new tab page with a news dashboard:
sidebar sections, search, clock, featured story, story cards, latest list and a quote of the day.
Headlines come live from BBC News and NPR RSS feeds.

## Folder structure

```
ubc-news-newtab/
├── manifest.json        # Extension config: new tab override, permissions, icons
├── newtab.html          # The page shown on every new tab
├── css/
│   └── styles.css       # Layout, light/dark themes, responsive rules
├── js/
│   ├── app.js           # Entry point: state, navigation, search, clock, settings
│   ├── config.js        # Sections, feed URLs, quotes, default settings
│   ├── feed.js          # RSS fetch + parse + merge
│   ├── ui.js            # DOM rendering for hero, cards, latest list
│   └── storage.js       # chrome.storage wrapper (feed cache + settings)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Run it

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose the `ubc-news-newtab` folder.
4. Open a new tab.

After editing code, click the reload icon on the extension card, then open a new tab.

## Customise

- **Add or change news sources:** edit `FEEDS` in `js/config.js`, and add the feed's domain
  to `host_permissions` in `manifest.json`. Any standard RSS 2.0 feed works.
- **Add a section:** add it to `SECTIONS` and `FEEDS` in `config.js`, then add a matching
  button with `data-section="..."` in the sidebar of `newtab.html`.
- **Quick links:** edit the `<a class="nav-item">` entries in `newtab.html`.
- **Quotes:** edit `QUOTES` in `config.js` (one is picked per day).
- **Colors and fonts:** CSS variables at the top of `css/styles.css`.

## Notes

- Feeds are cached, so the tab renders instantly and refreshes in the background.
  The refresh interval is in Settings (default 15 minutes).
- Keyboard: `/` focuses search, `Esc` clears it.
- Reuters and AP don't offer public RSS feeds, so they appear as quick links only.
- All feed text is inserted as plain text, never as HTML.
