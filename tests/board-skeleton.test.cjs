// node tests/board-skeleton.test.cjs
// Runs board-skeleton.js against a fake Figma, then hands the board to audit.js. No Figma account, no MCP calls.
// The fake covers only the API these two scripts use, and its layout is approximate: it catches runtime errors, matrix validation
// and structures that audit.js would reject, not real Figma layout details (glyph widths, line breaks). After changing the spec in
// board-format.md, run it once in real Figma.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { makeFigma, runScript } = require('./fake-figma.cjs');

const DIR = path.join(__dirname, '..', 'skills', 'figma-state-board', 'scripts');
const skeleton = fs.readFileSync(path.join(DIR, 'board-skeleton.js'), 'utf8');
const audit = fs.readFileSync(path.join(DIR, 'audit.js'), 'utf8');
const shots = fs.readFileSync(path.join(DIR, 'screenshot-slots.js'), 'utf8');
const withSection = (src, id) => src.replace("'REPLACE_ME'", JSON.stringify(id));
const img = hash => [{ type: 'IMAGE', scaleMode: 'FIT', imageHash: hash }];
const FONTS = [['Roboto', 'Bold'], ['Noto Sans TC', 'Regular'], ['Noto Sans TC', 'Bold'], ['Inter', 'Regular'], ['Inter', 'Bold']];

