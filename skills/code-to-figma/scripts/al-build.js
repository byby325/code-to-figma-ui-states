// al-build.js — eval'd inside use_figma; builds the layout tree produced by al-extract.js as Figma layers:
// containers with an arrangement → auto layout frame; framework component roots and repeated same-structure siblings → component / instance (same name, different structure → variants).
// Usage: await __alBuild(data, { boardId, slotId?, compSectionId?, withRef?, libs?, replace?, force? })
// boardId is the section that holds the screens; slotId is the screen frame of a state board card (without it, screens are laid out in the section). Pass withRef: true only for each device's representative screen

// Uploaded temporary frames: ALDATA-<screen> is the data SVG, ALIMG-<screen>-<image ID> is an image. The layer name is the uploaded file name and may include the extension
function __alImageFrames(page, name) {
  const out = new Map();
  for (const n of page.children) { const m = n.name.match(/^ALIMG-(.+)-(img\d+)(?:\.\w+)?$/); if (m && m[1] === name) out.set(m[2], n); }
  return out;
}
// Memory spikes when temporary frames are imported; putting a whole batch on the canvas once crashed the file (scale-guard.md "Incident"). Only this screen's frames may be on the page
function __alStrayTemp(page, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mine = new RegExp('^AL(?:DATA-' + esc + '|IMG-' + esc + '-img\\d+)(?:\\.\\w+)?$');
  return page.children.filter(n => /^AL(?:DATA|IMG)-/.test(n.name) && !mine.test(n.name)).map(n => n.name);
}

