// State board skeleton (use_figma, writes): builds the section, titles, groups, cards and gap-check wireframes from the state matrix.
// Usage: fill BOARD below with the matrix the user confirmed in step 2, then paste the whole script into one use_figma call.
// Output: each prototype card's "Screen" is a placeholder slot, and the result returns every card's slotId. When building screens,
// pass the slotId to __alBuild and the screen lands in its slot.
// New boards only. It stops if a section with the same name exists: update an existing board card by card (SKILL.md update rules), never rebuild it.
// Layout values follow references/board-format.md; change both together.

const BOARD = {
  lang: 'en',                                  // fixed labels: 'en' or 'zh-TW'. Match the language the user writes in; other languages use 'en'
  name: 'Shop-Checkout',                       // section name "<Project>-<Feature>"
  pageName: null,                              // shared files with one page per feature: the page name (created if missing); null = current page
  title: 'Checkout · Mobile UI',               // board title "<Feature> · <Platform> UI"
  subtitle: 'Mobile 375 · Signed out / Signed in', // board subtitle: every dimension value
  groups: [
    {
      title: '01 · Cart',                       // "NN · <dimension value or topic>"
      desc: 'Mobile 375, cart page.',           // rules every card in the group shares, one or two sentences
      viewport: { width: 375, height: 812 },   // card width W and placeholder height for this group
      cards: [
        { id: 'C01', name: 'Default', desc: '3 items; each row shows image, name, price and quantity; subtotal and checkout button at the bottom.' },
        { id: 'C02', name: 'Empty cart', desc: 'No items; illustration, "Your cart is empty" and a "Keep shopping" button; checkout button hidden.' },
      ],
    },
  ],
  gaps: {                                      // gap check, always the last group
    checked: ['loading', 'empty states', 'network and server'], // with no gap cards, the description says "Checked …; no gaps found."
    viewport: { width: 375 },                  // wireframe card width; defaults to the last group's width
    cards: [
      {
        id: 'G01', name: 'Network down', tag: 'suggested', // tag: 'spec' (In spec) or 'suggested' (Suggested)
        desc: "Submit fails offline; the prototype's catch only logs to the console, so the screen keeps spinning.",
        must: ['What happened', 'What the user can do', 'Whether entered data is kept'],
        basis: 'useSubmit.ts:22-25: the catch only logs',
        related: 'Affects C01',
      },
    ],
  },
};

// ---- No changes needed below ----
const GAP = 40, ROW_GAP = 64, PAD = 94;
const NAVY = '26304C', GREY = '444444';
const LABELS = {
  en: {
    spec: 'In spec', suggested: 'Suggested', gapGroup: 'Gap check', must: 'Must show', basis: 'Basis', related: 'Related', bullet: '• ',
    gapDesc: 'The prototype has no screen for these states yet. "In spec": the spec requires it and the prototype missed it. "Suggested": neither the spec nor the prototype mentions it; inferred from code evidence or the kind of feature, and design and product decide whether to build it.',
    none: list => `Checked ${list.join(', ')}; no gaps found.`,
    summary: c => `Prototype ${c.prototype} · Gaps ${c.spec + c.suggested} (In spec ${c.spec} · Suggested ${c.suggested})`,
    layer: { title: 'Board title', subtitle: 'Board subtitle', summary: 'Coverage summary', groupTitle: 'Group title', groupDesc: 'Group description', titleRow: 'Card title row', cardTitle: 'Card title', tag: 'Tag', cardDesc: 'Card description', screen: 'Screen', wireframe: 'Screen (wireframe)' },
  },
  'zh-TW': {
    spec: '規格有寫', suggested: '建議補', gapGroup: '缺漏檢查', must: '必須交代', basis: '依據', related: '相關卡', bullet: '・',
    gapDesc: '以下狀態原型還沒有畫面。「規格有寫」是規格有要求、原型漏做；「建議補」是規格和原型都沒提，依程式證據或功能類型推論，要不要做由設計與產品決定。',
    none: list => `已檢查${list.join('、')}，沒有發現缺漏。`,
    summary: c => `原型 ${c.prototype} · 缺漏 ${c.spec + c.suggested}（規格有寫 ${c.spec} · 建議補 ${c.suggested}）`,
    layer: { title: '板標題', subtitle: '板副標', summary: '覆蓋摘要', groupTitle: '群組標題', groupDesc: '群組描述', titleRow: '卡片標題列', cardTitle: '卡片標題', tag: '標籤', cardDesc: '卡片描述', screen: '畫面', wireframe: '畫面（線框）' },
  },
};
const L = LABELS[BOARD.lang] || LABELS.en;
const TAG_COLOR = { spec: { fg: '2F5BD3', bg: 'E8EEFB' }, suggested: { fg: 'C2410C', bg: 'FDEEE6' } };
// Tags are keys; the labels of either language are accepted too (boards written before 0.7.0 used the Chinese labels)
const TAG_KEY = { spec: 'spec', suggested: 'suggested' };
for (const l of Object.values(LABELS)) { TAG_KEY[l.spec] = 'spec'; TAG_KEY[l.suggested] = 'suggested'; }
const hex = h => ({ r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 });
const solid = h => [{ type: 'SOLID', color: hex(h) }];
const warnings = [];
if (BOARD.lang && !LABELS[BOARD.lang]) warnings.push(`No labels for lang "${BOARD.lang}"; fixed labels are in English`);

