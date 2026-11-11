// Product screen audit (use_figma, read-only). The rules are in references/screen-structure.md
// Usage: replace SECTION_ID with the section that holds the screens and paste the whole script into use_figma. The Components section is found automatically.
// Where the screen list comes from, in order: SCREEN_IDS, the screens al-build.js wrote to _registry, the screens inside the state board cards.
const SECTION_ID = 'REPLACE_ME';
const SCREEN_IDS = []; // Fill in root frame ids to check only some screens
const MAX_SCREENS = 150; // Keep in sync with scale-guard.md
const MIN_BIND_RATIO = null; // null: use 0.4 when a library is bound, to catch a forgotten preset; no check without a library
const section = await figma.getNodeByIdAsync(SECTION_ID);
if (!section) throw new Error('section not found: ' + SECTION_ID);
let p = section; while (p.type !== 'PAGE') p = p.parent;
await figma.setCurrentPageAsync(p);

const compSection = p.children.find(n => n.type === 'SECTION' && n.name === section.name + ' · Components');
const regNode = compSection && compSection.children.find(n => n.type === 'TEXT' && n.name === '_registry');
const reg = regNode ? JSON.parse(regNode.characters || '{}') : {};
const registered = reg.__screens || {};

async function collectScreens() {
  if (SCREEN_IDS.length) return Promise.all(SCREEN_IDS.map(async id => ({ id, root: await figma.getNodeByIdAsync(id) })));
  const fromReg = await Promise.all(Object.entries(registered).map(async ([id, v]) => ({ id, root: await figma.getNodeByIdAsync(v.rootId), w: v.w })));
  if (fromReg.length) return fromReg;
  // Route A state boards have no registry: the card's third child is the screen; wireframe cards have no root frame and are skipped
  const cards = section.findAll(n => n.type === 'FRAME' && /^[A-Z]{1,3}\d{2} · /.test(n.name) && !n.name.startsWith('G'));
  return cards.map(c => ({ id: c.name.split(' · ')[0], root: c.children[2] && c.children[2].children.find(k => k.visible && ['FRAME', 'INSTANCE', 'COMPONENT', 'GROUP'].includes(k.type)), w: Math.round(c.width) }));
}

const screens = await collectScreens();
const issues = [], unboundColors = {};
let unbound = 0, bound = 0, unboundVectors = 0, libraryInstances = 0, containers = 0, autoLayout = 0, maxH = 0;
const refCards = [], widths = new Set(), refWidths = new Set();

