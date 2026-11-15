// node tests/extract.test.cjs
// Opens a static test page in Chrome, injects al-extract.js and checks the extracted layout tree. No Figma needed.
// Needs Playwright: npm i -D playwright in this folder or a parent (uses the local Chrome when no browser has been downloaded).
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.log('SKIP playwright not found: run npm i -D playwright, then try again'); process.exit(0);
}
const EXTRACT = path.join(__dirname, '..', 'skills', 'code-to-figma', 'scripts', 'al-extract.js');

const LUCIDE_BELL = 'data:image/svg+xml;utf8,' + encodeURIComponent('<!-- @license lucide-static --><svg class="lucide" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>');
const PAGE = `<!doctype html><html><head><style>
  body { margin: 0; font: 14px/20px sans-serif; }
  .oklch { width: 200px; height: 40px; background: oklch(0.7 0.15 250); color: oklch(0.2 0 0); }
  .srgb { width: 200px; height: 40px; background: color(srgb 1 0.5 0); border: 2px solid color(srgb 0 0 1); }
  .rgb { width: 200px; height: 40px; background: rgb(10, 20, 30); }
  .clear { width: 200px; height: 40px; background: oklch(0.5 0.1 100 / 0); }
  .grad { width: 200px; height: 40px; background: linear-gradient(to right in oklab, oklch(0.7 0.15 250), oklch(0.5 0.2 300)); box-shadow: 0 2px 4px oklch(0.7 0.15 250); }
  .radial { width: 200px; height: 40px; background: radial-gradient(circle at center, color(srgb 1 0.5 0) 0%, rgb(10, 20, 30) 100%); }
  .lucide-bell { display: inline-block; width: 16px; height: 16px; background-color: rgb(187, 111, 10);
    -webkit-mask: url("${LUCIDE_BELL}") no-repeat center / 100%; mask: url("${LUCIDE_BELL}") no-repeat center / 100%; }
</style></head><body>
  <div class="oklch" id="a">oklch</div>
  <div class="srgb" id="b">srgb</div>
  <div class="rgb" id="c">rgb</div>
  <div class="clear" id="d">clear</div>
  <span class="lucide-bell" id="icon"></span>
  <div class="grad" id="g">grad</div>
  <div class="radial" id="r">radial</div>
  <form style="background:#eee;padding:4px"><input type="password" id="pw" value="hunter2secret"><input type="range" id="rg" value="50"><input type="text" id="tx" value="plain value"></form>
  <div id="radix-_r_1_" class="inline-flex items-center px-2 animate-pulse" style="background:#eee;padding:4px">gen</div>
  <div id="main-nav" class="inline-flex items-center px-2" style="background:#eee;padding:4px">keep</div>
</body></html>`;

const near = (got, want, tol = 0.02) => want.every((v, i) => Math.abs(got[i] - v) <= tol); // Compare RGB only; the 4th value is alpha
function walk(j, fn) { fn(j); for (const k of j.kids || []) walk(k, fn); }
function fillsOf(j) { return (j.fl || []).filter(f => f && Array.isArray(f.c)).map(f => f.c); }