// Check the matrix first; write nothing if it's wrong
const ids = new Set();
const allCards = [...BOARD.groups.flatMap(g => g.cards), ...BOARD.gaps.cards];
for (const c of allCards) {
  if (!/^[A-Z]{1,3}\d{2}$/.test(c.id)) throw new Error(`Card ID ${c.id} must be 1–3 capital letters and two digits`);
  if (ids.has(c.id)) throw new Error(`Duplicate card ID ${c.id}`);
  ids.add(c.id);
}
for (const g of BOARD.groups) {
  if (!/^\d{2} · /.test(g.title)) throw new Error(`Group title "${g.title}" must be "NN · <name>"`);
  if (!g.viewport || !g.viewport.width) throw new Error(`${g.title} is missing viewport.width`);
  for (const c of g.cards) if (c.id.startsWith('G')) throw new Error(`${c.id}: the G prefix is reserved for the gap check`);
}
for (const c of BOARD.gaps.cards) {
  if (!c.id.startsWith('G')) throw new Error(`Gap card ${c.id} must have an ID starting with G`);
  if (!TAG_KEY[c.tag]) throw new Error(`Gap card ${c.id}: tag must be 'spec' or 'suggested'`);
  c.tag = TAG_KEY[c.tag];
  if (!c.basis) throw new Error(`Gap card ${c.id} has no basis`);
  for (const r of `${c.desc} ${c.related || ''}`.matchAll(/\b([A-Z]{1,3}\d{2})\b/g)) if (!ids.has(r[1])) throw new Error(`${c.id} refers to ${r[1]}, which is not in the matrix`);
}
for (const c of BOARD.groups.flatMap(g => g.cards)) for (const r of c.desc.matchAll(/\b([A-Z]{1,3}\d{2})\b/g)) if (!ids.has(r[1])) throw new Error(`${c.id} refers to ${r[1]}, which is not in the matrix`);

// Page: switch at most once
if (BOARD.pageName) {
  let page = figma.root.children.find(p => p.name === BOARD.pageName);
  if (!page) {
    try { page = figma.createPage(); page.name = BOARD.pageName; } catch (e) { throw new Error(`Could not add a page (Starter plans allow 3 pages per file): ${e.message}. Ask the user which page to use; never delete someone else's page`); }
  }
  await figma.setCurrentPageAsync(page);
}
if (figma.currentPage.children.some(n => n.type === 'SECTION' && n.name === BOARD.name)) throw new Error(`This page already has "${BOARD.name}": update an existing board card by card (SKILL.md update rules)`);

