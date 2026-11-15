// State board audit (use_figma, read-only; measuring descriptions creates a temporary clone and removes it right away).
// Usage: replace SECTION_ID with the board section's node id (a string literal) and paste the whole script into use_figma.
// Checks the board only: groups, card IDs, descriptions, tags, coverage summary. Check the product screens inside cards with
// code-to-figma's audit-screens.js. `screens` in the result says what each Prototype card holds: rebuilt layers, a browser
// screenshot (Route C), or nothing yet (`empty` lists those card IDs).
// Accepts boards in English and Traditional Chinese (board-skeleton.js BOARD.lang).
const SECTION_ID = 'REPLACE_ME';
const GAP = 40;
const LABELS = {
  prototype: ['Prototype', '原型'],
  gaps: ['Gaps', '缺漏'],
  spec: ['In spec', '規格有寫'],
  suggested: ['Suggested', '建議補'],
  gapGroup: ['Gap check', '缺漏檢查'],
  basis: ['Basis', '依據'],
};
const section = await figma.getNodeByIdAsync(SECTION_ID);
if (!section) throw new Error('section not found: ' + SECTION_ID);
let p = section; while (p.type !== 'PAGE') p = p.parent;
await figma.setCurrentPageAsync(p);

const isGroup = n => n.type === 'FRAME' && /^\d{2} · /.test(n.name);
const groups = [];
for (const c of section.children) {
  if (isGroup(c)) groups.push(c);
  else if (c.type === 'FRAME') for (const cc of c.children) if (isGroup(cc)) groups.push(cc);
}
const textOf = n => !n ? '' : n.type === 'TEXT' ? n.characters : ('findAll' in n ? n.findAll(x => x.type === 'TEXT').map(t => t.characters).join(' ') : '');
const firstText = n => !n ? null : n.type === 'TEXT' ? n : ('findOne' in n ? n.findOne(x => x.type === 'TEXT') : null);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "NN · Gap check", optionally followed by a note in parentheses
const isGapTitle = s => new RegExp(`^\\d{2} · (?:${LABELS.gapGroup.map(esc).join('|')})\\s*(?:[（(].*[)）])?$`).test(s.trim());
// The tag is its own text in the title row, so a card named "Suggested products" is not mistaken for a Suggested card
const tagOf = (titleRow, title) => {
  const texts = titleRow && 'findAll' in titleRow ? titleRow.findAll(x => x.type === 'TEXT' && x !== title).map(t => t.characters.trim()) : [];
  return ['spec', 'suggested'].find(k => texts.some(t => LABELS[k].includes(t))) || 'prototype';
};

