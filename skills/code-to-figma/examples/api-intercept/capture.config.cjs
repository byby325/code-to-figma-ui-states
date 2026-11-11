// Use this setup for projects with no e2e fixtures, where all data comes from backend APIs: node <al-capture.cjs> capture.config.cjs [ID...]
// The frontend runs on the dev server (only dev mode has component info), and scenarios.cjs intercepts the APIs and returns the responses. No sign-in and no repo changes needed.
// Copy this whole folder into the working directory, then change the API paths, cards and wait conditions.
const { S, route } = require('./scenarios.cjs');

// Cards with content wait for the heading; loading and error cards wait for the matching text (replace with your project's own selectors or copy)
const loaded = { url: '/orders', fullPage: true, run: async page => { await page.waitForSelector('main h1', { timeout: 20000 }); } };
const waitText = text => ({ url: '/orders', fullPage: false, run: async page => { await page.getByText(text).first().waitFor({ timeout: 20000 }); } });

const cards = {};
for (const id of Object.keys(S)) cards[id] = { ...loaded };
cards.L01 = waitText('Loading');
cards.L02 = waitText("The server isn't responding right now");
cards.L03 = waitText("You don't have permission");

module.exports = {
  project: __dirname, // playwright is installed in the working directory: npm i -D playwright (with PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1, the local Chrome is used instead)
  url: 'http://localhost:5173',
  viewport: { width: 1280, height: 800 },
  out: './capture',
  setup: async (context, id) => { await route(context, id); },
  cards,
};