// Fonts: Chinese boards, or any board text with CJK, use Noto Sans TC (or a CJK font the file has); other boards use Inter
const fonts = await figma.listAvailableFontsAsync();
const has = (family, style) => fonts.some(f => f.fontName.family === family && f.fontName.style === style);
const needCJK = BOARD.lang === 'zh-TW' || /[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/.test(JSON.stringify(BOARD));
const wanted = needCJK ? ['Noto Sans TC', 'Noto Sans CJK TC', 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans'] : ['Inter', 'Roboto', 'Noto Sans'];
const body = wanted.find(f => has(f, 'Regular') && has(f, 'Bold'));
if (!body) throw new Error(`No ${needCJK ? 'CJK ' : ''}font with Regular and Bold (tried ${wanted.join(', ')}); ask the user which font to use`);
if (body !== wanted[0]) warnings.push(`${wanted[0]} isn't available; board text uses ${body}`);
const TITLE = has('Roboto', 'Bold') ? { family: 'Roboto', style: 'Bold' } : { family: body, style: 'Bold' };
if (TITLE.family !== 'Roboto') warnings.push(`Roboto Bold isn't available; the board title uses ${body} Bold`);
const R = { family: body, style: 'Regular' }, B = { family: body, style: 'Bold' };
await Promise.all([figma.loadFontAsync(TITLE), figma.loadFontAsync(R), figma.loadFontAsync(B)]);

function text(chars, font, size, lh, color, width) {
  const t = figma.createText();
  t.fontName = font; t.fontSize = size; t.lineHeight = { unit: 'PIXELS', value: lh }; t.fills = solid(color); t.characters = chars;
  if (width) { t.resize(width, lh); t.textAutoResize = 'HEIGHT'; }
  return t;
}
const perRow = W => (W <= 480 ? 6 : W <= 1024 ? 4 : W <= 1440 ? 3 : 2); // up to 6 phone cards per row; 2–3 desktop cards
const rowWidth = (W, n) => { const k = Math.max(1, Math.min(n, perRow(W))); return k * W + (k - 1) * GAP; };

// Board width: the widest group
const gapW = (BOARD.gaps.viewport && BOARD.gaps.viewport.width) || BOARD.groups[BOARD.groups.length - 1].viewport.width;
const widths = [...BOARD.groups.map(g => rowWidth(g.viewport.width, g.cards.length)), rowWidth(gapW, Math.max(1, BOARD.gaps.cards.length))];
const boardW = Math.max(...widths);

// Place it to the right of the page's existing content (measure first: once created, the section is on the page too)
const existing = figma.currentPage.children.length;
const right = figma.currentPage.children.reduce((m, n) => Math.max(m, n.x + n.width), 0);
const section = figma.createSection();
section.name = BOARD.name; section.fills = solid('F2F2F2');
section.x = existing ? Math.round(right + 400) : 0; section.y = 0;

const count = { prototype: BOARD.groups.reduce((s, g) => s + g.cards.length, 0), spec: 0, suggested: 0 };
for (const c of BOARD.gaps.cards) count[c.tag]++;
const summaryText = L.summary(count);
const t1 = text(BOARD.title, TITLE, 36, 50, NAVY, boardW); t1.name = L.layer.title;
const t2 = text(BOARD.subtitle, B, 20, 28, NAVY, boardW); t2.name = L.layer.subtitle;
const t3 = text(summaryText, R, 14, 20, GREY, boardW); t3.name = L.layer.summary;
for (const t of [t1, t2, t3]) section.appendChild(t);
t1.x = PAD; t1.y = 93; t2.x = PAD; t2.y = t1.y + t1.height + 12; t3.x = PAD; t3.y = t2.y + t2.height + 12;

const outer = figma.createAutoLayout('VERTICAL', { name: 'Groups', itemSpacing: 64 });
outer.fills = []; section.appendChild(outer); outer.x = PAD; outer.y = t3.y + t3.height + 96;

function group(title, desc, W, n) {
  const gw = n ? rowWidth(W, n) : boardW;
  const g = figma.createAutoLayout('VERTICAL', { name: title, itemSpacing: 20 }); g.fills = []; outer.appendChild(g);
  const gt = text(title, B, 28, 39, NAVY, gw); gt.name = L.layer.groupTitle; g.appendChild(gt);
  const gd = text(desc, R, 14, 20, GREY, gw); gd.name = L.layer.groupDesc; g.appendChild(gd);
  if (!n) return null;
  const row = figma.createAutoLayout('HORIZONTAL', { name: 'Scenarios', itemSpacing: GAP }); row.fills = []; g.appendChild(row);
  if (n > perRow(W)) { row.layoutWrap = 'WRAP'; row.counterAxisSpacing = ROW_GAP; }
  row.resize(gw, 100); row.primaryAxisSizingMode = 'FIXED'; row.counterAxisSizingMode = 'AUTO';
  return row;
}
function card(row, c, W, tag) {
  const k = figma.createAutoLayout('VERTICAL', { name: `${c.id} · ${c.name}`, itemSpacing: 12 }); k.fills = []; row.appendChild(k);
  k.resize(W, 100); k.primaryAxisSizingMode = 'AUTO'; k.counterAxisSizingMode = 'FIXED';
  const tr = figma.createAutoLayout('HORIZONTAL', { name: L.layer.titleRow, itemSpacing: 8 }); tr.fills = []; tr.counterAxisAlignItems = 'CENTER';
  k.appendChild(tr); tr.layoutSizingHorizontal = 'FILL';
  const tt = text(`${c.id} · ${c.name}`, B, 18, 25, NAVY); tt.name = L.layer.cardTitle; tr.appendChild(tt); tt.layoutSizingHorizontal = 'FILL'; tt.textAutoResize = 'HEIGHT';
  if (tag) {
    const tg = figma.createAutoLayout('HORIZONTAL', { name: L.layer.tag, paddingTop: 2, paddingBottom: 2, paddingLeft: 8, paddingRight: 8 });
    tg.cornerRadius = 4; tg.fills = solid(TAG_COLOR[tag].bg); tg.appendChild(text(L[tag], B, 12, 16, TAG_COLOR[tag].fg)); tr.appendChild(tg);
  }
  const d = text(c.desc, R, 14, 18, GREY); d.name = L.layer.cardDesc; k.appendChild(d);
  d.textAutoResize = 'NONE'; d.resize(W, 60); // fixed at 3 lines so the screens in a row line up at the top
  const probe = d.clone(); probe.textAutoResize = 'HEIGHT'; if (probe.height > 60.5) warnings.push(`${c.id}: the description runs past 3 lines and gets cut; shorten it`); probe.remove();
  return k;
}

const slots = {};
for (const g of BOARD.groups) {
  const W = g.viewport.width, H = g.viewport.height || 800;
  const row = group(g.title, g.desc, W, g.cards.length);
  for (const c of g.cards) {
    const k = card(row, c, W);
    const s = figma.createFrame(); s.name = L.layer.screen; s.resize(W, H); s.fills = solid('FFFFFF'); s.cornerRadius = 0; s.clipsContent = true;
    k.appendChild(s); s.placeholder = true;
    slots[c.id] = s.id;
  }
}

const nn = String(BOARD.groups.length + 1).padStart(2, '0');
const gaps = BOARD.gaps.cards;
const gapRow = group(`${nn} · ${L.gapGroup}`, gaps.length ? L.gapDesc : L.none(BOARD.gaps.checked), gapW, gaps.length);
// In spec first, then Suggested
for (const c of [...gaps.filter(c => c.tag === 'spec'), ...gaps.filter(c => c.tag === 'suggested')]) {
  const k = card(gapRow, c, gapW, c.tag);
  const wf = figma.createAutoLayout('VERTICAL', { name: L.layer.wireframe, itemSpacing: 8, paddingTop: 16, paddingBottom: 16, paddingLeft: 16, paddingRight: 16 });
  wf.fills = solid('FFFFFF'); wf.cornerRadius = 8; wf.strokes = solid(TAG_COLOR[c.tag].fg); wf.strokeWeight = 1.5; wf.dashPattern = [6, 4];
  k.appendChild(wf); wf.layoutSizingHorizontal = 'FILL'; wf.minHeight = 200;
  const add = (s, bold) => { const t = text(s, bold ? B : R, 13, 20, GREY); wf.appendChild(t); t.layoutSizingHorizontal = 'FILL'; t.textAutoResize = 'HEIGHT'; };
  add(L.must, true); (c.must || []).forEach(m => add(L.bullet + m));
  add(L.basis, true); add(c.basis);
  if (c.related) { add(L.related, true); add(c.related); }
}

section.resizeWithoutConstraints(PAD + outer.width + PAD, outer.y + outer.height + PAD);
return { sectionId: section.id, page: figma.currentPage.name, lang: LABELS[BOARD.lang] ? BOARD.lang : 'en', slots, summary: summaryText, size: [Math.round(section.width), Math.round(section.height)], fonts: { title: TITLE.family, body }, warnings };
