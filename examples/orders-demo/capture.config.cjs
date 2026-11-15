// Capture config for the four states of the orders page.
//   Layers:      node <plugin>/skills/code-to-figma/scripts/al-capture.cjs capture.config.cjs
//   Screenshots: SHOT_ONLY=1 node <plugin>/skills/code-to-figma/scripts/al-capture.cjs capture.config.cjs
// Each card opens the page with ?state=, and the dev server's mock API answers for that state (vite.config.js).
const path = require('path');
const waitFor = selector => async page => { await page.locator(selector).first().waitFor({ timeout: 20000 }); };

module.exports = {
  project: __dirname, // Playwright is looked up here (npm install puts it in this folder)
  url: 'http://localhost:5174',
  viewport: { width: 1024, height: 640 },
  out: path.join(__dirname, 'capture'), // ignored by git
  shotOnly: !!process.env.SHOT_ONLY, // screenshots only, for state boards with browser screenshots in the cards
  cards: {
    O01: { url: '/', run: waitFor('li >> text=Avery Brooks') },
    O02: { url: '/?state=empty', run: waitFor('text=No orders yet') },
    O03: { url: '/?state=loading', run: waitFor('[aria-busy=true]') },
    O04: { url: '/?state=error', run: waitFor('[role=alert]') },
  },
};