for (const { id, root, w } of screens) {
  if (!root) { issues.push(`${id}: screen root frame not found`); continue; }
  if (root.type === 'GROUP') { issues.push(`${id}: screen root is a Group "${root.name}"; change it to a frame`); continue; }
  const W = w || Math.round(root.width);
  maxH = Math.max(maxH, root.height);
  if (Math.round(root.width) !== W) issues.push(`${id}: screen root frame is ${Math.round(root.width)} wide, should be ${W} (it will be clipped or shifted)`);
  if (root.type === 'FRAME' && root.layoutMode !== 'NONE' && root.layoutSizingHorizontal === 'HUG') issues.push(`${id}: screen root frame width is Hug; change it to Fixed ${W}`);
  // Don't count Groups inside libraries/components (they can't be changed) or masks (a Mask group is a Group by design)
  const inInstance = n => { for (let q = n.parent; q && q !== root; q = q.parent) if (q.type === 'INSTANCE') return true; return false; };
  const groupsIn = root.findAllWithCriteria({ types: ['GROUP'] }).filter(g => !inInstance(g) && !g.children.some(k => k.isMask)).length;
  if (groupsIn) issues.push(`${id}: the screen has ${groupsIn} Groups; change them to frames/Auto Layout`);
  if (root.type !== 'INSTANCE' && !root.findAllWithCriteria({ types: ['INSTANCE'] }).length) issues.push(`${id}: the screen uses no component instances`);
  const frames = root.findAllWithCriteria({ types: ['FRAME', 'COMPONENT'] }).filter(f => f.children.filter(c => c.visible).length >= 2);
  const al = frames.filter(f => f.layoutMode !== 'NONE').length;
  containers += frames.length; autoLayout += al;
  if (frames.length >= 5 && al / frames.length < 0.6) issues.push(`${id}: only ${al}/${frames.length} containers use Auto Layout`);
  const sb = root.absoluteBoundingBox;
  for (const t of root.findAllWithCriteria({ types: ['TEXT'] })) {
    if (!t.visible) continue; const b = t.absoluteBoundingBox; if (!b) continue;
    if (b.x < sb.x - 1 || b.x + b.width > sb.x + sb.width + 1) {
      let clipped = false; for (let q = t.parent; q && q !== root; q = q.parent) { const pb = q.absoluteBoundingBox; if (q.clipsContent && pb && pb.x >= sb.x - 1 && pb.x + pb.width <= sb.x + sb.width + 1) { clipped = true; break; } }
      if (!clipped) issues.push(`${id}: text "${t.characters.slice(0, 20)}" extends past the screen width (long text needs Fill + auto height)`);
    }
    const pb = t.parent.clipsContent && t.parent.absoluteBoundingBox;
    if (pb && (b.x < pb.x - 1 || b.x + b.width > pb.x + pb.width + 1)) issues.push(`${id}: text "${t.characters.slice(0, 20)}" is wider than its clipping container "${t.parent.name}"; the text will be cut off`);
  }
  // A vertical Hug-width frame whose children are all Fill and that is much narrower than its parent: nothing holds it open, so the whole column is squashed
  const flowKids = f => f.children.filter(c => c.visible && c.layoutPositioning !== 'ABSOLUTE');
  for (const f of root.findAll(n => n.layoutMode === 'VERTICAL' && n.layoutSizingHorizontal === 'HUG')) {
    const kids = flowKids(f);
    if (kids.length && kids.every(c => c.layoutSizingHorizontal === 'FILL') && f.width < f.parent.width * 0.6) issues.push(`${id}: container "${f.name}" is ${Math.round(f.width)} wide, much narrower than its parent, and all its children are Fill; it is squashed`);
  }
  widths.add(W);
  // Boards built by older versions name the reference layer 參考截圖, so accept both prefixes
  if (root.findOne(n => n.name.startsWith('Reference screenshot') || n.name.startsWith('參考截圖'))) { refCards.push(id); refWidths.add(W); }
  for (const n of root.findAll(k => 'fills' in k && k.fills !== figma.mixed && k.fills.length && k.fills[0].type === 'SOLID' && k.visible)) {
    if (n.fills[0].boundVariables && n.fills[0].boundVariables.color) { bound++; continue; }
    // Vector colors in icons and illustrations are often not in the design system. Count them separately so that when the ratio drops you can tell whether icons increased or binding broke
    if (n.type === 'VECTOR' || n.type === 'BOOLEAN_OPERATION' || n.type === 'STAR' || n.type === 'POLYGON') { unboundVectors++; continue; }
    unbound++;
    const { r, g, b } = n.fills[0].color, hex = [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
    unboundColors[hex] = (unboundColors[hex] || 0) + 1;
  }
  for (const i of root.findAllWithCriteria({ types: ['INSTANCE'] })) if (i.mainComponent && i.mainComponent.remote) libraryInstances++;
  const r = registered[id];
  if (r && r.drift.length) issues.push(`${id}: text drift in ${r.drift.length} places ${JSON.stringify(r.drift.slice(0, 3))}; investigate or report the cause`);
  if (r && r.boxes.length) issues.push(`${id}: box drift in ${r.boxes.length} places ${JSON.stringify(r.boxes.slice(0, 3))}; investigate or report the cause`);
}

const minRatio = MIN_BIND_RATIO !== null ? MIN_BIND_RATIO : (reg.__libs ? 0.4 : 0);
if (minRatio && bound / Math.max(bound + unbound, 1) < minRatio) issues.push(`Only ${bound}/${bound + unbound} non-icon colors are bound, below ${minRatio}: check that a preset was passed; see figma-library-binding`);
if (screens.length > MAX_SCREENS) issues.push(`${screens.length} screens, over ${MAX_SCREENS}; report that the user agreed to this, or split into pages or files`);
for (const n of p.children) if (/^AL(?:DATA|IMG)-/.test(n.name)) issues.push(`Temporary frame ${n.name} (${n.id}) is still on the page; delete it`);
// A section enlarged by screens and components may cover its neighbors; looking only at Components or at single screens won't show it
const overlaps = (a, b) => { const q = a.absoluteBoundingBox, r = b.absoluteBoundingBox; return !!q && !!r && q.x < r.x + r.width && r.x < q.x + q.width && q.y < r.y + r.height && r.y < q.y + q.height; };
const peers = p.children.filter(n => n !== section && n !== section.parent && !/^AL(?:DATA|IMG)-/.test(n.name));
for (const n of peers) if (overlaps(section, n)) issues.push(`section "${section.name}" overlaps "${n.name}"; move it away`);
if (compSection) for (const n of peers) if (n !== compSection && overlaps(compSection, n)) issues.push(`section "${compSection.name}" overlaps "${n.name}"; move it away`);

const unusedComponents = [];
if (compSection) {
  // A component taller than the screens is usually a whole page or a cut-off section made into a component, and it is empty outside the screen area
  for (const c of compSection.findAllWithCriteria({ types: ['COMPONENT'] })) {
    const owner = c.parent.type === 'COMPONENT_SET' ? c.parent : c;
    if (maxH && c.height > maxH + 1) issues.push(`Components: "${owner.name}" is ${Math.round(c.height)} tall, taller than the screens; a whole page should not be a component`);
    // Main components left over after replacing or rebuilding screens are not errors; report them and let people decide whether to delete them
    if (!(await c.getInstancesAsync()).length) unusedComponents.push(owner === c ? c.name : `${owner.name} / ${c.name}`);
  }
  const cb = compSection.absoluteBoundingBox;
  for (const k of compSection.findAllWithCriteria({ types: ['COMPONENT_SET'] })) { const b = k.absoluteBoundingBox; if (b.x + b.width > cb.x + cb.width) issues.push(`Components: "${k.name}" extends past the right edge of the section and will be cut off`); }
}

const scale = { nodes: 0, hiddenNodes: 0, imageFills: 0, uniqueImages: new Set() };
for (const base of [section, compSection].filter(Boolean)) {
  for (const n of base.findAll(() => true)) {
    scale.nodes++;
    if (!n.visible) scale.hiddenNodes++;
    if ('fills' in n && Array.isArray(n.fills)) for (const f of n.fills) if (f.type === 'IMAGE') { scale.imageFills++; scale.uniqueImages.add(f.imageHash); }
  }
}
return {
  screens: screens.length,
  colorBinding: { bound, unbound, unboundVectors, top: Object.entries(unboundColors).sort((a, b) => b[1] - a[1]).slice(0, 8) },
  libraryInstances,
  structure: { autoLayout: `${autoLayout}/${containers}`, referenceScreenshots: refCards, widthsWithoutReference: [...widths].filter(w => !refWidths.has(w)) },
  unusedComponents,
  scale: { ...scale, uniqueImages: scale.uniqueImages.size },
  issues,
};