async function __alBuild(data, opts) {
  const log = { frames: 0, texts: 0, svgs: 0, comps: 0, variants: 0, instances: 0, al: 0, noAL: 0, warn: [], drift: [], boxes: [] };
  const board = await figma.getNodeByIdAsync(opts.boardId);
  // Every use_figma call starts on the first page; the state board may be on another page
  let page = board; while (page.type !== 'PAGE') page = page.parent;
  await figma.setCurrentPageAsync(page);
  const stray = __alStrayTemp(page, data.name);
  if (stray.length) throw new Error('Temporary frames from another screen are still on the page: ' + stray.slice(0, 5).join(', ') + '. Upload data and images for one screen at a time (scale-guard.md); delete these frames and run again');
  const MAX_COMP_NODES = 300;

  // ---------- registry & components section ----------
  let section = opts.compSectionId ? await figma.getNodeByIdAsync(opts.compSectionId) : null;
  if (!section) {
    section = figma.createSection(); section.name = board.name + ' · Components';
    section.x = board.x + board.width + 400; section.y = board.y;
    page.appendChild(section); section.resizeWithoutConstraints(2600, 1200);
    // Main components have a transparent background, so white text is invisible on a light section; mid gray works for both light and dark content
    section.fills = [{ type: 'SOLID', color: { r: 0.62, g: 0.64, b: 0.67 } }];
  }
  let shelf = section.children.find(n => n.name === 'Components' && n.type === 'FRAME');
  if (!shelf) {
    shelf = figma.createAutoLayout('HORIZONTAL'); shelf.name = 'Components';
    section.appendChild(shelf); shelf.x = 80; shelf.y = 80;
    shelf.layoutWrap = 'WRAP'; shelf.itemSpacing = 64; shelf.counterAxisSpacing = 64;
    shelf.resize(2400, 100); shelf.primaryAxisSizingMode = 'FIXED'; shelf.counterAxisSizingMode = 'AUTO';
    shelf.paddingTop = shelf.paddingBottom = shelf.paddingLeft = shelf.paddingRight = 40; shelf.fills = [];
  }
  let regNode = section.children.find(n => n.type === 'TEXT' && n.name === '_registry');
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  if (!regNode) { regNode = figma.createText(); regNode.name = '_registry'; regNode.characters = '{}'; section.appendChild(regNode); regNode.visible = false; regNode.x = 0; regNode.y = 0; }
  const reg = JSON.parse(regNode.characters || '{}'); // key -> component id
  // Covers structure, text and position only. Compared before a rebuild; stop if anyone changed the screen since the last build
  const fingerprint = n => {
    let h = 0; const add = t => { for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; };
    add(Math.round(n.width) + 'x' + Math.round(n.height));
    for (const k of n.findAll(() => true)) add(k.type + k.name + Math.round(k.x) + Math.round(k.y) + Math.round(k.width) + Math.round(k.height) + (k.type === 'TEXT' ? k.characters : ''));
    return h;
  };
  const slot = opts.slotId ? await figma.getNodeByIdAsync(opts.slotId) : null;
  const prev = reg.__screens && reg.__screens[data.name], prevNode = prev ? await figma.getNodeByIdAsync(prev.rootId) : null;
  if (((slot && slot.children.length) || prevNode) && !opts.replace) throw new Error(`${data.name} already has a screen in place. Pass replace: true only after confirming the rebuild`);
  if (prevNode && fingerprint(prevNode) !== prev.fp && !opts.force) throw new Error(`${data.name} was changed after it was last built; rebuilding will overwrite it. Someone may have edited it by hand, or a screen built later updated a shared main component. Ask the user before passing force: true`);
  // This build may update shared main components, which changes other screens in the same section. Screens unchanged before the build get their fingerprint recomputed afterwards,
  // so a later rebuild doesn't wrongly flag them as "changed"; screens already changed before the build keep the old fingerprint, so the warning still appears
  // Each screen needs two full-tree scans, which can make use_figma time out when there are many screens, so above the limit nothing is recomputed. The limit is a conservative guess, not measured
  const FP_RECHECK_MAX = 40;
  const untouched = [], others = Object.entries(reg.__screens || {}).filter(([nm]) => nm !== data.name);
  if (others.length > FP_RECHECK_MAX) log.warn.push(`The section has ${others.length} screens; fingerprints of the other screens were not recomputed. If a later rebuild is blocked, confirm nobody changed the screen, then pass force`);
  else for (const [nm, s] of others) {
    const n = await figma.getNodeByIdAsync(s.rootId);
    if (n && fingerprint(n) === s.fp) untouched.push([nm, n]);
  }
  const mainCache = {};
  async function mainFor(key) {
    if (mainCache[key]) return mainCache[key];
    if (!reg[key]) return null;
    const n = await figma.getNodeByIdAsync(reg[key]);
    if (n && n.type === 'COMPONENT') { mainCache[key] = n; return n; }
    delete reg[key]; return null;
  }

  // ---------- design system ----------
  // opts.libs is stored in _registry the first time it is passed; later batches in the same section don't need to pass it again (see figma-library-binding)
  if (opts.libs || data.libs) reg.__libs = opts.libs || data.libs;
  const libs = reg.__libs || null;
  const stat = { boundColors: 0, unboundColors: {}, boundLayout: 0, libIcons: 0, dsButtons: 0, localIcons: {} };
  const binder = libs ? __alBinder(libs, reg, stat) : null;
  const compCache = {}, newMains = [];
  const importComp = async key => compCache[key] || (compCache[key] = await figma.importComponentByKeyAsync(key));
  const importSet = async key => compCache[key] || (compCache[key] = await figma.importComponentSetByKeyAsync(key));
  const hexOfArr = c => c.slice(0, 3).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  const isLibIcon = j => !!(libs && libs.icons && j.k === 'S' && libs.icons[j.lib] && (!j.flip || (j.flip[0] === -1 && j.flip[3] === -1)));
  const buttonRule = j => (libs && libs.buttons && j.tag === 'button' && j.fl && j.fl[0].t === 'S' && (j.kids || []).some(k => k.k === 'T')) ? libs.buttons.rules[hexOfArr(j.fl[0].c)] || null : null;
  const setLabel = (n, s) => { const key = Object.keys(n.componentProperties).find(k => k.startsWith('Label')); if (key) n.setProperties({ [key]: s }); };
  // Library vectors may use fills or strokes; recolor both
  async function colorIcon(n, j) {
    if (!j.col) return;
    for (const v of n.findAll(k => k.type === 'VECTOR')) {
      if (v.fills.length) v.fills = [solid(j.col)];
      if (v.strokes.length) v.strokes = [solid(j.col)];
    }
  }
  async function libIcon(j) {
    const n = (await importComp(libs.icons[j.lib])).createInstance();
    n.name = j.lib; n.resize(Math.max(j.b[2], 0.01), Math.max(j.b[3], 0.01));
    await colorIcon(n, j);
    if (j.flip) j.tf = j.flip;
    stat.libIcons++;
    return n;
  }
  async function dsButton(j, rule) {
    const set = await importSet(libs.buttons.set);
    const v = set.children.find(c => Object.entries(rule).every(([k, val]) => c.name.includes(k + '=' + val)));
    if (!v) { log.warn.push('Button variant not found ' + JSON.stringify(rule)); return null; }
    const n = v.createInstance(); n.name = j.n;
    setLabel(n, j.kids.find(k => k.k === 'T').s);
    n.resize(j.b[2], j.b[3]);
    stat.dsButtons++;
    return n;
  }
  // Text in small components becomes component properties, so it can be edited in the right panel without drilling into layers
  async function linkTextProps(owner) {
    const variants = owner.type === 'COMPONENT_SET' ? owner.children : [owner];
    for (const v of variants) {
      for (const t of v.findAll(n => n.type === 'TEXT')) {
        if (t.componentPropertyReferences && t.componentPropertyReferences.characters) continue;
        const defs = owner.componentPropertyDefinitions, name = wordOf(t.name);
        let key = Object.keys(defs).find(k => k.split('#')[0] === name && defs[k].type === 'TEXT');
        if (!key) key = owner.addComponentProperty(name, 'TEXT', t.characters);
        await figma.loadFontAsync(t.fontName);
        t.componentPropertyReferences = { characters: key };
      }
    }
  }
  const wordOf = s => { const w = s.replace(/^.*[-_]/, ''), r = (libs && libs.words && libs.words[w]) || w; return r[0].toUpperCase() + r.slice(1); };

  // ---------- fonts ----------
  const avail = await figma.listAvailableFontsAsync();
  const fam = {}; avail.forEach(f => (fam[f.fontName.family] = fam[f.fontName.family] || []).push(f.fontName.style));
  const FALLBACK = { 'PingFang TC': 'Noto Sans TC', 'PingFang SC': 'Noto Sans SC', 'Microsoft JhengHei': 'Noto Sans TC', 'Arial': 'Arimo', 'Helvetica': 'Arimo', 'Helvetica Neue': 'Arimo', 'sans-serif': 'Roboto', 'ui-sans-serif': 'Inter', 'system-ui': 'Inter', '-apple-system': 'Inter', 'BlinkMacSystemFont': 'Inter', 'BlinkMacSystemFont': 'Roboto' };
  const W2N = { thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300, regular: 400, normal: 400, book: 400, medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900 };
  const styleWeight = s => {
    const k = s.toLowerCase().replace(/italic|oblique|condensed|semicondensed|expanded|narrow|compressed|wide|display|caption|subhead|\s/g, '');
    return W2N[k] || (k === '' ? 400 : 400);
  };
  const isWidthVariant = s => /condensed|expanded|narrow|compressed|wide/i.test(s);
  const fontCache = {};
  function pickFont(f, text) {
    const [family0, , weight, italic] = f;
    const cjk = /[　-鿿＀-￯]/.test(text || '');
    // Thai and ฿ have no glyphs in fonts like Roboto, and Figma doesn't fall back to another font, so the text just disappears
    const thai = /[฀-๿]/.test(text || '') && fam['Noto Sans Thai'];
    // CSS font names are case-insensitive; a project may write arial
    const known = Object.keys(fam).find(k => k.toLowerCase() === family0.toLowerCase());
    const fallbackKey = Object.keys(FALLBACK).find(k => k.toLowerCase() === family0.toLowerCase());
    let family = thai ? 'Noto Sans Thai' : cjk ? 'Noto Sans TC' : known ? known : (fallbackKey && fam[FALLBACK[fallbackKey]] ? FALLBACK[fallbackKey] : (fam['Roboto'] ? 'Roboto' : 'Inter'));
    const key = family + '|' + weight + '|' + italic;
    if (fontCache[key]) return fontCache[key];
    const styles = fam[family] || ['Regular'];
    // Exclude width variants and optical-size variants (e.g. Noto Sans Display Black would be read as 400 and picked first)
    const normalWidth = styles.filter(s => !isWidthVariant(s) && !/display|caption|subhead/i.test(s));
    const base = normalWidth.length ? normalWidth : styles;
    const cand = base.filter(s => /italic|oblique/i.test(s) === !!italic);
    const pool = cand.length ? cand : base;
    let best = pool[0], bd = 1e9;
    pool.forEach(s => { const d = Math.abs(styleWeight(s) - weight); if (d < bd) { bd = d; best = s; } });
    return (fontCache[key] = { family, style: best });
  }
  const need = new Map();
  (function scan(j) {
    if (j.k === 'T') { const fn = pickFont(j.f, j.s); need.set(fn.family + '|' + fn.style, fn); (j.rn || []).forEach(r => { const f2 = pickFont(r[2], j.s); need.set(f2.family + '|' + f2.style, f2); }); }
    (j.kids || []).forEach(scan);
  })(data.root);
  for (const fn of need.values()) { try { await figma.loadFontAsync(fn); } catch (e) { log.warn.push('font ' + fn.family + ' ' + fn.style); } }

  // ---------- images ----------
  const hashes = {};
  const imgFrames = __alImageFrames(page, data.name);
  for (const [ref, v] of Object.entries(data.images || {})) {
    if (!v) continue;
    try {
      if (v.startsWith('upload:')) {
        const f = imgFrames.get(ref), p = f && Array.isArray(f.fills) && f.fills.find(x => x.type === 'IMAGE');
        if (p) hashes[ref] = p.imageHash; else log.warn.push('image ' + ref + ': uploaded image not found ' + v.slice(7));
      } else if (v.startsWith('svg:')) {
        const n = figma.createNodeFromSvg(v.slice(4));
        const bytes = await n.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } }); n.remove();
        hashes[ref] = figma.createImage(bytes).hash;
      } else {
        const b64 = v.slice(v.indexOf(',') + 1); const bin = atob(b64); const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        hashes[ref] = figma.createImage(u8).hash;
      }
    } catch (e) { log.warn.push('image ' + ref + ': ' + e.message); }
  }

  // ---------- paints ----------
  const rgb = c => ({ r: c[0], g: c[1], b: c[2] });
  const solid = c => ({ type: 'SOLID', color: rgb(c), opacity: c[3] });
  function grad(g, w, h) {
    const stops = g.s.map(s => ({ position: Math.min(1, Math.max(0, s[0])), color: { r: s[1], g: s[2], b: s[3], a: s[4] } }));
    if (g.t === 'L') {
      const a = g.a * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a);
      const L = Math.abs(w * dx) + Math.abs(h * dy) || 1;
      const r0 = [w * dx / L, h * dy / L, 0.5 - (w * dx + h * dy) / (2 * L)];
      const r1 = [-h * dy / L, w * dx / L, 0.5 - (-h * dy + w * dx) / (2 * L)];
      return { type: 'GRADIENT_LINEAR', gradientTransform: [r0, r1], gradientStops: stops };
    }
    // gradientTransform maps box coordinates to gradient coordinates, where the gradient center is (0.5, 0.5) and the radius is 0.5. No geo means the CSS default, farthest-corner
    const { rx, ry, cx, cy } = g.geo || { rx: 0.7071, ry: 0.7071, cx: 0.5, cy: 0.5 };
    return { type: 'GRADIENT_RADIAL', gradientTransform: [[0.5 / rx, 0, 0.5 - cx * 0.5 / rx], [0, 0.5 / ry, 0.5 - cy * 0.5 / ry]], gradientStops: stops };
  }
  function paints(fl, w, h) {
    return (fl || []).map(f => {
      if (f.t === 'S') return solid(f.c);
      if (f.t === 'I') return hashes[f.ref] ? { type: 'IMAGE', imageHash: hashes[f.ref], scaleMode: f.m || 'FILL' } : null;
      return grad(f, w, h);
    }).filter(Boolean);
  }
  function effects(ef) {
    return (ef || []).map(e => {
      if (e[0] === 'BG') return { type: 'BACKGROUND_BLUR', radius: e[1], visible: true };
      if (e[0] === 'LB') return { type: 'LAYER_BLUR', radius: e[1], visible: true };
      return { type: e[8] ? 'INNER_SHADOW' : 'DROP_SHADOW', color: { r: e[4], g: e[5], b: e[6], a: e[7] }, offset: { x: e[0], y: e[1] }, radius: e[2], spread: e[3], visible: true, blendMode: 'NORMAL' };
    });
  }
  function strokeStyle(n, j) {
    n.strokes = [solid(j.st.c)]; n.strokeAlign = 'INSIDE';
    if (Array.isArray(j.st.w)) { n.strokeTopWeight = j.st.w[0]; n.strokeRightWeight = j.st.w[1]; n.strokeBottomWeight = j.st.w[2]; n.strokeLeftWeight = j.st.w[3]; }
    else n.strokeWeight = j.st.w;
    if (j.st.d) n.dashPattern = [4, 4];
  }
  function boxStyle(n, j) {
    const [, , w, h] = j.b;
    n.fills = paints(j.fl, w, h);
    if (j.st) strokeStyle(n, j);
    if (j.r !== undefined) {
      if (Array.isArray(j.r)) { n.topLeftRadius = j.r[0]; n.topRightRadius = j.r[1]; n.bottomRightRadius = j.r[2]; n.bottomLeftRadius = j.r[3]; }
      else n.cornerRadius = Math.min(j.r, Math.min(w, h) / 2);
    }
    if (j.ef) n.effects = effects(j.ef);
    // Figma doesn't show background blur without a fill, so add a nearly transparent fill
    if (j.ef && j.ef.some(e => e[0] === 'BG') && n.fills.length === 0) n.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 0.01 }];
    if (j.op !== undefined) n.opacity = j.op;
    if (j.bm) { try { n.blendMode = j.bm.toUpperCase().replace(/-/g, '_'); } catch (e) { log.warn.push('blend mode ' + j.bm); } }
    n.clipsContent = !!j.cl;
  }

  // ---------- keys ----------
  function count(j) { return 1 + (j.kids || []).reduce((s, k) => s + count(k), 0); }
  function compKey(j) {
    if (!j.c || j.k === 'T' || !j.sig) return null;
    if (j.k === 'F' && count(j) > MAX_COMP_NODES) return null;
    const size = '@' + Math.round(j.b[2] / 2) * 2 + 'x' + Math.round(j.b[3] / 2) * 2;
    let h = 0; const s = j.sig + size; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return compName(j) + '#' + (h >>> 0).toString(36);
  }
  function compName(j) {
    if (j.k === 'S') return 'Icon/' + (j.icon || j.c.nm).replace(/^#?icon_/, '').replace(/[=,]/g, '-');
    return j.c.nm.replace(/[=,]/g, '-');
  }

  // ---------- build ----------
  async function makeText(j) {
    const t = figma.createText(); log.texts++;
    const fn = pickFont(j.f, j.s);
    t.fontName = fn; t.characters = j.s; t.fontSize = j.f[1];
    t.name = j.n || j.s.slice(0, 30);
    const [, , w, h] = j.b;
    t.fills = j.tg ? [grad(j.tg, w, h)] : [solid(j.c || [0, 0, 0, 1])];
    if (j.lh) t.lineHeight = { unit: 'PIXELS', value: j.lh };
    // Single-line text: set the line height to the height the browser measured, so a Hug parent isn't stretched by Figma's taller text box
    if (!j.ml && !j.s.includes('\n') && j.b[3] > 0 && (!j.lh || j.lh > j.b[3])) t.lineHeight = { unit: 'PIXELS', value: j.b[3] };
    if (j.ls) t.letterSpacing = { unit: 'PIXELS', value: j.ls };
    t.textAlignHorizontal = { L: 'LEFT', C: 'CENTER', R: 'RIGHT', J: 'JUSTIFIED' }[j.al || 'L'];
    if (j.u) t.textDecoration = 'UNDERLINE';
    (j.rn || []).forEach(([a, b, f, c, u]) => {
      try { t.setRangeFontName(a, b, pickFont(f, j.s)); t.setRangeFontSize(a, b, f[1]); t.setRangeFills(a, b, [solid(c)]); if (u) t.setRangeTextDecoration(a, b, 'UNDERLINE'); } catch (e) { }
    });
    if (j.ts) { t.strokes = [solid(j.ts.slice(1))]; t.strokeWeight = j.ts[0]; t.strokeAlign = 'OUTSIDE'; }
    if (j.sh) t.effects = [{ type: 'DROP_SHADOW', color: { r: j.sh[3], g: j.sh[4], b: j.sh[5], a: j.sh[6] }, offset: { x: j.sh[0], y: j.sh[1] }, radius: j.sh[2], spread: 0, visible: true, blendMode: 'NORMAL' }];
    t.textAutoResize = 'WIDTH_AND_HEIGHT';
    const natural = t.width;
    if (j.ml) {
      t.resize(Math.max(w, 1), Math.max(h, 1)); t.textAutoResize = 'HEIGHT';
      if (j.clamp) { t.textTruncation = 'ENDING'; t.maxLines = j.clamp; }
    } else if (j.fixed) {
      // If the box is as wide as the text, keep Hug so new text doesn't inherit the old width; position by the box only when it is clearly wider or taller than the text
      if (w > natural + 3 || h > (j.lh || j.f[1] * 1.6) + 1 || j.tr || j.grow) {
        // Single-line text: keep the width at least natural + 2 so it doesn't wrap when Figma renders the text slightly wider
        t.textAutoResize = 'NONE'; t.resize(Math.max(w, natural + 1, 1), Math.max(h, 1));
        t.textAlignVertical = j.va === 'C' ? 'CENTER' : 'TOP';
        if (j.tr) t.textTruncation = 'ENDING';
      }
    } else if (j.tr) { t.textAutoResize = 'NONE'; t.resize(Math.max(w, 1), Math.max(h, 1)); t.textTruncation = 'ENDING'; t.textAlignVertical = 'CENTER'; }
    return t;
  }
  function makeSvg(j) {
    let n;
    try { n = figma.createNodeFromSvg(j.svg); } catch (e) { log.warn.push('svg ' + j.n + ': ' + e.message); n = figma.createFrame(); n.fills = []; n.resize(Math.max(j.b[2], 1), Math.max(j.b[3], 1)); }
    n.name = j.icon ? j.icon.replace(/^#/, '') : (j.n || 'icon'); n.fills = n.type === 'FRAME' ? [] : n.fills; log.svgs++;
    // SVG <g> elements become Groups on import; ungroup them into vectors so no Groups remain in the screen
    for (let pass = 0; pass < 6; pass++) { const gs = n.findAll(x => x.type === 'GROUP'); if (!gs.length) break; gs.forEach(g => { try { figma.ungroup(g); } catch (e) { } }); }
    if (Math.abs(n.width - j.b[2]) > 0.5 || Math.abs(n.height - j.b[3]) > 0.5) n.resize(Math.max(j.b[2], 0.01), Math.max(j.b[3], 0.01));
    return n;
  }
  function applyLayout(f, j) {
    if (!j.L || j.noAL) { log.noAL += j.kids && j.kids.length ? 1 : 0; return; }
    log.al++;
    f.layoutMode = j.L.d === 'V' ? 'VERTICAL' : 'HORIZONTAL';
    if (j.L.w) { f.layoutWrap = 'WRAP'; f.counterAxisSpacing = j.L.cg || 0; }
    f.itemSpacing = j.L.g || 0;
    [f.paddingTop, f.paddingRight, f.paddingBottom, f.paddingLeft] = j.L.p || [0, 0, 0, 0];
    f.primaryAxisAlignItems = { MIN: 'MIN', C: 'CENTER', MAX: 'MAX', SB: 'SPACE_BETWEEN' }[j.L.pa || 'MIN'];
    f.counterAxisAlignItems = { MIN: 'MIN', C: 'CENTER', MAX: 'MAX' }[j.L.ca || 'MIN'];
    f.primaryAxisSizingMode = 'FIXED'; f.counterAxisSizingMode = 'FIXED';
    // Padding is measured from the outer edge and already includes the border; counting strokes in layout again would add 1px to every bordered frame
    f.strokesIncludedInLayout = false;
  }
  function finishSizing(f, j) {
    if (!j.L || j.noAL || !f.layoutMode || f.layoutMode === 'NONE') return;
    if (j.L.hp && !j.L.w) f.primaryAxisSizingMode = 'AUTO';
    // When a vertical stack hugs its width, STRETCH children don't count toward it, so the stack shrinks to its fixed-width children (a scrolled list is absolute, so the parent doesn't hold it open)
    const fillKid = j.L.d === 'V' && (j.kids || []).some(k => k.fillC && !k.abs && !k.fx && k.k !== 'T');
    if (j.L.hc && !fillKid) f.counterAxisSizingMode = 'AUTO';
  }
  function place(n, j, parent, pj) {
    parent.appendChild(n);
    const inAL = parent.layoutMode && parent.layoutMode !== 'NONE';
    if (inAL && (j.abs || j.fx)) n.layoutPositioning = 'ABSOLUTE';
    if (!inAL || j.abs || j.fx) { n.x = j.b[0] - pj.b[0]; n.y = j.b[1] - pj.b[1]; }
    // Absolute children that fill their container must stretch with it, so the right end of text isn't clipped when Fill changes the container's width (e.g. an input's value and placeholder)
    const hugText = n.type === 'TEXT' && n.textAutoResize === 'WIDTH_AND_HEIGHT';
    if ((!inAL || j.abs || j.fx) && !j.tf && !hugText && Math.abs(j.b[2] - pj.b[2]) <= 1) { try { n.constraints = { horizontal: 'STRETCH', vertical: n.constraints.vertical }; } catch (e) { } }
    if (j.tf) {
      // Apply axis-aligned transforms (rotations by multiples of 90°, mirroring) around the center; j.b is the untransformed box
      const [a, b, c, d] = j.tf, w = j.b[2], h = j.b[3];
      const cx = j.b[0] - pj.b[0] + w / 2, cy = j.b[1] - pj.b[1] + h / 2;
      try { n.relativeTransform = [[a, c, cx - (a * w / 2 + c * h / 2)], [b, d, cy - (b * w / 2 + d * h / 2)]]; } catch (e) { log.warn.push('transform ' + j.n + ': ' + e.message); }
    }
    if (inAL && !j.abs) {
      const crossFixed = parent.counterAxisSizingMode === 'FIXED', primFixed = parent.primaryAxisSizingMode === 'FIXED';
      // The horizontal row will hug its height later; STRETCH children don't count toward the height, so the row would be squashed
      const hugHeight = pj.L && pj.L.d === 'H' && pj.L.hc;
      if (j.fillC && crossFixed && !hugHeight && n.type !== 'TEXT') { try { n.layoutAlign = 'STRETCH'; } catch (e) { } }
      if (j.grow && primFixed) n.layoutGrow = 1;
    }
  }
  async function makeFrameNode(j, asComp) {
    const f = asComp ? figma.createComponent() : figma.createFrame(); log.frames++;
    f.name = asComp ? compName(j) : j.n;
    f.resize(Math.max(j.b[2], 0.01), Math.max(j.b[3], 0.01));
    boxStyle(f, j);
    if (j.sp !== undefined) { f.name = 'Spacer'; f.fills = []; }
    applyLayout(f, j);
    for (const k of j.kids || []) { const n = await build(k); place(n, k, f, j); }
    finishSizing(f, j);
    return f;
  }
  async function makeMain(j, key) {
    let main;
    if (j.k === 'S') { main = figma.createComponent(); main.name = compName(j); main.resize(Math.max(j.b[2], 0.01), Math.max(j.b[3], 0.01)); main.fills = []; const s = makeSvg(j); main.appendChild(s); s.x = 0; s.y = 0; }
    else main = await makeFrameNode(j, true);
    log.comps++;
    // variants: same component name already exists?
    const nm = compName(j);
    const sameName = shelf.children.find(n => (n.type === 'COMPONENT_SET' || n.type === 'COMPONENT') && n.name === nm && n !== main);
    const sibling = sameName;
    const cls = ((j.c && j.c.cls) || '').split(/\s+/).filter(Boolean);
    const baseKey = '__cls:' + nm, firstKey = '__first:' + nm;
    // Variant names must be readable: text layer names (point, value) plus state classes; use a sequence number only when there are neither
    const texts = []; (function collect(x) { (x.kids || []).forEach(k => { if (k.k === 'T') texts.push(k.n); else collect(k); }); })(j);
    const parts = texts.length && texts.length <= 3 && texts.every(s => /^[a-z]\w*[-_]\w+$/i.test(s)) ? texts.map(s => s.replace(/^.*[-_]/, '')) : [];
    const st = (j.c && j.c.st) || [];
    const clean = s => s.replace(/[=,]/g, '-');
    const typedKey = '__typed:' + nm, typed = parts.length > 0 || !!reg[typedKey];
    const stateWord = () => st.map(wordOf).join(' ') || 'Default';
    // Small components get two properties, Type and State; other components keep a single Variant
    const variantName = (n, i) => {
      const suffix = i > 1 ? ' ' + i : '';
      if (typed) return `Type=${clean(parts.map(wordOf).join('+') || 'v' + n)}${suffix}, State=${clean(stateWord())}`;
      const base = reg[baseKey] ? reg[baseKey].split(' ') : [];
      return 'Variant=' + clean([...cls.filter(c => !base.includes(c)), ...st].join(' ') || 'v' + n) + suffix;
    };
    const uniq = (set, n) => { let i = 1, v = variantName(n, i); while (set.children.some(c => c.name === v)) v = variantName(n, ++i); return v; };
    let owner = main;
    if (sibling) {
      try {
        if (sibling.type === 'COMPONENT') {
          shelf.appendChild(main);
          const firstName = reg[firstKey] || 'Variant=default';
          const set = figma.combineAsVariants([sibling, main], shelf); set.name = nm;
          sibling.name = firstName; main.name = uniq(set, 2);
          styleSet(set); fitSet(set); owner = set;
        } else {
          sibling.appendChild(main); main.name = uniq(sibling, sibling.children.length);
          fitSet(sibling); owner = sibling;
        }
        log.variants++;
      } catch (e) {
        // A component that contains the same component set (recursive or mutually referencing components) can't be combined as a variant; keep it as a separate component
        if (!/cycle/i.test(e.message)) throw e;
        shelf.appendChild(main); main.name = nm + ' (nested)';
      }
    } else {
      shelf.appendChild(main); reg[baseKey] = cls.join(' ');
      if (parts.length) reg[typedKey] = 1;
      reg[firstKey] = parts.length ? `Type=${clean(parts.map(wordOf).join('+'))}, State=${clean(stateWord())}` : 'Variant=' + clean(st.join(' ') || 'default');
    }
    if (reg[typedKey] && j.k !== 'S') { try { await linkTextProps(owner); } catch (e) { log.warn.push('text properties ' + nm + ': ' + e.message); } }
    newMains.push(main);
    reg[key] = main.id; mainCache[key] = main;
    return main;
  }
  function styleSet(set) {
    set.layoutMode = 'HORIZONTAL'; set.layoutWrap = 'WRAP'; set.itemSpacing = 24; set.counterAxisSpacing = 24;
    set.paddingTop = set.paddingBottom = set.paddingLeft = set.paddingRight = 24;
    set.primaryAxisSizingMode = 'AUTO'; set.counterAxisSizingMode = 'AUTO';
    set.strokes = [{ type: 'SOLID', color: { r: 0.59, g: 0.28, b: 1 } }]; set.dashPattern = [6, 4]; set.strokeWeight = 1; set.cornerRadius = 8;
  }
  // Variants in a single row overflow the Components section and get clipped; once the set is wider than the shelf, fix its width and wrap
  function fitSet(set) {
    // When a single variant is already wider than the shelf, the set must at least fit it; the shelf is widened to match at the end
    const max = Math.max(shelf.width - shelf.paddingLeft - shelf.paddingRight, ...set.children.map(c => c.width + set.paddingLeft + set.paddingRight));
    if (set.width <= max) return;
    set.primaryAxisSizingMode = 'FIXED'; set.resize(max, set.height); set.counterAxisSizingMode = 'AUTO';
  }
  async function instanceFor(j, key) {
    let main = await mainFor(key);
    if (!main) main = await makeMain(j, key);
    const inst = main.createInstance(); log.instances++;
    await override(inst, j);
    if ((Math.abs(inst.width - j.b[2]) > 0.5 || Math.abs(inst.height - j.b[3]) > 0.5)) { try { inst.resize(Math.max(j.b[2], 0.01), Math.max(j.b[3], 0.01)); } catch (e) { } }
    fillToParent(inst, j);
    return inst;
  }
  // Frames inside an instance can't be resized, so when one component is used at different widths (e.g. each table header column) the inner frame stays at the main component's width.
  // Setting the only child that fills the outer frame (marked fillP by al-extract) to Fill makes it follow the outer frame. The outer frame must be fixed-size first, so this runs after resize
  function fillToParent(n, j) {
    const kids = j.kids || [], nk = 'children' in n ? n.children : [];
    for (let i = 0; i < kids.length && i < nk.length; i++) {
      const kj = kids[i], kn = nk[i];
      if (kj.fillP && kn.type !== 'TEXT' && n.layoutMode && n.layoutMode !== 'NONE' && n.primaryAxisSizingMode === 'FIXED') {
        const ax = n.layoutMode === 'HORIZONTAL' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
        try { if (kn[ax] !== 'FILL') kn[ax] = 'FILL'; } catch (e) { }
      }
      fillToParent(kn, kj);
    }
  }
  const bare = ps => ps === figma.mixed ? ps : ps.map(({ boundVariables, ...p }) => p);
  const same = (a, b) => JSON.stringify(bare(a)) === JSON.stringify(bare(b));
  async function override(n, j) {
    if (!n || !j) return;
    if (isLibIcon(j) && n.type === 'INSTANCE') {
      const m = await importComp(libs.icons[j.lib]), cur = await n.getMainComponentAsync();
      if (!cur || cur.id !== m.id) n.swapComponent(m);
      await colorIcon(n, j);
      return;
    }
    const rule = buttonRule(j);
    if (rule && n.type === 'INSTANCE') {
      const set = await importSet(libs.buttons.set), v = set.children.find(c => Object.entries(rule).every(([k, val]) => c.name.includes(k + '=' + val)));
      const cur = await n.getMainComponentAsync();
      if (v && (!cur || cur.id !== v.id)) n.swapComponent(v);
      setLabel(n, j.kids.find(k => k.k === 'T').s);
      return;
    }
    if (j.k === 'T' && n.type === 'TEXT') {
      const want = j.tg ? [grad(j.tg, j.b[2], j.b[3])] : [solid(j.c || [0, 0, 0, 1])];
      const changed = n.characters !== j.s;
      if (changed) { const fn = pickFont(j.f, j.s); await figma.loadFontAsync(fn); try { n.fontName = fn; n.characters = j.s; } catch (e) { log.warn.push('text override ' + e.message); } }
      // The same component on different devices may have different font sizes and line heights; a small line-height difference accumulates line by line in multi-line text
      const wantLh = !j.ml && !j.s.includes('\n') && j.b[3] > 0 && (!j.lh || j.lh > j.b[3]) ? j.b[3] : j.lh;
      const sizeOff = n.fontSize !== figma.mixed && Math.abs(n.fontSize - j.f[1]) > 0.1;
      const lhOff = wantLh && n.lineHeight !== figma.mixed && (n.lineHeight.unit !== 'PIXELS' || Math.abs(n.lineHeight.value - wantLh) > 0.5);
      if (sizeOff || lhOff) {
        try {
          await figma.loadFontAsync(n.fontName);
          if (sizeOff) n.fontSize = j.f[1];
          if (lhOff) n.lineHeight = { unit: 'PIXELS', value: wantLh };
        } catch (e) { log.warn.push('font size override ' + e.message); }
      }
      if (!same(n.fills, want)) n.fills = want;
      // Changing the text wipes range styles (e.g. a blue price number), so reapply them
      for (const [a, b, f, c, u] of j.rn || []) { try { n.setRangeFontName(a, b, pickFont(f, j.s)); n.setRangeFontSize(a, b, f[1]); n.setRangeFills(a, b, [solid(c)]); if (u) n.setRangeTextDecoration(a, b, 'UNDERLINE'); } catch (e) { log.warn.push('text range override ' + e.message); } }
      // When an instance's text changes, its size must change too: multi-line text gets auto height, truncated text takes the browser width, other single-line text becomes Hug; otherwise it keeps the width of the main component's data and gets cut off or wraps
      // A text box taller than one line (centered by the box) can't become Hug: its height would collapse to one line and shift the whole row
      const tallBox = j.fixed && j.b[3] > (j.lh || j.f[1] * 1.6) + 1;
      try {
        // If the main component is line-clamped multi-line text and this data is a single line, truncation must be turned off before it can Hug
        if (!j.ml && !j.tr && n.textTruncation !== 'DISABLED') n.textTruncation = 'DISABLED';
        if (j.ml) {
          n.textAutoResize = 'HEIGHT'; n.resize(Math.max(j.b[2] + 1, 1), n.height);
          n.textTruncation = j.clamp ? 'ENDING' : 'DISABLED'; if (j.clamp) n.maxLines = j.clamp;
        }
        else if (j.tr) {
          n.textAutoResize = 'NONE'; n.textTruncation = 'ENDING';
          if (n.constraints.horizontal !== 'STRETCH') n.resize(Math.max(j.b[2] + 1, 1), n.height);
        }
        else if (changed && !j.grow && j.fixed && /^[CR]$/.test(j.al || '')) {
          // Centered or right-aligned text positioned by its box shifts left when Hug shrinks the box to the content; if the box is clearly wider than the text, keep this data's width
          n.textAutoResize = 'WIDTH_AND_HEIGHT';
          if (j.b[2] > n.width + 3) { n.textAutoResize = 'NONE'; n.resize(j.b[2], j.b[3]); }
        }
        // If the main component's data was multi-line (e.g. wrapped on mobile) and this one is a single line (desktop), release the fixed width even when the text is the same
        else if ((changed || n.textAutoResize === 'HEIGHT') && !tallBox && !j.grow) n.textAutoResize = 'WIDTH_AND_HEIGHT';
      } catch (e) { log.warn.push('text size override ' + e.message); }
      return;
    }
    if (j.k === 'S') return;
    if ('fills' in n && j.k === 'F') {
      const want = paints(j.fl, j.b[2], j.b[3]);
      if (!same(n.fills, want)) n.fills = want;
      // No opacity means 1: the main component may have been built from semi-transparent data (e.g. in a sidebar only the current item is opaque)
      const op = j.op !== undefined ? j.op : 1;
      if (n.opacity !== op) n.opacity = op;
      // Corner radius and clipping can also differ by state or position (e.g. rounded corners on a list's first and last rows); the main component only remembers the data it was built from
      const rad = j.r === undefined ? [0, 0, 0, 0] : Array.isArray(j.r) ? j.r : Array(4).fill(Math.min(j.r, Math.min(j.b[2], j.b[3]) / 2));
      try { if ([n.topLeftRadius, n.topRightRadius, n.bottomRightRadius, n.bottomLeftRadius].some((v, i) => Math.abs(v - rad[i]) > 0.5)) [n.topLeftRadius, n.topRightRadius, n.bottomRightRadius, n.bottomLeftRadius] = rad; } catch (e) { }
      if ('clipsContent' in n && n.clipsContent !== !!j.cl) n.clipsContent = !!j.cl;
      // Different states of one component (e.g. the underline on an active tab) may differ only in stroke or shadow
      if (j.st) strokeStyle(n, j); else if (n.strokes.length) n.strokes = [];
      if (j.ef || n.effects.length) n.effects = effects(j.ef);
      // The Plugin API can't change the width of frames inside an instance, but it can change padding and gap. Children that fill their parent, like progress bars, get their length from the parent's padding
      if (j.L && n.layoutMode && n.layoutMode !== 'NONE') {
        const [top, right, bottom, left] = j.L.p || [0, 0, 0, 0];
        for (const [f, v] of [['paddingTop', top], ['paddingRight', right], ['paddingBottom', bottom], ['paddingLeft', left], ['itemSpacing', j.L.g || 0]]) if (Math.abs(n[f] - v) > 0.5) n[f] = v;
        // The main component may have been built with different alignment (e.g. positioned by padding before, centered in this data); changing only padding pushes the content against the edge
        const pa = { MIN: 'MIN', C: 'CENTER', MAX: 'MAX', SB: 'SPACE_BETWEEN' }[j.L.pa || 'MIN'], ca = { MIN: 'MIN', C: 'CENTER', MAX: 'MAX' }[j.L.ca || 'MIN'];
        try { if (n.primaryAxisAlignItems !== pa) n.primaryAxisAlignItems = pa; if (n.counterAxisAlignItems !== ca) n.counterAxisAlignItems = ca; } catch (e) { log.warn.push('align override ' + e.message); }
      }
      // Containers without auto layout (text wrappers, etc.) take this data's size
      try {
        if (j.sp === undefined && (Math.abs(n.width - j.b[2]) > 0.5 || Math.abs(n.height - j.b[3]) > 0.5)) {
          const free = !n.layoutMode || n.layoutMode === 'NONE';
          // With Auto Layout, resize only the fixed-size axis and leave Hug and Fill to the content; that way, when the main component's data was taller, this one-line box can shrink back
          const w = free || n.layoutSizingHorizontal === 'FIXED' ? j.b[2] : n.width, h = free || n.layoutSizingVertical === 'FIXED' ? j.b[3] : n.height;
          if (w !== n.width || h !== n.height) n.resize(Math.max(w, 0.01), Math.max(h, 0.01));
        }
      } catch (e) { }
      // Frames inside an instance can't be resized and stay at the width of the main component's data. If this data hugs, let the content size it (e.g. marquee items all have different text lengths, and fixed widths would overlap)
      if (j.L && j.L.hp && n.layoutMode && n.layoutMode !== 'NONE') {
        const horiz = n.layoutMode === 'HORIZONTAL';
        if (Math.abs(horiz ? n.width - j.b[2] : n.height - j.b[3]) > 1) { try { n[horiz ? 'layoutSizingHorizontal' : 'layoutSizingVertical'] = 'HUG'; } catch (e) { } }
      }
    }
    const kids = j.kids || []; const nk = 'children' in n ? n.children : [];
    for (let i = 0; i < kids.length && i < nk.length; i++) {
      const kj = kids[i], kn = nk[i];
      const key = compKey(kj);
      if (key && kn.type === 'INSTANCE' && !isLibIcon(kj)) {
        const cur = await kn.getMainComponentAsync();
        let m = await mainFor(key); if (!m) m = await makeMain(kj, key);
        if (!cur || cur.id !== m.id) kn.swapComponent(m);
      }
      await override(kn, kj);
    }
    // When this data has less content than the main component, Hug shrinks the frame, but the browser box keeps its height (e.g. a fixed-height title bar with only one line of text)
    if (j.k === 'F' && j.sp === undefined && n.layoutMode && n.layoutMode !== 'NONE' && n.layoutSizingVertical === 'HUG' && n.height < j.b[3] - 1) {
      try { n.layoutSizingVertical = 'FIXED'; n.resize(n.width, j.b[3]); } catch (e) { log.warn.push('height override ' + e.message); }
    }
  }
  async function build(j) {
    if (isLibIcon(j)) return libIcon(j);
    if (j.k === 'S' && libs && libs.icons) { const k = j.lib || j.n; stat.localIcons[k] = (stat.localIcons[k] || 0) + 1; }
    const rule = buttonRule(j);
    if (rule) { const b = await dsButton(j, rule); if (b) return b; }
    const key = compKey(j);
    if (key) return instanceFor(j, key);
    if (j.k === 'T') return makeText(j);
    if (j.k === 'S') return makeSvg(j);
    return makeFrameNode(j, false);
  }

  // Fix the screen root frame to the viewport size: when the whole page scrolls, the tallest child (e.g. #app) carries the full scroll height and stretches a Hug root to tens of thousands of px
  function fitViewport(root, w, h) {
    if (root.layoutMode && root.layoutMode !== 'NONE') { root.primaryAxisSizingMode = 'FIXED'; root.counterAxisSizingMode = 'FIXED'; }
    root.resize(w, h); root.clipsContent = true;
    if (root.layoutMode !== 'VERTICAL') return;
    const flow = root.children.filter(c => c.layoutPositioning !== 'ABSOLUTE' && c.visible);
    const used = flow.reduce((a, c) => a + c.height, 0) + root.itemSpacing * Math.max(0, flow.length - 1) + root.paddingTop + root.paddingBottom;
    if (used <= h + 0.5) return;
    const tall = flow.reduce((a, c) => (c.height > a.height ? c : a), flow[0]);
    const nh = Math.max(1, tall.height - (used - h));
    if ('layoutSizingVertical' in tall) tall.layoutSizingVertical = 'FIXED';
    tall.resize(tall.width, nh); if ('clipsContent' in tall) tall.clipsContent = true;
  }

  // Verify text positions: compare with browser coordinates by alignment and record offsets over 2px in log.drift. Screenshot diff ratios are insensitive to such offsets; only this check catches them
  function checkDrift(n, j, rx, ry, quiet, pj) {
    if (!n || !j || !n.visible || j.tf) return;
    // For box offsets, record only the topmost one in each branch, which is the layer where the misalignment starts (log.boxes)
    if (j.k === 'F' && !j.sp && !quiet && n.absoluteBoundingBox && j.b[1] >= 0 && j.b[1] < data.h && j.b[2] >= 1) {
      const b = n.absoluteBoundingBox, dx = b.x - rx - j.b[0], dy = b.y - ry - j.b[1], dw = b.width - j.b[2];
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2 || Math.abs(dw) > 2) { log.boxes.push([j.n.slice(0, 24), Math.round(dx), Math.round(dy), Math.round(dw)]); quiet = true; }
    }
    if (j.k === 'T' && n.type === 'TEXT') {
      const b = n.absoluteBoundingBox, [jx, jy, jw, jh] = j.b;
      if (!b || jx + jw < 0 || jx > data.w || jy + jh < 0 || jy > data.h) return;
      // For end-aligned rows compare the right edge: when a substitute font makes text wider, the left edge moves anyway
      const toRight = j.al === 'R' || (pj && pj.L && pj.L.d === 'H' && pj.L.pa === 'MAX');
      const anchor = (x, w) => toRight ? x + w : j.al === 'C' ? x + w / 2 : x;
      const dx = anchor(b.x - rx, b.width) - anchor(jx, jw), dy = b.y - ry + b.height / 2 - (jy + jh / 2);
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) log.drift.push([j.s.slice(0, 16), Math.round(dx), Math.round(dy)]);
      return;
    }
    const nk = 'children' in n ? n.children : [];
    (j.kids || []).forEach((k, i) => checkDrift(nk[i], k, rx, ry, quiet, j));
  }

  // ---------- run ----------
  const root = await makeFrameNode(data.root, false);
  root.name = data.name;
  fitViewport(root, data.w, data.h);
  if (libs && libs.tokens) {
    const tok = await binder.loadTokens();
    for (const m of newMains) await binder.bindNode(m, tok, false);
    await binder.bindNode(root, tok, false);
  }
  // reference screenshot placeholder (filled later by upload_assets nodeIds); hidden layers also use memory, so only representative screens get one
  let ref = null;
  if (opts.withRef) {
    ref = figma.createRectangle(); ref.name = 'Reference screenshot (browser)'; ref.resize(data.w, data.h); ref.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
    root.appendChild(ref); if (root.layoutMode && root.layoutMode !== 'NONE') ref.layoutPositioning = 'ABSOLUTE'; ref.x = 0; ref.y = 0; ref.visible = false; ref.locked = true;
  }
  if (slot) {
    slot.children.forEach(k => k.remove());
    slot.appendChild(root); root.x = 0; root.y = 0;
    slot.placeholder = false; slot.fills = []; slot.cornerRadius = 0; slot.resize(root.width, root.height);
  } else {
    // No card slot (standalone code to figma): screens are laid out left to right in the section; a rebuilt screen keeps its position
    const others = board.children.filter(k => k !== root && (!prevNode || k !== prevNode));
    const x = prevNode ? prevNode.x : others.reduce((m, k) => Math.max(m, k.x + k.width + 80), 80), y = prevNode ? prevNode.y : 120;
    if (prevNode) prevNode.remove();
    board.appendChild(root); root.x = x; root.y = y;
    if (board.type === 'SECTION') board.resizeWithoutConstraints(Math.max(board.width, x + root.width + 80), Math.max(board.height, y + root.height + 80));
  }
  const rb = root.absoluteBoundingBox;
  checkDrift(root, data.root, rb.x, rb.y);
  if (log.drift.length) log.warn.push('text drift in ' + log.drift.length + ' places: ' + JSON.stringify(log.drift.slice(0, 5)));
  // audit-screens.js reads the comparison results from here, so drift is still caught if log.drift is overlooked during a batch
  (reg.__screens = reg.__screens || {})[data.name] = { rootId: root.id, w: data.w, h: data.h, fp: fingerprint(root), drift: log.drift.slice(0, 20), boxes: log.boxes.slice(0, 20) };
  for (const [nm, n] of untouched) if (!n.removed && reg.__screens[nm]) reg.__screens[nm].fp = fingerprint(n);
  regNode.characters = JSON.stringify(reg);
  // tidy component section to fit shelf
  // Components wider than the shelf (full-page blocks on wide screens) stick out of the section and get clipped, so widen the shelf to match
  const widest = Math.max(0, ...shelf.children.map(k => k.width)) + shelf.paddingLeft + shelf.paddingRight;
  if (widest > shelf.width) { shelf.resize(widest, shelf.height); shelf.counterAxisSizingMode = 'AUTO'; }
  section.resizeWithoutConstraints(Math.max(section.width, shelf.width + 160), Math.max(section.height, shelf.height + 160));
  // Screens and components keep enlarging the sections, so the position set for the first screen may later overlap other nodes. The Components section was created by the tool, so move it; other nodes are only reported, not moved
  const overlaps = (a, b) => { const p = a.absoluteBoundingBox, q = b.absoluteBoundingBox; return !!p && !!q && p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height; };
  const peers = page.children.filter(n => n !== section && n !== board.parent && !/^AL(?:DATA|IMG)-/.test(n.name));
  for (let i = 0; i <= peers.length; i++) {
    const hit = peers.find(n => overlaps(section, n));
    if (!hit) break;
    section.x += hit.absoluteBoundingBox.x + hit.absoluteBoundingBox.width + 400 - section.absoluteBoundingBox.x;
  }
  for (const n of peers) if (n !== board && overlaps(board, n)) log.warn.push(`section "${board.name}" overlaps "${n.name}"; move it manually`);
  // The screen now references the images, so the temporary frames can be deleted
  imgFrames.forEach(f => f.remove());
  return { rootId: root.id, refId: ref ? ref.id : null, sectionId: section.id, log, stat };
}
