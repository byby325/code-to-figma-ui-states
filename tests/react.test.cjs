// node tests/react.test.cjs
// Renders a set of components with real React (the 18 and 19 dev builds, plus the 19 production build), injects al-extract.js,
// and checks the component boundaries and names the React adapter finds. No Figma needed.
// Needs playwright, react, react-dom, react-18 and react-dom-18 from devDependencies (npm install).
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let chromium;
try { ({ chromium } = require('playwright')); require.resolve('react-dom-18/package.json'); } catch (e) {
  console.log('SKIP playwright or react not found: run npm install first'); process.exit(0);
}
const EXTRACT = path.join(__dirname, '..', 'skills', 'code-to-figma', 'scripts', 'al-extract.js');

const pkgDir = name => path.dirname(require.resolve(name + '/package.json'));
const inPkg = (name, file) => path.join(pkgDir(name), file);
const scheduler = (from, file) => require.resolve('scheduler/' + file, { paths: [pkgDir(from)] });
const BUILDS = {
  'React 19 dev': {
    env: 'development',
    rsc: true,
    files: {
      react: inPkg('react', 'cjs/react.development.js'),
      'react-dom': inPkg('react-dom', 'cjs/react-dom.development.js'),
      'react-dom/client': inPkg('react-dom', 'cjs/react-dom-client.development.js'),
      scheduler: scheduler('react-dom', 'cjs/scheduler.development.js'),
    },
  },
  'React 18 dev': {
    env: 'development',
    files: {
      react: inPkg('react-18', 'cjs/react.development.js'),
      'react-dom': inPkg('react-dom-18', 'cjs/react-dom.development.js'),
      scheduler: scheduler('react-dom-18', 'cjs/scheduler.development.js'),
    },
  },
  'React 19 production': {
    env: 'production',
    files: {
      react: inPkg('react', 'cjs/react.production.js'),
      'react-dom': inPkg('react-dom', 'cjs/react-dom.production.js'),
      'react-dom/client': inPkg('react-dom', 'cjs/react-dom-client.production.js'),
      scheduler: scheduler('react-dom', 'cjs/scheduler.production.js'),
    },
  },
};

// Wrap React's CommonJS files into a script the page can run: a minimal require
function bundle({ env, files }) {
  const defs = Object.entries(files).map(([n, p]) => `${JSON.stringify(n)}: function (module, exports, require) {\n${fs.readFileSync(p, 'utf8')}\n}`).join(',\n');
  return `(function () {
  var process = { env: { NODE_ENV: ${JSON.stringify(env)} } };
  var defs = {${defs}}, cache = {};
  function req(n) { if (cache[n]) return cache[n].exports; if (!defs[n]) throw new Error('missing module ' + n); var m = cache[n] = { exports: {} }; defs[n].call(m.exports, m, m.exports, req); return m.exports; }
  window.React = req('react');
  var dom = req('react-dom');
  if (defs['react-dom/client']) window.createRoot = req('react-dom/client').createRoot;
  else window.createRoot = function (c) { var i = dom.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED; i.usingClientEntryPoint = true; try { return dom.createRoot(c); } finally { i.usingClientEntryPoint = false; } };
})();`;
}

