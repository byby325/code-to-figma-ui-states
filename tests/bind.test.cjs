// node tests/bind.test.cjs
// Runs al-bind.js against a minimal fake of the Figma variables API: which token a value binds to, alias tokens,
// the token cache in _registry, and binding a font size on text whose font isn't loaded yet. No Figma needed.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'skills', 'figma-library-binding', 'scripts', 'al-bind.js'), 'utf8');
const rgb = (r, g, b, a = 1) => ({ r: r / 255, g: g / 255, b: b / 255, a });

// vars: { key: { name, type, value } }; a value of { alias: key } points at another variable
function makeFigma(libraries) {
  const byId = {}, loaded = new Set(), calls = { collections: 0 };
  const variable = (key, v) => byId[key] || (byId[key] = { id: key, key, name: v.name, resolvedType: v.type, valuesByMode: { m: v.value && v.value.alias ? { type: 'VARIABLE_ALIAS', id: v.value.alias } : v.value } });
  const all = Object.assign({}, ...Object.values(libraries));
  const figma = {
    mixed: Symbol('mixed'),
    teamLibrary: {
      async getAvailableLibraryVariableCollectionsAsync() { calls.collections++; return Object.keys(libraries).map(libraryName => ({ libraryName, key: libraryName })); },
      async getVariablesInLibraryCollectionAsync(key) { return Object.entries(libraries[key]).map(([k, v]) => ({ key: k, name: v.name, resolvedType: v.type })); },
    },
    variables: {
      async importVariableByKeyAsync(key) { return variable(key, all[key]); },
      async getVariableByIdAsync(id) { return all[id] ? variable(id, all[id]) : null; },
      setBoundVariableForPaint(p, field, v) { return { ...p, boundVariables: { [field]: { id: v.id } } }; },
    },
    async loadFontAsync(f) { if (f.family === 'Missing') throw new Error('font not available'); loaded.add(f.family); },
    async getNodeByIdAsync(id) { return figma.nodes[id] || null; },
    nodes: {},
  };
  return { figma, loaded, calls };
}
const run = (figma, body) => new (Object.getPrototypeOf(async function () {}).constructor)('figma', SRC + '\n' + body)(figma);
const frame = fill => ({ type: 'FRAME', fills: [{ type: 'SOLID', color: { r: fill[0] / 255, g: fill[1] / 255, b: fill[2] / 255 }, opacity: 1 }], strokes: [], children: [] });
function text(family, size) {
  const n = { type: 'TEXT', fills: [], strokes: [], fontSize: size, boundVariables: {}, getStyledTextSegments: () => [{ fontName: { family, style: 'Regular' } }] };
  n.setBoundVariable = (field, v) => { n.boundVariables[field] = { id: v.id }; };
  return n;
}
const bound = n => n.fills[0].boundVariables && n.fills[0].boundVariables.color.id;

const DS = {
  'blue-500': { name: 'color/blue-500', type: 'COLOR', value: rgb(0, 100, 255) },
  'bg-primary': { name: 'color/bg/primary', type: 'COLOR', value: { alias: 'blue-500' } },
  'text-danger': { name: 'color/text/danger', type: 'COLOR', value: { alias: 'red-hidden' } },
  'link': { name: 'color/link', type: 'COLOR', value: { alias: 'bg-primary' } },
  'font-size-14': { name: 'font-size/14', type: 'FLOAT', value: 14 },
};
// The primitive behind text-danger is not published in a token collection, so only the alias carries its value
const HIDDEN = { 'red-hidden': { name: 'red', type: 'COLOR', value: rgb(220, 0, 0) } };

const tests = {
  async 'a value with its own token binds to it, not to an alias of it'() {
    const { figma } = makeFigma({ DS, Other: HIDDEN });
    figma.nodes.a = frame([0, 100, 255]);
    await run(figma, `return __alBind(['a'], { tokens: ['DS'] });`);
    assert.strictEqual(bound(figma.nodes.a), 'blue-500');
  },
  async 'a value only an alias token has binds to the alias token'() {
    const { figma } = makeFigma({ DS, Other: HIDDEN });
    figma.nodes.a = frame([220, 0, 0]);
    const stat = await run(figma, `return __alBind(['a'], { tokens: ['DS'] });`);
    assert.strictEqual(bound(figma.nodes.a), 'text-danger');
    assert.deepStrictEqual(stat.unboundColors, {});
  },
  async 'the token cache is reused for the same libraries and rebuilt for other ones'() {
    const { figma, calls } = makeFigma({ DS, Other: HIDDEN });
    const out = await run(figma, `
      const reg = {}, stat = { boundColors: 0, unboundColors: {}, boundLayout: 0 };
      const first = await __alBinder({ tokens: ['DS'] }, reg, stat).loadTokens();
      const again = await __alBinder({ tokens: ['DS'] }, reg, stat).loadTokens();
      const wider = await __alBinder({ tokens: ['DS', 'Other'] }, reg, stat).loadTokens();
      return { same: first === again, rebuilt: wider !== first, red: wider.color['DC0000'] };`);
    assert.deepStrictEqual(out, { same: true, rebuilt: true, red: 'red-hidden' });
    assert.strictEqual(calls.collections, 2);
  },
  async 'a cache written before 0.8.1 (no source recorded) is rebuilt'() {
    const { figma } = makeFigma({ DS });
    const out = await run(figma, `
      const reg = { __tokens: { color: {}, radius: {}, stroke: {}, space: {}, font: {} } };
      const t = await __alBinder({ tokens: ['DS'] }, reg, {}).loadTokens();
      return t.color['0064FF'];`);
    assert.strictEqual(out, 'blue-500');
  },
  async '__alBind loads the font before binding a font size'() {
    const { figma, loaded } = makeFigma({ DS });
    figma.nodes.t = text('Inter', 14);
    const stat = await run(figma, `return __alBind(['t'], { tokens: ['DS'] });`);
    assert.ok(loaded.has('Inter'), 'the font was not loaded');
    assert.strictEqual(figma.nodes.t.boundVariables.fontSize.id, 'font-size-14');
    assert.strictEqual(stat.boundLayout, 1);
  },
  async 'text whose font cannot be loaded is skipped, not an error'() {
    const { figma } = makeFigma({ DS });
    figma.nodes.t = text('Missing', 14);
    const stat = await run(figma, `return __alBind(['t'], { tokens: ['DS'] });`);
    assert.strictEqual(figma.nodes.t.boundVariables.fontSize, undefined);
    assert.strictEqual(stat.skippedText, 1);
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
