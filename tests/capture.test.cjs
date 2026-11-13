// node tests/capture.test.cjs
// Runs al-capture.cjs capture() on a static page in Chrome: the normal run (layout tree + 1x screenshot) and shotOnly
// (screenshot only, 2x unless that passes Figma's 4096px image limit). No Figma needed.
// Needs Playwright: npm i -D playwright in this folder or a parent (uses the local Chrome when no browser has been downloaded).
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.log('SKIP playwright not found: run npm i -D playwright, then try again'); process.exit(0);
}
const { capture } = require(path.join(__dirname, '..', 'skills', 'code-to-figma', 'scripts', 'al-capture.cjs'));

const PAGE = h => `<!doctype html><html><body style="margin:0"><div style="height:${h}px;background:linear-gradient(#fff,#36c)">Orders</div></body></html>`;

// Width and height from the JPEG's start-of-frame marker
function jpegSize(file) {
  const b = fs.readFileSync(file);
  for (let i = 2; i < b.length;) {
    const marker = b[i + 1], len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  throw new Error('no size in ' + file);
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome' }); } catch (e) { browser = await chromium.launch(); }
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'al-capture-'));
  const run = async (id, { dpr, height, fullPage, shotOnly }) => {
    const context = await browser.newContext({ viewport: { width: 400, height: 300 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    await page.setContent(PAGE(height));
    const r = await capture(page, id, { out, fullPage, shotOnly });
    await context.close();
    return r;
  };
  const tests = {
    async 'normal run writes the layout tree and a 1x screenshot'() {
      const r = await run('N01', { dpr: 1, height: 300 });
      assert.ok(fs.existsSync(path.join(out, 'json', 'N01.json')));
      assert.deepStrictEqual(jpegSize(path.join(out, 'shot', 'N01.jpg')), [400, 300]);
      assert.ok(r.nodes > 0 && !r.shotOnly);
    },
    async 'shotOnly writes a 2x screenshot and no layout tree'() {
      const r = await run('S01', { dpr: 2, height: 300, shotOnly: true });
      assert.ok(!fs.existsSync(path.join(out, 'json', 'S01.json')));
      assert.deepStrictEqual(jpegSize(path.join(out, 'shot', 'S01.jpg')), [800, 600]);
      assert.deepStrictEqual([r.w, r.h, r.pixelRatio, r.shotOnly], [400, 300, 2, true]);
      assert.deepStrictEqual(r.warnings, []);
    },
    async 'shotOnly full page drops to 1x when 2x would pass 4096px'() {
      const r = await run('S02', { dpr: 2, height: 3000, fullPage: true, shotOnly: true });
      assert.deepStrictEqual(jpegSize(path.join(out, 'shot', 'S02.jpg')), [400, 3000]);
      assert.strictEqual(r.pixelRatio, 1);
      assert.deepStrictEqual(r.warnings, []);
    },
    async 'shotOnly warns when the screen itself is longer than 4096px'() {
      const r = await run('S03', { dpr: 2, height: 5000, fullPage: true, shotOnly: true });
      assert.ok(r.warnings.some(w => w.includes('4096')), JSON.stringify(r.warnings));
    },
  };
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
  }
  await browser.close();
  fs.rmSync(out, { recursive: true, force: true });
  console.log(`${Object.keys(tests).length - failed}/${Object.keys(tests).length} passed`);
  process.exit(failed ? 1 : 0);
})();
