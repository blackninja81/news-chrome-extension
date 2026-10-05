// Central configuration: sections, feeds, quotes and default settings.
// To add a source, add a { url, source, category } entry to a section below
// and make sure its domain is listed in manifest.json -> host_permissions.

const BBC = "https://feeds.bbci.co.uk/news";
const NPR = "https://feeds.npr.org";

export const SECTIONS = {
  main: "Main News",
  world: "World",
  politics: "Politics",
  business: "Business",
  technology: "Technology",
  sports: "Sports",
  entertainment: "Entertainment",
  saved: "Saved", // virtual section: bookmarked articles, no feeds
};

export const FEEDS = {
  main: [
    { url: `${BBC}/rss.xml`, source: "BBC News", category: "Top Stories" },
    { url: `${NPR}/1001/rss.xml`, source: "NPR", category: "Top Stories" },
    { url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", source: "NY Times", category: "Top Stories" },
    { url: "https://feeds.feedburner.com/foxnews/latest", source: "Fox News", category: "Top Stories" },
    { url: "https://www.theatlantic.com/feed/all/", source: "The Atlantic", category: "Features" },
  ],
  world: [
    { url: `${BBC}/world/rss.xml`, source: "BBC News", category: "World" },
    { url: `${NPR}/1004/rss.xml`, source: "NPR", category: "World" },
    { url: "https://www.aljazeera.com/xml/rss/all.xml", source: "Al Jazeera", category: "World" },
    { url: "https://www.theguardian.com/international/rss", source: "The Guardian", category: "World" },
    { url: "https://www.economist.com/rss/the_world_this_week_rss.xml", source: "The Economist", category: "World This Week" },
  ],
  politics: [
    { url: `${BBC}/politics/rss.xml`, source: "BBC News", category: "Politics" },
    { url: `${NPR}/1014/rss.xml`, source: "NPR", category: "Politics" },
  ],
  business: [
    { url: `${BBC}/business/rss.xml`, source: "BBC News", category: "Business" },
    { url: `${NPR}/1006/rss.xml`, source: "NPR", category: "Business" },
    {
      url: "https://news.google.com/rss/search?q=when:24h+site:bloomberg.com&hl=en-US&gl=US&ceid=US:en",
      source: "Bloomberg",
      category: "Business",
      googleNews: true, // headlines end in " - Bloomberg.com"; description is link junk
    },
    { url: "https://www.entrepreneur.com/rss-feed/latest", source: "Entrepreneur", category: "Business" },
    { url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain", source: "Dow Jones", category: "Markets" },
    { url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", source: "NY Times", category: "Business" },
  ],
  technology: [
    { url: `${BBC}/technology/rss.xml`, source: "BBC News", category: "Technology" },
    { url: `${NPR}/1019/rss.xml`, source: "NPR", category: "Technology" },
    { url: "https://www.wired.com/feed/rss", source: "Wired", category: "Technology" },
    { url: "https://www.theverge.com/rss/index.xml", source: "The Verge", category: "Technology" },
  ],
  sports: [
    { url: "https://feeds.bbci.co.uk/sport/rss.xml", source: "BBC Sport", category: "Sports" },
    { url: `${NPR}/1055/rss.xml`, source: "NPR", category: "Sports" },
  ],
  entertainment: [
    { url: "https://www.tmz.com/rss.xml", source: "TMZ", category: "Entertainment" },
    { url: `${BBC}/entertainment_and_arts/rss.xml`, source: "BBC News", category: "Entertainment" },
    { url: `${NPR}/1008/rss.xml`, source: "NPR", category: "Arts & Life" },
  ],
};

// Tag every feed with its section, then expose flat lists used by search and settings.
for (const [section, list] of Object.entries(FEEDS)) list.forEach((f) => (f.section = section));
export const ALL_FEEDS = Object.values(FEEDS).flat();
export const SOURCES = [...new Set(ALL_FEEDS.map((f) => f.source))].sort();

export const DEFAULTS = {
  theme: "auto", // auto | light | dark
  clock: "24", // 24 | 12
  refresh: 15, // minutes
  section: "main",
  newTab: false, // open articles in a new tab
  mix: true, // interleave sources on section pages so one busy feed can't dominate
  disabled: [], // source names the user switched off in Settings
};

export const QUOTES = [
  { text: "The important thing is not to stop questioning.", author: "Albert Einstein" },
  { text: "Not everything that is faced can be changed, but nothing can be changed until it is faced.", author: "James Baldwin" },
  { text: "The pen is mightier than the sword.", author: "Edward Bulwer-Lytton" },
  { text: "The unexamined life is not worth living.", author: "Socrates" },
  { text: "Knowledge is power.", author: "Francis Bacon" },
  { text: "The best way to predict the future is to invent it.", author: "Alan Kay" },
  { text: "Democracy is the worst form of government, except for all those other forms that have been tried.", author: "Winston Churchill" },
  { text: "I think, therefore I am.", author: "René Descartes" },
  { text: "Whoever fights monsters should see to it that in the process he does not become a monster.", author: "Friedrich Nietzsche" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
];

// Where the "Send feedback" button in Settings points (a form URL or a mailto: link).
// Leave empty to hide the button.
export const FEEDBACK_URL = "";

// Upper bound on feeds a user can add themselves (each one is fetched on refresh).
export const MAX_CUSTOM_FEEDS = 20;
