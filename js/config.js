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
};

export const FEEDS = {
  main: [
    { url: `${BBC}/rss.xml`, source: "BBC News", category: "Top Stories" },
    { url: `${NPR}/1001/rss.xml`, source: "NPR", category: "Top Stories" },
  ],
  world: [
    { url: `${BBC}/world/rss.xml`, source: "BBC News", category: "World" },
    { url: `${NPR}/1004/rss.xml`, source: "NPR", category: "World" },
  ],
  politics: [
    { url: `${BBC}/politics/rss.xml`, source: "BBC News", category: "Politics" },
    { url: `${NPR}/1014/rss.xml`, source: "NPR", category: "Politics" },
  ],
  business: [
    { url: `${BBC}/business/rss.xml`, source: "BBC News", category: "Business" },
    { url: `${NPR}/1006/rss.xml`, source: "NPR", category: "Business" },
  ],
  technology: [
    { url: `${BBC}/technology/rss.xml`, source: "BBC News", category: "Technology" },
    { url: `${NPR}/1019/rss.xml`, source: "NPR", category: "Technology" },
  ],
  sports: [
    { url: "https://feeds.bbci.co.uk/sport/rss.xml", source: "BBC Sport", category: "Sports" },
    { url: `${NPR}/1055/rss.xml`, source: "NPR", category: "Sports" },
  ],
};

export const DEFAULTS = {
  theme: "auto", // auto | light | dark
  clock: "24", // 24 | 12
  refresh: 15, // minutes
  section: "main",
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
