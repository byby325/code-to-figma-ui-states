// al-bind.js — eval'd inside use_figma; binds screens to design system variables.
// For new screens, al-pack.py packs it together with al-build.js; to bind existing screens afterwards use __alBind, see the figma-library-binding SKILL.md
function __alBinder(libs, reg, stat) {
  const varCache = {};
  const importVar = async key => varCache[key] || (varCache[key] = await figma.variables.importVariableByKeyAsync(key));
  const hexOf = c => ['r', 'g', 'b'].map(k => Math.round(c[k] * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  // Only exact matches, never the nearest value: for tokens with a hex in the name, read the name; import the rest and read their values
  async function loadTokens() {
    if (reg.__tokens) return reg.__tokens;
    const t = { color: {}, radius: {}, stroke: {}, space: {}, font: {} };
    for (const c of await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync()) {
      if (!libs.tokens.includes(c.libraryName)) continue;
      for (const v of await figma.teamLibrary.getVariablesInLibraryCollectionAsync(c.key)) {
        const inName = v.resolvedType === 'COLOR' && v.name.match(/-([0-9A-Fa-f]{6})$/);
        if (inName) { t.color[inName[1].toUpperCase()] = v.key; continue; }
        const group = v.resolvedType === 'COLOR' ? 'color' : v.name.startsWith('borderRadius') ? 'radius' : v.name.startsWith('border') ? 'stroke' : v.name.startsWith('spacing') ? 'space' : v.name.startsWith('font-size') ? 'font' : null;
        if (!group) continue;
        const iv = await importVar(v.key), val = iv.valuesByMode[Object.keys(iv.valuesByMode)[0]];
        if (group !== 'color') { if (typeof val === 'number') t[group][val] = v.key; }
        else if (val && val.r !== undefined) t.color[hexOf(val) + (val.a < 1 ? '@' + val.a.toFixed(2) : '')] = v.key;
      }
    }
    reg.__tokens = t;
    return t;
  }
  async function bindPaints(list, tok) {
    let changed = false; const out = [];
    for (const p of list) {
      if (p.type !== 'SOLID' || (p.boundVariables && p.boundVariables.color)) { out.push(p); continue; }
      const hex = hexOf(p.color), alpha = p.opacity < 0.995 ? hex + '@' + p.opacity.toFixed(2) : null;
      // Binding overwrites the paint's opacity with 1, so a semi-transparent color can only bind to a token with alpha; without one, keep the raw value
      const key = tok.color[alpha || hex];
      if (!key) { const k = alpha || hex; stat.unboundColors[k] = (stat.unboundColors[k] || 0) + 1; out.push(p); continue; }
      out.push(figma.variables.setBoundVariableForPaint(alpha ? { ...p, opacity: 1 } : p, 'color', await importVar(key)));
      changed = true; stat.boundColors++;
    }
    return changed ? out : null;
  }
  async function bindField(n, field, map) {
    const v = n[field];
    if (typeof v !== 'number' || v <= 0 || !map[v] || (n.boundVariables && n.boundVariables[field])) return;
    n.setBoundVariable(field, await importVar(map[v])); stat.boundLayout++;
  }
  // Bind after building: inside instances bind only colors, since layout values follow the main component; in library instances bind only the changed vector colors
  async function bindNode(n, tok, inInstance) {
    if (n.type === 'INSTANCE' && n.mainComponent && n.mainComponent.remote) {
      for (const v of n.findAll(k => k.type === 'VECTOR')) { const f = await bindPaints(v.fills, tok); if (f) v.fills = f; }
      return;
    }
    if ('fills' in n) {
      if (n.fills === figma.mixed) {
        for (const s of n.getStyledTextSegments(['fills'])) { const f = await bindPaints(s.fills, tok); if (f) n.setRangeFills(s.start, s.end, f); }
      } else if (n.fills.length) { const f = await bindPaints(n.fills, tok); if (f) n.fills = f; }
    }
    if ('strokes' in n && n.strokes.length) { const s = await bindPaints(n.strokes, tok); if (s) n.strokes = s; }
    if (!inInstance) {
      if (n.type === 'TEXT') await bindField(n, 'fontSize', tok.font);
      if ('layoutMode' in n && n.layoutMode !== 'NONE') for (const f of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing']) await bindField(n, f, tok.space);
      if ('topLeftRadius' in n) for (const f of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) await bindField(n, f, tok.radius);
      if (n.strokes && n.strokes.length && 'strokeTopWeight' in n) for (const f of ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight']) await bindField(n, f, tok.stroke);
    }
    if ('children' in n) for (const k of n.children) await bindNode(k, tok, inInstance || n.type === 'INSTANCE');
  }
  return { loadTokens, bindNode };
}

// Binds tokens only (color, radius, border, spacing, font size); does not swap icons or components. rootIds are the frames to process
async function __alBind(rootIds, libs) {
  const stat = { boundColors: 0, unboundColors: {}, boundLayout: 0 };
  const binder = __alBinder(libs, {}, stat), tok = await binder.loadTokens();
  for (const id of rootIds) {
    const n = await figma.getNodeByIdAsync(id);
    if (n) await binder.bindNode(n, tok, false);
  }
  return stat;
}