const issues = [], ids = new Map(), refs = [];
const count = { prototype: 0, spec: 0, suggested: 0 };
const screens = { layers: 0, screenshots: 0, empty: [] };
for (const g of groups) {
  const nn = g.name.slice(0, 2);
  const [gTitle, gDesc] = g.children;
  if (!gTitle || gTitle.type !== 'TEXT' || !gTitle.characters.startsWith(nn + ' · ')) issues.push(`${g.name}: the first child is not a group title starting with "${nn} · "`);
  if (!gDesc || gDesc.type !== 'TEXT') issues.push(`${g.name}: missing group description`);
  const isGapGroup = !!gTitle && gTitle.type === 'TEXT' && isGapTitle(gTitle.characters);
  const row = g.children.find(n => n.name === 'Scenarios');
  if (!row) { if (!isGapGroup) issues.push(`${g.name}: missing Scenarios row`); continue; }
  const cards = row.children.filter(n => n.type === 'FRAME');
  if (!cards.length) continue;
  const W = Math.round(cards[0].width);
  if (cards.some(c => Math.round(c.width) !== W)) issues.push(`${g.name}: cards in one group have different widths (make them all ${W})`);
  const need = row.layoutWrap === 'WRAP' ? W : cards.length * W + (cards.length - 1) * GAP;
  if (row.width + 1 < need) issues.push(`${g.name}: Scenarios is ${row.width} wide and can't fit ${row.layoutWrap === 'WRAP' ? 'one card' : cards.length + ' cards'} (needs ${need}); they get clipped`);
  for (const c of cards) {
    const m = c.name.match(/^([A-Z]{1,3}\d{2}) · /);
    if (!m) { issues.push(`${g.name} › ${c.name}: card name is not "<ID> · <name>"`); continue; }
    const id = m[1];
    if (ids.has(id)) issues.push(`Duplicate card ID ${id}: ${ids.get(id)} and ${g.name}`); else ids.set(id, g.name);
    const [titleRow, desc, screen] = c.children;
    const title = firstText(titleRow);
    if (!title || !title.characters.startsWith(id + ' · ')) issues.push(`${id}: card title doesn't start with the card ID`);
    const tag = tagOf(titleRow, title);
    count[tag]++;
    const isGap = tag !== 'prototype';
    if (isGapGroup && !isGap) issues.push(`${id}: in the gap check group but has no In spec or Suggested tag`);
    if (!isGapGroup && isGap) issues.push(`${id}: has the ${LABELS[tag][0]} tag but is outside the gap check group`);
    if (isGap && !id.startsWith('G')) issues.push(`${id}: gap check card IDs must start with G`);
    if (!desc || desc.type !== 'TEXT') { issues.push(`${id}: missing description`); } else {
      for (const r of desc.characters.matchAll(/\b([A-Z]{1,3}\d{2})\b/g)) refs.push([id, r[1]]);
      if (desc.textAutoResize === 'NONE') {
        for (const f of desc.getStyledTextSegments(['fontName']).map(s => s.fontName)) await figma.loadFontAsync(f);
        const probe = desc.clone(); probe.textAutoResize = 'HEIGHT';
        const h = probe.height; probe.remove();
        if (h > desc.height + 0.5) issues.push(`${id}: description needs ${Math.round(h)}px but the box is ${desc.height}px; text is cut`);
      }
    }
    if (!screen || screen.type !== 'FRAME') { issues.push(`${id}: missing screen frame`); continue; }
    if (Math.round(screen.width) !== W) issues.push(`${id}: screen is ${screen.width} wide, card is ${W}`);
    if (isGap) {
      const wf = textOf(screen);
      if (!LABELS.basis.some(l => wf.includes(l))) issues.push(`${id}: the wireframe has no Basis`);
      for (const r of wf.matchAll(/\b([A-Z]{1,3}\d{2})\b/g)) refs.push([id, r[1]]);
      const bottom = Math.max(...screen.children.map(k => k.y + k.height));
      if (bottom > screen.height - screen.paddingBottom + 0.5) issues.push(`${id}: wireframe content needs ${Math.round(bottom + screen.paddingBottom)}px but the frame is ${Math.round(screen.height)}px; text is cut (wireframe height must Hug)`);
      continue;
    }
    if (screen.cornerRadius !== 0) issues.push(`${id}: screen corner radius is ${String(screen.cornerRadius)}; product screens on the canvas need 0`);
    if (screen.children.length) screens.layers++;
    else if (Array.isArray(screen.fills) && screen.fills.some(f => f.type === 'IMAGE')) screens.screenshots++;
    else screens.empty.push(id);
  }
}
// A word shaped like a card ID is a reference only when its letters are a prefix this board uses ("ERR42" and "IE11" are not cards)
const prefixes = new Set([...ids.keys()].map(id => id.replace(/\d+$/, '')));
for (const [from, to] of refs) if (to !== from && !ids.has(to) && prefixes.has(to.replace(/\d+$/, ''))) issues.push(`${from}: refers to ${to}, which is not on the board`);
if (!groups.some(g => g.children[0] && g.children[0].type === 'TEXT' && isGapTitle(g.children[0].characters))) issues.push('No gap check group');
const num = (s, k) => { for (const l of LABELS[k]) { const m = s.match(new RegExp(esc(l) + '\\s*(\\d+)')); if (m) return +m[1]; } return null; };
const summary = section.children.find(n => n.type === 'TEXT' && num(n.characters, 'prototype') !== null && num(n.characters, 'suggested') !== null);
if (!summary) issues.push('Missing coverage summary (Prototype N · Gaps N (In spec N · Suggested N))');
else {
  const want = { ...count, gaps: count.spec + count.suggested };
  for (const k of ['prototype', 'gaps', 'spec', 'suggested']) { const got = num(summary.characters, k); if (got !== want[k]) issues.push(`Coverage summary says ${LABELS[k][0]} ${got}, the board has ${want[k]}`); }
}
return { groups: groups.length, cards: ids.size, count, screens, issues };