// Each component covers one case; data-testid becomes the node name, which makes nodes easy to find
const APP = `(() => {
  const { createElement: h, Fragment, memo, forwardRef, cloneElement, Component, useState, useEffect } = React;
  const t = id => ({ 'data-testid': id });
  function Button({ children, testid }) { return h('button', { ...t(testid), className: 'btn' }, children); }
  function SubmitButton() { return h(Button, { testid: 'submit' }, 'Save'); }
  function Card({ children }) { return h('div', { ...t('card'), className: 'card' }, h('b', null, 'Title'), children); }
  function Pair() { return h(Fragment, null, h('div', t('pair-a'), 'A'), h('div', t('pair-b'), 'B')); }
  const Badge = memo(forwardRef(function Badge(props, ref) { return h('span', { ref, ...t('badge') }, 'New'); }));
  const Chip = forwardRef((props, ref) => h('span', { ref, ...t('chip') }, 'chip')); Chip.displayName = 'Chip';
  class Panel extends Component { render() { return h('section', t('panel'), 'panel'); } }
  function Tooltip({ children }) { return cloneElement(children, { title: 'tip' }); }
  function ThemeProvider({ children }) { return children; }
  function Trigger({ children }) { return children; }
  function Action({ asChild, children }) { return asChild ? cloneElement(children, { className: 'btn' }) : h('button', { className: 'btn' }, children); }
  const StyledBox = forwardRef((p, ref) => h('div', { ref, ...p })); StyledBox.styledComponentId = 'sc-abc'; StyledBox.displayName = 'StyledBox';
  function Hero() { return h(StyledBox, t('hero'), 'hero'); }
  function Link({ children }) { return h('a', { href: '#', ...t('link') }, children); }
  function Loader() {
    const [ready, setReady] = useState(false);
    useEffect(() => { const id = setTimeout(() => setReady(true), 10); return () => clearTimeout(id); }, []);
    return ready ? h('div', { ...t('loaded'), id: 'loaded' }, 'done') : null;
  }
  function Row({ i }) { return h('li', t('row'), 'row ' + i); }
  // Simulated Server Component: React 19 dev copies the element's _debugInfo onto the fiber, which is how the Next.js App Router RSC payload carries names.
  // Elements in React 18 and production builds have no _debugInfo, so return them unchanged
  const server = (names, el) => !('_debugInfo' in el) ? el : { $$typeof: el.$$typeof, type: el.type, key: el.key, props: el.props, _owner: null, _store: { validated: 1 }, _debugInfo: names.map(name => ({ name, env: 'Server' })), _debugStack: null, _debugTask: null };
  function Toggle() { return h('button', t('rsc-client'), 'toggle'); }
  function Icon({ icon }) { return h('svg', { ...t('icon'), width: 16, height: 16, viewBox: '0 0 24 24' }, h('path', { d: 'M4 4h16v16H4z' })); }
  function App() {
    return h('main', t('app'),
      h(SubmitButton), h(Card, null, h('i', null, 'body')), h(Pair), h(Badge), h(Chip), h(Panel),
      h(Tooltip, null, h(Button, { testid: 'tipped' }, 'Hover')),
      h(Trigger, { asChild: true }, h(Button, { testid: 'trigger' }, 'Open')),
      h(Action, { asChild: true }, h('a', { href: '#', ...t('as-link') }, 'Go')),
      h(Hero), h(StyledBox, t('bare-styled'), 'styled'), h(Link, null, 'home'), h(Loader),
      h('ul', null, [1, 2, 3].map(i => h(Row, { key: i, i }))),
      h(Icon, { icon: 'mdi:home' }),
      server(['OrderCard'], h('div', t('rsc-card'), 'card')),
      server(['PaidPill', 'StatusPill'], h('span', t('rsc-nested'), 'paid')),
      server(['Pair'], h(Fragment, null, h('i', t('rsc-pair-a'), 'x'), h('i', t('rsc-pair-b'), 'y'))),
      server(['Wrapped'], h(Toggle)));
  }
  createRoot(document.getElementById('root')).render(h(ThemeProvider, null, h(App)));
})();`;

const PAGE = `<!doctype html><html><head><style>
  body { margin: 0; font: 14px/20px sans-serif; }
  main { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px; }
  main > *, li { display: block; padding: 4px; background: #eef; border-radius: 4px; }
  ul { display: flex; gap: 4px; margin: 0; padding: 4px; background: #efe; list-style: none; }
</style></head><body><div id="root"></div></body></html>`;

function walk(j, fn) { fn(j); for (const k of j.kids || []) walk(k, fn); }

async function extract(browser, build) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent(PAGE);
  await page.addScriptTag({ content: bundle(build) });
  await page.addScriptTag({ content: APP });
  await page.waitForSelector('#loaded', { timeout: 5000 });
  await page.addScriptTag({ path: EXTRACT });
  const data = await page.evaluate(() => __alExtract('R01', {}));
  await page.close();
  if (errors.length) throw new Error('Page error: ' + errors.join('; '));
  const nodes = []; walk(data.root, j => nodes.push(j));
  return { data, nodes };
}

// A text node's c is its color; component info is only on frames and SVGs
const named = j => j.k !== 'T' && j.c && j.c.nm ? j.c : null;
const comp = (nodes, n) => { const j = nodes.find(j => j.n === n && j.k !== 'T'); assert.ok(j, `node ${n} not found: ${nodes.map(j => j.n).join(', ')}`); return named(j) ? j.c.nm : null; };

