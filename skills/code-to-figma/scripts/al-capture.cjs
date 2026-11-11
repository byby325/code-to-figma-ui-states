#!/usr/bin/env node
// al-capture.cjs CONFIG [ID...]
// Uses Playwright to put each screen into its state, extract the layout tree and take a reference screenshot. Outputs <out>/json/<ID>.json, <out>/shot/<ID>.jpg, <out>/stats.json.
// The CONFIG format is in references/web-capture.md. In-page extraction is done by al-extract.js. You can also require this file and call capture() from a spec.
const fs = require('fs');
const path = require('path');

const MAX_FULL_HEIGHT = 8000; // Taller content is cut off with a warning: a screen that long is too much for the layout tree and for Figma
const SETTLE_MS = 450; // Wait for transition animations after interaction
const FULL_PAGE_MS = 800; // Wait for lazy loading after enlarging the viewport
const SETTLE_TIMEOUT_MS = 8000; // Upper limit for waiting on network and images. Pages that poll nonstop never reach idle, so continue when time is up
const ICON_TIMEOUT_MS = 3000; // Upper limit for waiting on lazy-loaded icons. A blocked source never arrives; the stats warning reports it
const SCROLL_TIMEOUT_MS = 3000; // Upper limit for waiting on smooth scrolling to stop

const readPreset = name => (name ? JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'figma-library-binding', 'presets', name + '.json'), 'utf8')) : {});

function loadPlaywright(config, base) {
  for (const name of ['@playwright/test', 'playwright']) {
    try { return require(require.resolve(name, { paths: [config.project, base, process.cwd()].filter(Boolean) })); } catch (e) { /* try the next one */ }
  }
  console.error('Playwright not found. Point project in the config to a project that has @playwright/test installed, or run npm i playwright in the working directory');
  process.exit(2);
}

// Images often sit on CDNs without CORS, and extracting them needs fetch and canvas reads, so the test browser turns off the same-origin policy
const CHROME_ARGS = ['--disable-web-security'];
async function launch(chromium) {
  try { return await chromium.launch({ channel: 'chrome', args: CHROME_ARGS }); } catch (e) { return chromium.launch({ args: CHROME_ARGS }); }
}

// Seed the random numbers so mocked amounts and ordering are the same on every rerun; otherwise components can't be reused
const SEED_RANDOM = `(() => { let s = 20240229; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();`;

// Content may be in the body or in an inner scroll container, so measure both
const measure = page => page.evaluate(() => {
  const doc = document.scrollingElement || document.documentElement;
  let extra = 0;
  for (const el of document.querySelectorAll('*')) {
    if (el.clientHeight < innerHeight * 0.4 || !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue;
    extra = Math.max(extra, el.scrollHeight - el.clientHeight);
  }
  return Math.ceil(Math.max(doc.scrollHeight, innerHeight + extra));
});

async function expandToFullPage(page, width, warnings) {
  let height = await measure(page);
  for (let i = 0; i < 3; i++) {
    const capped = Math.min(height, MAX_FULL_HEIGHT);
    await page.setViewportSize({ width, height: capped });
    await page.waitForTimeout(FULL_PAGE_MS);
    const next = await measure(page);
    if (next <= capped) return;
    if (capped === MAX_FULL_HEIGHT) { warnings.push(`Content is ${next} tall, cut off at ${MAX_FULL_HEIGHT}`); return; }
    height = next;
  }
  warnings.push('Full-page height did not settle; the content may use 100vh');
}

// Sections often load after hydration, so wait for data and images to arrive before freezing timers
async function waitForContent(page) {
  await page.waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT_MS }).catch(() => {});
  await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: SETTLE_TIMEOUT_MS }).catch(() => {});
  // Lazy-loaded icons get their content only after their fetch returns, so an svg may still be empty when the network is idle
  await page.waitForFunction(() => ![...document.querySelectorAll('svg')].some(s => !s.children.length && s.getBoundingClientRect().width > 0), null, { timeout: ICON_TIMEOUT_MS }).catch(() => {});
}

// Capturing before the smooth scroll after a click has stopped puts positions a few px off each time. Continue only when the page and inner scroll containers have not moved across two consecutive samples
async function waitForScrollIdle(page) {
  await page.waitForFunction(() => {
    const now = [scrollX, scrollY, ...[...document.querySelectorAll('*')].filter(e => e.scrollTop || e.scrollLeft).map(e => e.scrollTop + ',' + e.scrollLeft)].join('|');
    const same = window.__alLastScroll === now; window.__alLastScroll = now;
    return same;
  }, null, { polling: 120, timeout: SCROLL_TIMEOUT_MS }).catch(() => {});
}

