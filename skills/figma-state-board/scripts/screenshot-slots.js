// Screenshot slots (use_figma, writes): finishes a board whose Prototype cards show browser screenshots instead of rebuilt layers (SKILL.md Route C).
// Run it after the screenshots are uploaded. For every Prototype card it makes the screenshot the slot's only fill, sizes the slot to the
// image's proportions at the card width, clears the placeholder flag and renames the layer.
// Usage: replace SECTION_ID with the board section's node id and paste the whole script into use_figma. To save a call, paste audit.js
// after it in the same use_figma (wrap each in an async function and return both results).
// Where it looks for each card's screenshot, in order:
//   1. an image fill on the slot (upload_assets called with the slot ids as nodeIds)
//   2. a layer with an image fill inside the slot
//   3. a layer on the page named "<card ID>.jpg" or "<card ID>.png" (upload_assets called without nodeIds; the file name becomes the layer name)
// Layers found by 2 and 3 are removed once their image is in the slot. Cards that already hold rebuilt layers are left alone.
const SECTION_ID = 'REPLACE_ME';
const NAME = { en: 'Screen (browser screenshot)', 'zh-TW': '畫面（瀏覽器截圖）' };
const section = await figma.getNodeByIdAsync(SECTION_ID);
if (!section) throw new Error('section not found: ' + SECTION_ID);
let p = section; while (p.type !== 'PAGE') p = p.parent;
await figma.setCurrentPageAsync(p);

const imageOf = n => ('fills' in n && Array.isArray(n.fills) ? n.fills.find(f => f.type === 'IMAGE' && f.imageHash) : null);
const loose = {};
for (const n of p.children) {
  const m = n.name.match(/^([A-Z]{1,3}\d{2})\.(?:jpe?g|png)$/i);
  if (m && imageOf(n)) loose[m[1]] = n;
}

const placed = [], missing = [], skipped = [], warnings = [];
const cards = section.findAll(n => n.type === 'FRAME' && /^[A-Z]{1,3}\d{2} · /.test(n.name) && n.parent && n.parent.name === 'Scenarios');
for (const card of cards) {
  const id = card.name.split(' · ')[0];
  const slot = card.children[2];
  // Gap check cards hold wireframes (Auto Layout); their IDs start with G
  if (id.startsWith('G') || !slot || slot.type !== 'FRAME' || slot.layoutMode === 'HORIZONTAL' || slot.layoutMode === 'VERTICAL') continue;
  let paint = imageOf(slot), source = null;
  if (!paint) {
    source = slot.children.length === 1 && imageOf(slot.children[0]) ? slot.children[0] : null;
    if (!source && slot.children.length) { skipped.push(id); continue; }
    if (!source) source = loose[id] || null;
    if (source) paint = imageOf(source);
  }
  if (!paint) { missing.push(id); continue; }
  const image = figma.getImageByHash(paint.imageHash);
  const size = image ? await image.getSizeAsync() : null;
  if (!size || !size.width) { missing.push(id); warnings.push(`${id}: the image could not be read; upload it again`); continue; }
  const W = Math.round(card.width), H = Math.round(W * size.height / size.width);
  if (size.width < W) warnings.push(`${id}: the screenshot is ${size.width}px wide, narrower than the ${W}px card; it will look blurry`);
  slot.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: paint.imageHash }];
  slot.resize(W, H);
  slot.cornerRadius = 0; slot.clipsContent = true; slot.placeholder = false;
  slot.name = NAME[/[\u4e00-\u9fff]/.test(slot.name) ? 'zh-TW' : 'en'];
  if (source) source.remove();
  placed.push({ id, slotId: slot.id, size: [W, H], image: [size.width, size.height] });
}
for (const [id, n] of Object.entries(loose)) if (!n.removed) warnings.push(`${n.name} (${n.id}) is on the page but matches no empty card; delete it or check the card ID`);

// The section must grow with the screens, or the last group is cut off
const outer = section.children.find(n => n.type === 'FRAME' && n.name === 'Groups');
if (outer) section.resizeWithoutConstraints(Math.max(section.width, outer.x * 2 + outer.width), Math.max(...section.children.map(n => n.y + n.height)) + outer.x);
return { placed, missing, skipped, size: [Math.round(section.width), Math.round(section.height)], warnings };