const DESKTOP = {
  lang: 'en', name: 'App-Inbox', pageName: null, title: 'Inbox · Desktop UI', subtitle: 'Desktop 1280 · Member / Manager / Admin',
  groups: [
    { title: '01 · Page load', desc: 'Shared frame while data loads.', viewport: { width: 1280, height: 800 }, cards: [
      { id: 'L01', name: 'Loading', desc: 'Data not back yet; the content area shows only a spinner.' },
      { id: 'L02', name: 'Load failed', desc: 'API returns an error; shows the message, no retry button (see G01).' },
      { id: 'L03', name: 'No permission', desc: 'API returns 403; lock icon and a back link.' } ] },
    { title: '02 · My tasks', desc: 'Regular member, full page.', viewport: { width: 1280, height: 900 },
      // A prototype card named "Suggested …" must not be read as carrying the Suggested tag
      cards: ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07'].map(id => ({ id, name: id === 'E01' ? 'Suggested products' : 'State ' + id, desc: 'Trigger; result.' })) },
  ],
  gaps: { checked: ['loading'], cards: [
    { id: 'G01', name: 'Load failure has no retry', tag: 'suggested', desc: 'Only the error message shows.', must: ['How to retry', 'An error message people understand'], basis: 'LoadState.vue:21', related: 'Affects L02, L03' },
    { id: 'G02', name: 'Invalid promo code', tag: 'spec', desc: 'An expired promo code is entered.', must: ['Explain why'], basis: 'AC CHK-15', related: 'Affects E01' } ] },
};
const DESKTOP_ZH = {
  ...DESKTOP, lang: 'zh-TW', name: 'App-Inbox-zh', title: 'Inbox · Desktop UI', subtitle: '桌機 1280 · 成員 / 主管 / 管理員',
  groups: [
    { ...DESKTOP.groups[0], title: '01 · 頁面載入', desc: '讀資料時的共用外框。', cards: [
      { id: 'L01', name: '載入中', desc: '資料還沒回來；內容區只顯示轉圈。' },
      { id: 'L02', name: '載入失敗', desc: 'API 回錯誤；顯示錯誤訊息，沒有重試按鈕（見 G01）。' },
      { id: 'L03', name: '沒有權限', desc: 'API 回 403；顯示鎖頭和返回連結。' } ] },
    { ...DESKTOP.groups[1], title: '02 · 我的待辦', desc: '一般成員，整頁畫面。', cards: DESKTOP.groups[1].cards.map(c => ({ ...c, name: '狀態 ' + c.id, desc: '觸發條件；畫面結果。' })) },
  ],
  gaps: { checked: ['載入'], cards: [
    // Boards written before 0.7.0 passed the Chinese labels as tags; still accepted
    { id: 'G01', name: '載入失敗沒有重試', tag: '建議補', desc: '畫面只顯示錯誤訊息。', must: ['怎麼重試', '錯誤訊息要看得懂'], basis: 'LoadState.vue:21', related: '影響 L02、L03' },
    { id: 'G02', name: '優惠碼無效', tag: '規格有寫', desc: '輸入過期的優惠碼。', must: ['說明原因'], basis: 'AC CHK-15', related: '影響 E01' } ] },
};
const NO_GAPS = {
  ...DESKTOP, name: 'App-NoGaps',
  groups: DESKTOP.groups.map(g => ({ ...g, cards: g.cards.map(c => ({ ...c, desc: c.desc.replace(' (see G01)', '') })) })),
  gaps: { checked: ['loading', 'empty states'], cards: [] },
};
const withBoard = board => (board ? skeleton.replace(/const BOARD = \{[\s\S]*?\n\};\n/, `const BOARD = ${JSON.stringify(board)};\n`) : skeleton);

async function build(board, fonts = FONTS) {
  const figma = makeFigma({ fonts });
  const r = await runScript(withBoard(board), figma);
  const a = await runScript(audit.replace("'REPLACE_ME'", JSON.stringify(r.sectionId)), figma);
  return { r, a, figma };
}

const tests = {
  async 'built-in example passes the audit'() {
    const { r, a } = await build(null);
    assert.deepStrictEqual(a.issues, []);
    assert.strictEqual(Object.keys(r.slots).length, 2);
    assert.strictEqual(r.lang, 'en');
    assert.strictEqual(r.fonts.body, 'Inter');
  },
  async 'English desktop matrix: slots, summary, audit'() {
    const { r, a } = await build(DESKTOP);
    assert.deepStrictEqual(a.issues, []);
    assert.strictEqual(Object.keys(r.slots).length, 10);
    assert.strictEqual(r.summary, 'Prototype 10 · Gaps 2 (In spec 1 · Suggested 1)');
    assert.deepStrictEqual(a.count, { prototype: 10, spec: 1, suggested: 1 });
  },
  async 'zh-TW board: Chinese labels, CJK font, old tag values accepted'() {
    const { r, a } = await build(DESKTOP_ZH);
    assert.deepStrictEqual(a.issues, []);
    assert.strictEqual(r.summary, '原型 10 · 缺漏 2（規格有寫 1 · 建議補 1）');
    assert.deepStrictEqual(a.count, { prototype: 10, spec: 1, suggested: 1 });
    assert.strictEqual(r.fonts.body, 'Noto Sans TC');
  },
  async 'English board with CJK card text uses a CJK font'() {
    const board = { ...DESKTOP, groups: [{ ...DESKTOP.groups[0], cards: [{ id: 'L01', name: '載入中', desc: 'Spinner.' }, ...DESKTOP.groups[0].cards.slice(1)] }, DESKTOP.groups[1]] };
    const { r, a } = await build(board);
    assert.deepStrictEqual(a.issues, []);
    assert.strictEqual(r.fonts.body, 'Noto Sans TC');
  },
  async 'keeps the gap check group when there are no gaps'() {
    const { a } = await build(NO_GAPS);
    assert.deepStrictEqual(a.issues, []);
    assert.strictEqual(a.groups, 3);
  },
  async 'falls back and warns without Noto Sans TC'() {
    const { r, a } = await build(DESKTOP_ZH, [['Roboto', 'Bold'], ['PingFang TC', 'Regular'], ['PingFang TC', 'Bold']]);
    assert.deepStrictEqual(a.issues, []);
    assert.strictEqual(r.fonts.body, 'PingFang TC');
    assert.ok(r.warnings.some(w => w.includes('PingFang TC')));
  },
  async 'falls back and warns without Inter'() {
    const { r, a } = await build(DESKTOP, [['Roboto', 'Bold'], ['Roboto', 'Regular']]);
    assert.deepStrictEqual(a.issues, []);
    assert.strictEqual(r.fonts.body, 'Roboto');
    assert.ok(r.warnings.some(w => w.includes('Inter')));
  },
  async 'unknown lang uses English labels and warns'() {
    const { r, a } = await build({ ...DESKTOP, lang: 'ja' });
    assert.deepStrictEqual(a.issues, []);
    assert.strictEqual(r.lang, 'en');
    assert.ok(r.warnings.some(w => w.includes('"ja"')));
  },
  async 'audit flags a summary that disagrees with the cards'() {
    const figma = makeFigma({ fonts: FONTS });
    const r = await runScript(withBoard(DESKTOP), figma);
    const sec = await figma.getNodeByIdAsync(r.sectionId);
    const summary = sec.children.find(n => n.type === 'TEXT' && n.characters.startsWith('Prototype'));
    summary.characters = 'Prototype 9 · Gaps 2 (In spec 1 · Suggested 1)';
    const a = await runScript(audit.replace("'REPLACE_ME'", JSON.stringify(r.sectionId)), figma);
    assert.ok(a.issues.some(i => i.includes('Prototype 9')), JSON.stringify(a.issues));
  },
  async 'audit reports empty screen slots without calling them issues'() {
    const { a } = await build(DESKTOP);
    assert.deepStrictEqual(a.issues, []);
    assert.deepStrictEqual(a.screens, { layers: 0, screenshots: 0, empty: ['L01', 'L02', 'L03', 'E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07'] });
  },
  async 'screenshot slots: fills, child layers and loose page layers all land in their cards'() {
    // 2x screenshots: L01 a 1280x800 viewport, L02 a 1280x2000 full page, L03 too narrow, E01 never uploaded
    const figma = makeFigma({ fonts: FONTS, images: { a: { width: 2560, height: 1600 }, b: { width: 2560, height: 4000 }, c: { width: 640, height: 400 } } });
    const r = await runScript(withBoard(DESKTOP), figma);
    const sec = await figma.getNodeByIdAsync(r.sectionId);
    const before = sec.height;
    const slot = async id => figma.getNodeByIdAsync(r.slots[id]);
    (await slot('L01')).fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }, ...img('a')]; // upload_assets with nodeIds
    const inner = figma.createRectangle(); inner.fills = img('b'); (await slot('L02')).appendChild(inner); // image placed inside the slot
    const loose = figma.createRectangle(); loose.name = 'L03.jpg'; loose.fills = img('c'); // image left on the page
    const stray = figma.createRectangle(); stray.name = 'Z99.jpg'; stray.fills = img('a');
    const built = figma.createFrame(); (await slot('E02')).appendChild(built); built.appendChild(figma.createFrame()); // a rebuilt screen stays as it is
    const s = await runScript(withSection(shots, r.sectionId), figma);
    assert.deepStrictEqual(s.placed.map(x => [x.id, ...x.size]), [['L01', 1280, 800], ['L02', 1280, 2000], ['L03', 1280, 800]]);
    assert.deepStrictEqual(s.skipped, ['E02']);
    assert.deepStrictEqual(s.missing, ['E01', 'E03', 'E04', 'E05', 'E06', 'E07']);
    assert.ok(s.warnings.some(w => w.startsWith('L03') && w.includes('blurry')), JSON.stringify(s.warnings));
    assert.ok(s.warnings.some(w => w.includes('Z99.jpg')), JSON.stringify(s.warnings));
    const l1 = await slot('L01'), l2 = await slot('L02');
    assert.deepStrictEqual(l1.fills, [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: 'a' }]);
    assert.strictEqual(l1.name, 'Screen (browser screenshot)');
    assert.strictEqual(l1.placeholder, false);
    assert.strictEqual(l2.children.length, 0);
    assert.ok(inner.removed && loose.removed && !stray.removed);
    assert.ok(sec.height > before, 'the section grows with the full-page screenshot');
    const a = await runScript(withSection(audit, r.sectionId), figma);
    assert.deepStrictEqual(a.issues, []);
    assert.deepStrictEqual(a.screens, { layers: 1, screenshots: 3, empty: ['E01', 'E03', 'E04', 'E05', 'E06', 'E07'] });
    // Running it again changes nothing
    const again = await runScript(withSection(shots, r.sectionId), figma);
    assert.deepStrictEqual(again.placed.map(x => x.id), ['L01', 'L02', 'L03']);
  },
  async 'screenshot slots: zh-TW board gets the Chinese layer name'() {
    const figma = makeFigma({ fonts: FONTS, images: { a: { width: 2560, height: 1600 } } });
    const r = await runScript(withBoard(DESKTOP_ZH), figma);
    const l1 = await figma.getNodeByIdAsync(r.slots.L01); l1.fills = img('a');
    const s = await runScript(withSection(shots, r.sectionId), figma);
    assert.deepStrictEqual(s.placed.map(x => x.id), ['L01']);
    assert.strictEqual(l1.name, '畫面（瀏覽器截圖）');
  },
  async 'duplicate card ID: nothing is written'() {
    await assert.rejects(build({ ...DESKTOP, gaps: { ...DESKTOP.gaps, cards: [{ ...DESKTOP.gaps.cards[0], id: 'L01' }] } }), /Duplicate/);
  },
  async 'reference to a missing card: nothing is written'() {
    await assert.rejects(build({ ...DESKTOP, gaps: { ...DESKTOP.gaps, cards: [{ ...DESKTOP.gaps.cards[0], related: 'Affects L09' }] } }), /L09/);
  },
  async 'error codes and the like in a description are not card references'() {
    // ERR42, IE11 and UTF16 look like card IDs, but no card on this board uses those letters
    const cards = [{ ...DESKTOP.gaps.cards[0], desc: 'API returns ERR42 on IE11; the body is UTF16.', related: 'Affects L02' }, DESKTOP.gaps.cards[1]];
    const { a } = await build({ ...DESKTOP, gaps: { ...DESKTOP.gaps, cards } });
    assert.deepStrictEqual(a.issues, []);
  },
  async 'gap card without a basis: nothing is written'() {
    await assert.rejects(build({ ...DESKTOP, gaps: { ...DESKTOP.gaps, cards: [{ ...DESKTOP.gaps.cards[0], basis: '' }] } }), /basis/);
  },
  async 'unknown tag: nothing is written'() {
    await assert.rejects(build({ ...DESKTOP, gaps: { ...DESKTOP.gaps, cards: [{ ...DESKTOP.gaps.cards[0], tag: 'maybe' }] } }), /tag must be/);
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
  }
  console.log(`${Object.keys(tests).length - failed}/${Object.keys(tests).length} passed`);
  process.exit(failed ? 1 : 0);
})();
