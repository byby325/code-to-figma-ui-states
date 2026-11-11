// Minimal Figma Plugin API mock: implements only the parts board-skeleton.js and audit.js use,
// to catch runtime errors and board structure problems without Figma. Layout is only a rough estimate (Auto Layout sums its children) and is not guaranteed to match Figma.
let seq = 1;
const CHAR_W = 0.62; // Average character width ≈ font size × 0.62 (CJK about 1.0, Latin letters and digits about 0.55; a conservative value)

function measure(t) {
  const lh = t.lineHeight && t.lineHeight.value || t.fontSize * 1.4;
  const units = [...t.characters].reduce((s, ch) => s + (/[　-鿿＀-￯]/.test(ch) ? 1 : CHAR_W), 0) * t.fontSize;
  if (t.textAutoResize === 'WIDTH_AND_HEIGHT') { t._w = units; t._h = lh; }
  else if (t.textAutoResize === 'HEIGHT') { t._h = Math.max(1, Math.ceil(units / Math.max(1, t._w))) * lh; }
}

class Node {
  constructor(type) { this.id = `1:${seq++}`; this.type = type; this.name = type; this.children = []; this.parent = null; this.x = 0; this.y = 0; this._w = 100; this._h = 100; this.fills = []; this.strokes = []; this.removed = false; }
  get width() { return this._w; } get height() { return this._h; }
  appendChild(n) { if (n.parent) n.parent.children = n.parent.children.filter(k => k !== n); n.parent = this; this.children.push(n); relayoutUp(this); }
  resize(w, h) { this._w = w; this._h = h; if (this.type === 'FRAME') { this.primaryAxisSizingMode = 'FIXED'; this.counterAxisSizingMode = 'FIXED'; } relayoutUp(this.parent); }
  resizeWithoutConstraints(w, h) { this._w = w; this._h = h; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(k => k !== this); this.removed = true; relayoutUp(this.parent); }
  findAll(fn) { const out = []; const walk = n => { for (const k of n.children) { if (!fn || fn(k)) out.push(k); walk(k); } }; walk(this); return out; }
  findOne(fn) { return this.findAll(fn)[0] || null; }
  findChild(fn) { return this.children.find(fn) || null; }
  clone() { const c = Object.assign(Object.create(Object.getPrototypeOf(this)), this, { id: `1:${seq++}`, children: [], parent: null }); this.parent && this.parent.appendChild(c); return c; }
  set layoutSizingHorizontal(v) {
    this._lsh = v;
    if (v === 'FILL' && this.parent) {
      // Figma fixes the size in the Fill direction: a vertical frame's width is its counter axis, a horizontal frame's width is its primary axis
      if (this.layoutMode === 'VERTICAL') this.counterAxisSizingMode = 'FIXED';
      if (this.layoutMode === 'HORIZONTAL') this.primaryAxisSizingMode = 'FIXED';
      this._w = innerW(this.parent); if (this.type === 'TEXT') measure(this); relayoutUp(this.parent);
    }
  }
  get layoutSizingHorizontal() { return this._lsh; }
}
class Text extends Node {
  constructor() { super('TEXT'); this._chars = ''; this.fontSize = 12; this.textAutoResize = 'WIDTH_AND_HEIGHT'; this.fontName = { family: 'Inter', style: 'Regular' }; }
  set characters(v) { if (!loaded.has(key(this.fontName))) throw new Error(`Cannot write to node with unloaded font "${this.fontName.family} ${this.fontName.style}"`); this._chars = v; measure(this); relayoutUp(this.parent); }
  get characters() { return this._chars; }
  set textAutoResize(v) { this._tar = v; measure(this); relayoutUp(this.parent); }
  get textAutoResize() { return this._tar; }
  resize(w, h) { this._w = w; this._h = h; measure(this); relayoutUp(this.parent); }
  getStyledTextSegments() { return [{ fontName: this.fontName }]; }
}
const innerW = f => f._w - (f.paddingLeft || 0) - (f.paddingRight || 0);
function relayoutUp(n) {
  while (n && n.type !== 'PAGE') {
    if (n.layoutMode && n.layoutMode !== 'NONE') {
      const kids = n.children, pt = n.paddingTop || 0, pb = n.paddingBottom || 0, pl = n.paddingLeft || 0, pr = n.paddingRight || 0;
      if (n.layoutMode === 'VERTICAL') {
        let y = pt; for (const k of kids) { k.x = pl; k.y = y; y += k._h + (n.itemSpacing || 0); }
        const h = (kids.length ? y - (n.itemSpacing || 0) : pt) + pb;
        if (n.primaryAxisSizingMode !== 'FIXED') n._h = Math.max(h, n.minHeight || 0);
        if (n.counterAxisSizingMode !== 'FIXED') n._w = Math.max(0, ...kids.map(k => k._w)) + pl + pr;
      } else {
        const wrap = n.layoutWrap === 'WRAP';
        let x = pl, y = pt, rowH = 0, maxX = 0;
        for (const k of kids) {
          if (wrap && x > pl && x + k._w > n._w - pr + 0.5) { x = pl; y += rowH + (n.counterAxisSpacing || 0); rowH = 0; }
          k.x = x; k.y = y; x += k._w + (n.itemSpacing || 0); rowH = Math.max(rowH, k._h); maxX = Math.max(maxX, x - (n.itemSpacing || 0));
        }
        if (n.primaryAxisSizingMode !== 'FIXED') n._w = maxX + pr;
        if (n.counterAxisSizingMode !== 'FIXED') n._h = y + rowH + pb;
      }
    }
    n = n.parent;
  }
}
const loaded = new Set();
const key = f => `${f.family}/${f.style}`;

function makeFigma({ fonts }) {
  const page = new Node('PAGE'); page.name = 'Page 1';
  page.appendChild = function (n) { Node.prototype.appendChild.call(this, n); };
  const root = { children: [page] };
  const all = () => [page, ...page.findAll()];
  const create = type => { const n = type === 'TEXT' ? new Text() : new Node(type); page.appendChild(n); return n; };
  return {
    root, page,
    get currentPage() { return page; },
    async setCurrentPageAsync() {},
    createPage() { throw new Error('createPage not supported in fake'); },
    async listAvailableFontsAsync() { return fonts.map(([family, style]) => ({ fontName: { family, style } })); },
    async loadFontAsync(f) { if (!fonts.some(([a, b]) => a === f.family && b === f.style)) throw new Error(`font ${key(f)} not available`); loaded.add(key(f)); },
    async getNodeByIdAsync(id) { return all().find(n => n.id === id) || null; },
    createText: () => create('TEXT'),
    createSection: () => create('SECTION'),
    createFrame: () => create('FRAME'),
    createAutoLayout(dir, props) {
      if (typeof dir === 'object') { props = dir; dir = 'HORIZONTAL'; }
      const f = create('FRAME'); f.layoutMode = dir || 'HORIZONTAL'; f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO'; f.itemSpacing = 0;
      Object.assign(f, props || {}); relayoutUp(f); return f;
    },
  };
}

// Run a use_figma script as an async function (the scripts use top-level await and return)
async function runScript(src, figma) {
  const fn = new Function('figma', `return (async () => {\n${src}\n})();`);
  return fn(figma);
}

module.exports = { makeFigma, runScript };