const DEV_TESTS = {
  'framework is react': ({ data }) => assert.strictEqual(data.framework, 'react'),
  'component wrapping a component takes the outermost (SubmitButton → Button → <button>)': ({ nodes }) => assert.strictEqual(comp(nodes, 'submit'), 'SubmitButton'),
  'plain function component': ({ nodes }) => assert.strictEqual(comp(nodes, 'card'), 'Card'),
  'a component that returns a Fragment has no single root node and does not count as a component': ({ nodes }) => { assert.strictEqual(comp(nodes, 'pair-a'), null); assert.strictEqual(comp(nodes, 'pair-b'), null); },
  'memo(forwardRef(function Badge))': ({ nodes }) => assert.strictEqual(comp(nodes, 'badge'), 'Badge'),
  'forwardRef with displayName': ({ nodes }) => assert.strictEqual(comp(nodes, 'chip'), 'Chip'),
  'class component': ({ nodes }) => assert.strictEqual(comp(nodes, 'panel'), 'Panel'),
  'a cloneElement Tooltip does not take over the child element name': ({ nodes }) => assert.strictEqual(comp(nodes, 'tipped'), 'Button'),
  'an asChild trigger does not take over the child element name': ({ nodes }) => assert.strictEqual(comp(nodes, 'trigger'), 'Button'),
  'asChild wrapping a plain tag takes the name of the asChild component (Button asChild wrapping <a>)': ({ nodes }) => assert.strictEqual(comp(nodes, 'as-link'), 'Action'),
  'a Provider that only returns children does not take over the name': ({ nodes }) => assert.strictEqual(comp(nodes, 'app'), 'App'),
  'styled-components style components do not count; the name goes to the outer component': ({ nodes }) => { assert.strictEqual(comp(nodes, 'hero'), 'Hero'); assert.strictEqual(comp(nodes, 'bare-styled'), null); },
  'a router Link does not count as a component': ({ nodes }) => assert.strictEqual(comp(nodes, 'link'), null),
  'root node that appears only after loading (old fiber is null)': ({ nodes }) => assert.strictEqual(comp(nodes, 'loaded'), 'Loader'),
  'every list item is a Row': ({ nodes }) => {
    const rows = nodes.filter(j => j.n === 'row');
    assert.strictEqual(rows.length, 3); rows.forEach(r => assert.strictEqual(r.c && r.c.nm, 'Row'));
  },
  'Iconify icon prop becomes the icon name': ({ nodes }) => {
    const icon = nodes.find(j => j.k === 'S' && j.n === 'icon');
    assert.ok(icon, 'icon SVG node not found');
    assert.strictEqual(icon.lib, 'mdi:home'); assert.strictEqual(icon.c && icon.c.nm, 'Icon');
  },
};
const RSC_TESTS = {
  'Server Component name (_debugInfo)': ({ nodes }) => assert.strictEqual(comp(nodes, 'rsc-card'), 'OrderCard'),
  'nested Server Components take the outermost': ({ nodes }) => assert.strictEqual(comp(nodes, 'rsc-nested'), 'PaidPill'),
  'a Server Component that returns a Fragment does not count as a component': ({ nodes }) => { assert.strictEqual(comp(nodes, 'rsc-pair-a'), null); assert.strictEqual(comp(nodes, 'rsc-pair-b'), null); },
  'a Server Component that directly returns a client component takes the outer Server Component name': ({ nodes }) => assert.strictEqual(comp(nodes, 'rsc-client'), 'Wrapped'),
};
const PROD_TESTS = {
  'production build does not count as having an adapter (al-capture warns to use the dev server)': ({ data }) => assert.strictEqual(data.framework, null),
  'production build produces no component names': ({ nodes }) => { const bad = nodes.filter(j => named(j) && !j.c.rep); assert.ok(!bad.length, JSON.stringify(bad.map(j => j.c.nm))); },
};

(async () => {
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome' }); } catch (e) { browser = await chromium.launch(); }
  let failed = 0, total = 0;
  for (const [label, build] of Object.entries(BUILDS)) {
    console.log(`# ${label}`);
    let result;
    try { result = await extract(browser, build); } catch (e) { failed++; total++; console.log(`FAIL render failed\n     ${e.message}`); continue; }
    const tests = build.env === 'production' ? PROD_TESTS : { ...DEV_TESTS, ...(build.rsc ? RSC_TESTS : {}) };
    for (const [name, fn] of Object.entries(tests)) {
      total++;
      try { fn(result); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
    }
  }
  await browser.close();
  console.log(`${total - failed}/${total} passed`);
  process.exit(failed ? 1 : 0);
})();