(async () => {
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome' }); } catch (e) { browser = await chromium.launch(); }
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  await page.setContent(PAGE);
  await page.addScriptTag({ path: EXTRACT });
  const data = await page.evaluate(() => __alExtract('T01', {}));
  await browser.close();

  const nodes = []; walk(data.root, j => nodes.push(j));
  // A text node's content is in n (first 40 characters) and s
  const isText = (j, t) => j.k === 'T' && j.n === t;
  const byText = t => nodes.find(j => (j.kids || []).some(k => isText(k, t)));
  const tests = {
    'oklch() background color is extracted': () => {
      const fills = nodes.flatMap(fillsOf);
      // Chrome converts oklch(0.7 0.15 250) to sRGB ≈ rgb(75, 163, 247); allow for 8-bit rounding and browser version differences
      assert.ok(fills.some(c => near(c, [0.294, 0.639, 0.969], 0.03)), `oklch background color not extracted: ${JSON.stringify(fills)}`);
    },
    'color(srgb …) background color is extracted': () => {
      assert.ok(nodes.flatMap(fillsOf).some(c => near(c, [1, 0.5, 0])), 'color(srgb 1 0.5 0) not extracted');
    },
    'rgb() still works': () => {
      assert.ok(nodes.flatMap(fillsOf).some(c => near(c, [10 / 255, 20 / 255, 30 / 255], 0.005)), 'rgb(10,20,30) not extracted');
    },
    'transparent oklch produces no fill': () => {
      const d = byText('clear');
      assert.ok(d, 'clear node not found');
      assert.strictEqual(fillsOf(d).length, 0, 'a transparent background should have no fill');
    },
    'auto-generated ids and Tailwind utilities are not used as layer names; normal ids are': () => {
      const gen = byText('gen'), keep = byText('keep');
      assert.ok(gen && keep, 'test nodes not found');
      assert.strictEqual(gen.n, 'div', `radix-_r_1_ or inline-flex was used as the name: ${gen.n}`);
      assert.strictEqual(keep.n, 'main-nav');
    },
    'gradient with oklch() stops and "in oklab" keeps its direction and colors': () => {
      const g = byText('grad');
      assert.ok(g, 'grad node not found');
      const lin = (g.fl || []).find(f => f.t === 'L');
      assert.ok(lin, `no linear gradient: ${JSON.stringify(g.fl)}`);
      assert.strictEqual(lin.a, 90, 'to right should be 90deg');
      assert.strictEqual(lin.s.length, 2);
      assert.ok(near(lin.s[0].slice(1), [0.294, 0.639, 0.969], 0.03), `first stop: ${JSON.stringify(lin.s[0])}`);
    },
    'box-shadow with an oklch() color keeps the color and the offsets': () => {
      const sh = (byText('grad').ef || [])[0];
      assert.ok(sh, 'no shadow');
      assert.deepStrictEqual(sh.slice(0, 4), [0, 2, 4, 0]);
      assert.ok(near(sh.slice(4, 7), [0.294, 0.639, 0.969], 0.03), `shadow color: ${JSON.stringify(sh)}`);
    },
    'radial gradient with a color() stop is extracted': () => {
      const rad = (byText('radial').fl || []).find(f => f.t === 'R');
      assert.ok(rad && rad.s.length === 2, `no radial gradient: ${JSON.stringify(byText('radial').fl)}`);
      assert.ok(near(rad.s[0].slice(1), [1, 0.5, 0]), `first stop: ${JSON.stringify(rad.s[0])}`);
    },
    'a password is extracted as dots, a range input has no text, a text input keeps its value': () => {
      const texts = nodes.filter(j => j.k === 'T').map(j => j.s);
      assert.ok(!JSON.stringify(data).includes('hunter2secret'), 'the password value is in the extracted data');
      assert.ok(texts.includes('\u2022'.repeat(13)), `no dots for the password: ${JSON.stringify(texts)}`);
      assert.ok(!texts.includes('50'), 'the range value became text');
      assert.ok(texts.includes('plain value'));
    },
    'mask-image icon becomes an SVG colored with the background color': () => {
      const icon = nodes.find(j => j.k === 'S' && j.icon === 'lucide-bell');
      assert.ok(icon, `lucide-bell SVG node not found: ${JSON.stringify(nodes.filter(j => j.k === 'S').map(j => j.icon || j.n))}`);
      assert.ok(/stroke="rgb\(187,111,10\)"/.test(icon.svg), 'currentColor was not replaced with the background color');
      assert.ok(/width="16"/.test(icon.svg) && /viewBox="0 0 24 24"/.test(icon.svg), 'SVG size or viewBox is wrong');
      assert.ok(!/<!--/.test(icon.svg), 'license comment was not removed');
    },
  };
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
  }
  console.log(`${Object.keys(tests).length - failed}/${Object.keys(tests).length} passed`);
  process.exit(failed ? 1 : 0);
})();
