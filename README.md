# UBC News – New Tab extension

A Manifest V3 browser extension that replaces the new tab page with a news dashboard:
sidebar sections, search, clock, featured story, story cards, latest list and a quote of the day.
Headlines come live from 17 sources (BBC, NPR, NY Times, Guardian, Al Jazeera, Wired, The Verge, Bloomberg and more) via RSS and Atom feeds.

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

- **Change built-in sources:** edit `FEEDS` in `js/config.js`, and add the feed's domain
  to `host_permissions` in `manifest.json`. Any standard RSS 2.0 feed works.
- **Add a section:** add it to `SECTIONS` and `FEEDS` in `config.js`, then add a matching
  button with `data-section="..."` in the sidebar of `newtab.html`.
- **Quick links:** edit the `<a class="nav-item">` entries in `newtab.html`.
- **Quotes:** edit `QUOTES` in `config.js` (one is picked per day).
- **Colors and fonts:** CSS variables at the top of `css/styles.css`.

## Notes

- Feeds are cached, so the tab renders instantly and refreshes in the background.
  The refresh interval is in Settings (default 15 minutes).
- Search covers every category. Use several words (all must match), "exact phrases", and -exclude.
  Filter results with the category and source chips.
- Save stories with the bookmark icon; they appear under **Saved**. Opened stories are dimmed.
- Keyboard: `/` search, `Esc` clear, `R` refresh, `1`-`8` switch sections.
- **Add your own feed:** Settings -> Your feeds. Paste a feed or website address; the extension
  finds the feed, asks permission for that one site, and adds it to the section you pick.
- Set `FEEDBACK_URL` in `js/config.js` (form or mailto: link) to show a Send feedback button.
- Settings: per-source on/off, open links in a new tab, mix sources evenly, clear read history.
- Reuters and AP don't offer public RSS feeds, so they appear as quick links only.
- All feed text is inserted as plain text, never as HTML.