// Capture one screen. When the project's mocks are Playwright fixtures, set up the state in a spec and call this directly (see references/web-capture.md)
// options: out (output folder), preset, extract, settle, hide, fullPage
async function capture(page, id, options) {
  const out = path.resolve(options.out);
  fs.mkdirSync(path.join(out, 'json'), { recursive: true });
  fs.mkdirSync(path.join(out, 'shot'), { recursive: true });
  const preset = readPreset(options.preset);
  await page.waitForTimeout(SETTLE_MS);
  await page.addScriptTag({ path: path.join(__dirname, 'al-extract.js') });
  if (options.hide && options.hide.length) await page.addStyleTag({ content: options.hide.map(s => `${s}{display:none !important}`).join('\n') });
  const warnings = [];
  await waitForContent(page);
  // Lazy loading and carousels must keep running while the viewport is enlarged, so freeze only after enlarging
  if (options.fullPage) {
    await expandToFullPage(page, page.viewportSize().width, warnings);
    await waitForContent(page);
  }
  // Resetting carousels to the first slide needs requestAnimationFrame, so do it before freezing, then wait for scrolling to stop
  if (await page.evaluate(() => __alResetCarousels())) await page.waitForTimeout(300);
  await waitForScrollIdle(page);
  await page.evaluate(s => { __alFreeze(); __alSettle(s); }, options.settle || []);
  await page.waitForTimeout(150);
  const data = await page.evaluate(([n, o]) => __alExtract(n, o), [id, { ...preset.extract, ...options.extract }]);
  if (!data.framework) warnings.push('No component info: production build or a framework without an adapter; only repeated structures are detected');
  const json = JSON.stringify(data).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  fs.writeFileSync(path.join(out, 'json', id + '.json'), json);
  const shot = path.join(out, 'shot', id + '.jpg');
  // The first screenshot is often the previous frame
  await page.screenshot({ path: shot, type: 'jpeg', quality: 85 });
  await page.screenshot({ path: shot, type: 'jpeg', quality: 85 });
  const images = Object.values(data.images);
  // Icons the preset doesn't map yet: look them up in the library and add them to the preset, and they bind automatically next time
  const known = (preset.libs && preset.libs.icons) || {}, unmapped = new Set();
  let emptyIcons = 0;
  (function walk(j) { if (j.lib && !known[j.lib]) unmapped.add(j.lib); if (j.empty) emptyIcons++; (j.kids || []).forEach(walk); })(data.root);
  if (emptyIcons) warnings.push(`${emptyIcons} icons are empty: the source is blocked or not loaded yet, so Figma will be missing images or use the wrong color. Allow the icon domains and capture again`);
  return { id, w: data.w, h: data.h, nodes: data.count, jsonKB: Math.round(json.length / 1024), images: images.length, missingImages: images.filter(v => !v).length, framework: data.framework, unmappedIcons: [...unmapped], warnings };
}

async function main() {
  const configPath = path.resolve(process.argv[2] || '');
  if (!process.argv[2] || !fs.existsSync(configPath)) { console.error('Usage: node al-capture.cjs <config.cjs> [ID...]'); process.exit(2); }
  const config = require(configPath);
  const base = path.dirname(configPath);
  const only = process.argv.slice(3);
  const out = path.resolve(base, config.out || 'capture');
  const { chromium } = loadPlaywright(config, base);
  const browser = await launch(chromium);
  const ids = only.length ? only : Object.keys(config.cards);
  const stats = [];
  for (const id of ids) {
    const card = config.cards[id];
    if (!card) { stats.push({ id, error: 'no such card in the config' }); continue; }
    // Open a new context for each card so the previous card's login and localStorage don't carry over
    const context = await browser.newContext({ viewport: card.viewport || config.viewport, deviceScaleFactor: 1, bypassCSP: true, ...config.contextOptions });
    try {
      await context.addInitScript(SEED_RANDOM);
      // Shared setup runs first, then this card's own setup: routes registered later are matched first, so a card can override the shared interception
      if (config.setup) await config.setup(context, id, card);
      if (card.setup) await card.setup(context, id);
      const page = await context.newPage();
      await page.goto(new URL(card.url || '/', config.url).href, { waitUntil: 'domcontentloaded' });
      if (config.ready) await config.ready(page, id, card);
      if (card.run) await card.run(page, id);
      const r = await capture(page, id, { ...config, out, fullPage: card.fullPage !== undefined ? card.fullPage : config.fullPage });
      stats.push(r); console.log(JSON.stringify(r));
    } catch (e) {
      stats.push({ id, error: e.message.slice(0, 300) });
      console.log('FAIL', id, e.message.slice(0, 300).replace(/\n/g, ' '));
    }
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out, only.length ? 'stats-partial.json' : 'stats.json'), JSON.stringify(stats, null, 1));
  const failed = stats.filter(s => s.error).length;
  console.log(`DONE ${stats.length} screens, ${failed} failed, output in ${out}`);
  process.exit(failed ? 1 : 0);
}

module.exports = { capture };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
