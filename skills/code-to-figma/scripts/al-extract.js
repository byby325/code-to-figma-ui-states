// al-extract.js — converts the current screen's DOM into a "layout tree" that al-build.js rebuilds in Figma with auto layout + components.
// Usage (in the page): paste the whole file into the page and run it once, or load it from the sink: eval(await (await fetch('http://127.0.0.1:4319/al-extract.js')).text());
//   const data = await __alExtract('B04');  // capture the whole viewport
//   await __alSave(data);                    // POST to the local sink → <output folder>/B04.json (set the sink address with window.__alSink)
(() => {
  const R1 = v => Math.round(v * 10) / 10;
  const R3 = v => Math.round(v * 1000) / 1000;
  const px = v => parseFloat(v) || 0;
  const BUILTIN = new Set(['Transition', 'TransitionGroup', 'KeepAlive', 'Teleport', 'Suspense', 'BaseTransition', 'RouterView', 'RouterLink', 'AsyncComponentWrapper', 'NuxtLink', 'NuxtPage', 'NuxtLayout', 'ClientOnly', 'Swiper', 'SwiperSlide']);
  const NS = 'http://www.w3.org/2000/svg';
  const BORDER_SIDES = ['Top', 'Right', 'Bottom', 'Left'];

  // Modern color syntax (oklch, color(srgb …), lab…) is converted to sRGB via a canvas; Tailwind 4, frappe-ui and others define palettes in oklch,
  // and Chrome's getComputedStyle returns these formats, so accepting only rgb() would leave the whole screen without color
  let probe = null;
  function toRGBA(fn) {
    if (!probe) { const cv = document.createElement('canvas'); cv.width = cv.height = 1; probe = cv.getContext('2d', { willReadFrequently: true }); }
    probe.clearRect(0, 0, 1, 1); probe.fillStyle = '#000'; probe.fillStyle = fn; probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  }
  function color(s, keepClear) {
    if (!s) return null;
    const m = s.match(/rgba?\(([^)]+)\)/);
    let p;
    if (m) {
      p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
      if (p.length < 4) p[3] = 1;
    } else {
      const f = s.match(/\b(?:color|oklch|oklab|lch|lab|hsla?|hwb)\((?:[^()]|\([^()]*\))*\)/);
      if (!f) return null;
      p = toRGBA(f[0]);
    }
    const a = p[3];
    if (a === 0 && !keepClear) return null;
    return [R3(p[0] / 255), R3(p[1] / 255), R3(p[2] / 255), R3(a)];
  }
  // Any CSS color function. Chrome keeps oklch(), color() and the like in computed gradients and shadows (Tailwind 4 palettes)
  const COLOR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\((?:[^()]|\([^()]*\))*\)/;
  // "to right in oklab", "in oklch longer hue": the interpolation color space has no Figma counterpart, so drop it and keep the direction
  const dropColorSpace = s => s.replace(/(^|\s)in\s+[\w-]+(?:\s+(?:shorter|longer|increasing|decreasing)\s+hue)?\s*$/, '').trim();
  function splitTop(s) {
    const out = []; let d = 0, cur = '';
    for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  // Size and center of a radial gradient, returned as fractions of the box. The CSS default is ellipse farthest-corner at center;
  // returns null when px values are used but no box size was passed, so the default is drawn
  function radialGeom(prelude, w, h) {
    const [shape, at] = prelude.split(/\bat\b/);
    const frac = (v, full) => /%$/.test(v) ? parseFloat(v) / 100 : full ? px(v) / full : null;
    const KW = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };
    let cx = 0.5, cy = 0.5;
    if (at) {
      let t = at.trim().split(/\s+/);
      if (t.length === 1) t = /top|bottom/.test(t[0]) ? ['center', t[0]] : [t[0], 'center'];
      if (/top|bottom/.test(t[0]) || /left|right/.test(t[1])) t = [t[1], t[0]];
      cx = t[0] in KW ? KW[t[0]] : frac(t[0], w); cy = t[1] in KW ? KW[t[1]] : frac(t[1], h);
      if (cx === null || cy === null) return null;
    }
    const words = (shape || '').trim().split(/\s+/).filter(Boolean);
    const lens = words.filter(x => /^-?[\d.]+(px|%)$/.test(x));
    if (lens.some(x => x.endsWith('px')) && !(w && h)) return null;
    const W = w || 1, H = h || 1, size = words.find(x => /-(side|corner)$/.test(x)) || 'farthest-corner', near = size.startsWith('closest');
    let rx, ry;
    if (lens.length) { rx = frac(lens[0], W) * W; ry = lens[1] ? frac(lens[1], H) * H : rx; }
    else {
      const sx = (near ? Math.min : Math.max)(cx, 1 - cx) * W, sy = (near ? Math.min : Math.max)(cy, 1 - cy) * H;
      if (words.includes('circle')) rx = ry = size.endsWith('side') ? (near ? Math.min : Math.max)(sx, sy) : Math.hypot(sx, sy);
      else if (size.endsWith('side')) { rx = sx; ry = sy; }
      else { rx = sx * Math.SQRT2; ry = sy * Math.SQRT2; } // an ellipse to a corner keeps the ratio between the two sides
    }
    // Check after rounding: a very tall element with a radius of a few px rounds to 0, and al-build dividing by 0 rolls back the whole build
    const g = { rx: R3(rx / W), ry: R3(ry / H), cx: R3(cx), cy: R3(cy) };
    return g.rx > 0 && g.ry > 0 ? g : null;
  }
  function gradient(g, w, h) {
    const m = g.match(/^(?:repeating-)?(linear|radial)-gradient\(([\s\S]*)\)$/);
    if (!m) return null;
    const parts = splitTop(m[2]); let a = 180, geo = null;
    if (m[1] === 'linear') {
      const p0 = dropColorSpace(parts[0]);
      if (!COLOR_FN.test(p0)) {
        if (/deg|turn|rad/.test(p0)) a = parseFloat(p0) * (p0.includes('turn') ? 360 : p0.includes('rad') ? 57.2958 : 1);
        else { const map = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270, 'to top right': 45, 'to right top': 45, 'to bottom right': 135, 'to right bottom': 135, 'to bottom left': 225, 'to left bottom': 225, 'to top left': 315, 'to left top': 315 }; a = map[p0] ?? 180; }
        parts.shift();
      }
    } else if (!COLOR_FN.test(parts[0])) geo = radialGeom(dropColorSpace(parts.shift()), w, h);
    const stops = [];
    parts.forEach(p => {
      const cm = p.match(COLOR_FN); if (!cm) return;
      const c = color(cm[0], true); if (!c) return; const rest = p.replace(cm[0], '').trim();
      const pos = rest.match(/(-?[\d.]+)%/g);
      if (pos) pos.forEach(q => stops.push([R3(parseFloat(q) / 100), ...c]));
      else stops.push([null, ...c]);
    });
    if (stops.length < 2) return null;
    stops.forEach((s, i) => { if (s[0] === null) s[0] = R3(i / (stops.length - 1)); });
    // CSS interpolates with premultiplied alpha, Figma doesn't: fully transparent stops borrow the neighbor's color, otherwise the middle blends in the transparent color's own RGB (dark gradients wash out)
    stops.forEach((s, i) => {
      if (s[4] !== 0) return;
      const near = [stops[i + 1], stops[i - 1]].find(n => n && n[4] > 0);
      if (near) { s[1] = near[1]; s[2] = near[2]; s[3] = near[3]; }
    });
    const out = { t: m[1] === 'linear' ? 'L' : 'R', a: R1(a), s: stops };
    if (geo) out.geo = geo;
    return out;
  }

  let IMG, IMG_BOX, IMG_AS, IMG_AS_KEY, imgN, domOrder = 0;
  // The same image may be used at different sizes; record the largest display size and downscale to just that when extracting. as is an image to redraw the way it is displayed (see shownAs)
  function imgRef(url, w = 0, h = 0, as) {
    if (as) {
      const key = [url, Math.round(as.w), Math.round(as.h), as.fit, as.pos, as.filter].join('|');
      if (!IMG_AS_KEY.has(key)) { const ref = 'img' + (imgN++); IMG_AS_KEY.set(key, ref); IMG_AS.set(ref, Object.assign(as, { url })); }
      return IMG_AS_KEY.get(key);
    }
    if (!IMG.has(url)) { IMG.set(url, 'img' + (imgN++)); IMG_BOX.set(url, [0, 0]); }
    const box = IMG_BOX.get(url); box[0] = Math.max(box[0], w); box[1] = Math.max(box[1], h);
    return IMG.get(url);
  }
  function fills(cs, el) {
    const out = [];
    const bg = color(cs.backgroundColor); if (bg) out.push({ t: 'S', c: bg });
    const clipText = (cs.webkitBackgroundClip || cs.backgroundClip) === 'text';
    if (cs.backgroundImage && cs.backgroundImage !== 'none' && !clipText) {
      const layers = splitTop(cs.backgroundImage).reverse();
      const sizes = splitTop(cs.backgroundSize).reverse();
      layers.forEach((L, i) => {
        // image-set(): take the highest resolution (the last url)
        const set = /^(?:-webkit-)?image-set\(/.test(L) ? [...L.matchAll(/url\(["']?([^"')]+)["']?\)/g)].pop() : null;
        const u = set || L.match(/^url\(["']?([\s\S]*?)["']?\)$/);
        if (u) { const sz = (sizes[i] || sizes[0] || 'auto').trim(); const box = el ? el.getBoundingClientRect() : { width: 0, height: 0 }; out.push({ t: 'I', ref: imgRef(u[1], box.width, box.height), m: sz === 'contain' ? 'FIT' : 'FILL' }); return; }
        const gb = el ? el.getBoundingClientRect() : null;
        const g = gradient(L, gb && gb.width, gb && gb.height); if (g) out.push(g);
      });
    }
    return out;
  }
  function radius(cs) {
    const r = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(v => R1(px(v)));
    return r.some(v => v > 0) ? (r.every(v => v === r[0]) ? r[0] : r) : undefined;
  }
  function stroke(cs) {
    const w = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(px);
    const st = [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle];
    const cols = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].map(c => color(c));
    const ws = w.map((v, i) => (st[i] === 'none' || st[i] === 'hidden' || !cols[i]) ? 0 : R1(v));
    if (!ws.some(v => v > 0)) return undefined;
    const c = cols[ws.findIndex(v => v > 0)];
    return { c, w: ws.every(v => v === ws[0]) ? ws[0] : ws, d: st.some(s => s === 'dashed' || s === 'dotted') ? 1 : undefined };
  }
  // border-collapse: adjacent cells share one line, and drawing both doubles its thickness. The browser draws the line on the next cell's side, so keep the next cell's
  function collapsedStroke(el, st) {
    const w = Array.isArray(st.w) ? [...st.w] : [st.w, st.w, st.w, st.w];
    const row = el.parentElement, next = el.nextElementSibling;
    const below = row.nextElementSibling && row.nextElementSibling.children[[...row.children].indexOf(el)];
    if (next && px(getComputedStyle(next).borderLeftWidth) >= w[1]) w[1] = 0;
    if (below && px(getComputedStyle(below).borderTopWidth) >= w[2]) w[2] = 0;
    return w.some(v => v > 0) ? { ...st, w } : undefined;
  }
  // Outer size including the border; under content-box the computed width excludes the border
  function outerSize(cs) {
    if (cs.boxSizing === 'border-box') return [px(cs.width), px(cs.height)];
    return [px(cs.width) + px(cs.borderLeftWidth) + px(cs.borderRightWidth), px(cs.height) + px(cs.borderTopWidth) + px(cs.borderBottomWidth)];
  }
  // Combine transform and the individual translate/rotate/scale properties into one matrix (Tailwind 4 uses the latter)
  function matrixOf(cs, W, H) {
    const pct = (v, full) => /%$/.test(v) ? parseFloat(v) / 100 * full + 'px' : v;
    const parts = [];
    if (cs.translate && cs.translate !== 'none') { const [x, y = '0px'] = cs.translate.split(' '); parts.push(`translate(${pct(x, W)},${pct(y, H)})`); }
    if (cs.rotate && cs.rotate !== 'none') parts.push(`rotate(${cs.rotate})`);
    if (cs.scale && cs.scale !== 'none') parts.push(`scale(${cs.scale.split(' ').join(',')})`);
    if (cs.transform && cs.transform !== 'none') parts.push(cs.transform);
    if (!parts.length) return null;
    try { return new DOMMatrix(parts.join(' ')); } catch (e) { return null; }
  }
  const tilted = m => !!m && (Math.abs(m.b) > 0.02 || Math.abs(m.c) > 0.02);
  // Empty content area with borders mitred into diagonal edges: a CSS triangle
  function mitred(cs, W, H) {
    const on = BORDER_SIDES.map(s => px(cs['border' + s + 'Width']) > 0 && !/none|hidden/.test(cs['border' + s + 'Style']));
    const clear = BORDER_SIDES.map(s => !color(cs['border' + s + 'Color']));
    const empty = W - px(cs.borderLeftWidth) - px(cs.borderRightWidth) <= 0.5 || H - px(cs.borderTopWidth) - px(cs.borderBottomWidth) <= 0.5;
    return empty && on.some((v, i) => v && on[(i + 1) % 4] && clear[i] !== clear[(i + 1) % 4]);
  }
  // Figma frames can't draw mitred triangles or rotated boxes (checkmarks, arrows, small red badges), so convert them to vectors. box is the transformed bounding box, relative to the untransformed top-left corner
  function shapeJson(cs, W, H, m) {
    const [t, r, b, l] = BORDER_SIDES.map(s => /none|hidden/.test(cs['border' + s + 'Style']) ? 0 : px(cs['border' + s + 'Width']));
    const paint = c => `fill="rgb(${c.slice(0, 3).map(v => Math.round(v * 255)).join(',')})"${c[3] < 1 ? ` fill-opacity="${c[3]}"` : ''}`;
    const quads = [[[0, 0], [W, 0], [W - r, t], [l, t]], [[W, 0], [W, H], [W - r, H - b], [W - r, t]], [[W, H], [0, H], [l, H - b], [W - r, H - b]], [[0, H], [0, 0], [l, t], [l, H - b]]];
    let body = '';
    const bg = color(cs.backgroundColor);
    if (bg) body += `<rect width="${W}" height="${H}" rx="${Math.min(px(cs.borderTopLeftRadius), W / 2, H / 2)}" ${paint(bg)}/>`;
    BORDER_SIDES.forEach((s, i) => { const c = color(cs['border' + s + 'Color']); if ([t, r, b, l][i] && c) body += `<polygon points="${quads[i].map(p => p.join(',')).join(' ')}" ${paint(c)}/>`; });
    if (!body) return null;
    const [ox, oy] = (cs.transformOrigin || '0px 0px').split(' ').map(px);
    const full = new DOMMatrix().translate(ox, oy).multiply(m || new DOMMatrix()).translate(-ox, -oy);
    const pts = [[0, 0], [W, 0], [W, H], [0, H]].map(([x, y]) => full.transformPoint({ x, y }));
    const left = Math.min(...pts.map(p => p.x)), top = Math.min(...pts.map(p => p.y));
    const bw = Math.max(...pts.map(p => p.x)) - left, bh = Math.max(...pts.map(p => p.y)) - top;
    const g = new DOMMatrix().translate(-left, -top).multiply(full);
    const svg = `<svg xmlns="${NS}" viewBox="0 0 ${R1(bw)} ${R1(bh)}" width="${R1(bw)}" height="${R1(bh)}"><g transform="matrix(${[g.a, g.b, g.c, g.d, g.e, g.f].map(R3).join(' ')})">${body}</g></svg>`;
    return { svg, box: [left, top, bw, bh] };
  }
  function effects(cs) {
    const out = [];
    if (cs.boxShadow && cs.boxShadow !== 'none') splitTop(cs.boxShadow).forEach(s => {
      const cm = s.match(COLOR_FN); const c = (cm && color(cm[0], true)) || [0, 0, 0, 0.5];
      const nums = s.replace(cm ? cm[0] : '', '').match(/-?[\d.]+px|-?[\d.]+(?=\s|$)/g) || [];
      const [x, y, b, sp] = nums.map(px).concat([0, 0, 0, 0]);
      out.push([R1(x), R1(y), R1(b), R1(sp), ...c, /inset/.test(s) ? 1 : 0]);
    });
    const blur = (cs.backdropFilter || '').match(/blur\(([\d.]+)px\)/); if (blur) out.push(['BG', px(blur[1])]);
    const fb = (cs.filter || '').match(/blur\(([\d.]+)px\)/); if (fb) out.push(['LB', px(fb[1])]);
    return out.length ? out : undefined;
  }
  const hasBox = cs => !!(color(cs.backgroundColor) || (cs.backgroundImage !== 'none' && (cs.webkitBackgroundClip || cs.backgroundClip) !== 'text') || stroke(cs) || (cs.boxShadow && cs.boxShadow !== 'none'));
  const hasPad = cs => px(cs.paddingTop) + px(cs.paddingRight) + px(cs.paddingBottom) + px(cs.paddingLeft) > 0;

  // ---------- React ----------
  // React attaches a fiber to DOM nodes (__reactFiber$… since 17, __reactInternalInstance$… in 16); walking up .return reaches the components that rendered it.
  // tests/react.test.cjs tests with real React 18 and 19; 16 and 17 have the same structure but are untested
  // Same rule as Vue: a node is a component boundary only if it is that component's "sole root node"; the name comes from the outermost one.
  // These names are framework and library plumbing (routing, error boundaries, transitions, Next.js internals), not design components;
  // without excluding them, every link or image on the site would be merged into one component with dozens of variants
  const REACT_BUILTIN = new Set(['Fragment', 'StrictMode', 'Suspense', 'SuspenseList', 'Profiler', 'Activity', 'ViewTransition', 'Offscreen',
    'BrowserRouter', 'HashRouter', 'MemoryRouter', 'Router', 'RouterProvider', 'Routes', 'Route', 'RenderedRoute', 'RenderErrorBoundary', 'Outlet', 'Link', 'NavLink', 'Navigate', 'ScrollRestoration',
    'AppRouter', 'HotReload', 'ReactDevOverlay', 'AppDevOverlay', 'ServerRoot', 'Root', 'InnerLayoutRouter', 'OuterLayoutRouter', 'LayoutRouter', 'RenderFromTemplateContext', 'ScrollAndFocusHandler', 'InnerScrollAndFocusHandler', 'LoadingBoundary', 'ErrorBoundary', 'ErrorBoundaryHandler', 'NotFoundBoundary', 'NotFoundErrorBoundary', 'HTTPAccessFallbackBoundary', 'HTTPAccessFallbackErrorBoundary', 'RedirectBoundary', 'RedirectErrorBoundary', 'ClientPageRoot', 'ClientSegmentRoot', 'MetadataBoundary', 'ViewportBoundary', 'OutletBoundary', 'SegmentViewNode', 'LinkComponent', 'Image', 'Script', 'Head',
    'Transition', 'CSSTransition', 'TransitionGroup', 'SwitchTransition', 'AnimatePresence', 'PresenceChild', 'PopChild', 'LayoutGroup', 'LazyMotion', 'MotionConfig', 'MotionComponent',
    'Slot', 'SlotClone', 'Slottable', 'Primitive', 'Presence', 'Portal', 'DismissableLayer', 'FocusScope', 'RemoveScroll', 'VisuallyHidden', 'Collection', 'CollectionSlot', 'CollectionItemSlot', 'RovingFocusGroup', 'RovingFocusGroupItem',
    'Swiper', 'SwiperSlide']);
  let FIBER_KEY = null;
  function fiberOf(el) {
    if (FIBER_KEY && el[FIBER_KEY]) return el[FIBER_KEY];
    const k = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    if (!k) return null;
    FIBER_KEY = k; return el[k];
  }
  // Production build fibers have no _debugOwner and component names are minified to e, t; using them would only create meaningless components
  const reactDev = f => !!f && '_debugOwner' in f;
  // DOM nodes, React roots and portals are boundaries; walking up stops there
  const isBoundary = f => !!(f.stateNode && (f.stateNode.nodeType || f.stateNode.containerInfo));
  const isComposite = f => typeof f.type === 'function' || !!(f.type && typeof f.type === 'object' && (typeof f.type.render === 'function' || f.type.type));
  function typeName(t, d = 0) {
    if (!t || d > 3) return null;
    if (typeof t === 'function') return t.displayName || t.name || null;
    if (typeof t === 'object') return t.displayName || typeName(t.render, d + 1) || typeName(t.type, d + 1);
    return null;
  }
  // The top-level DOM nodes a component outputs; portal content lives elsewhere and content hidden by Suspense is display:none, so neither counts
  function hostTops(f, out = []) {
    for (let c = f.child; c && out.length < 50; c = c.sibling) {
      const s = c.stateNode;
      if (s && s.containerInfo) continue;
      if (s && s.nodeType) { if (!(s.nodeType === 1 && s.style && s.style.display === 'none')) out.push(s); continue; }
      hostTops(c, out);
    }
    return out;
  }
  // A fiber has a current and an old copy (alternate); the old one may be a loading screen. Look only at versions whose output includes el; if any of them has other nodes too, el is not the sole root
  function soleRoot(f, el) {
    let ok = false;
    for (const v of [f, f.alternate]) {
      if (!v) continue;
      const tops = hostTops(v);
      if (!tops.includes(el)) continue;
      if (tops.length !== 1) return false;
      ok = true;
    }
    return ok;
  }
  // Elements passed in through props.children
  function childEls(f) {
    const out = [];
    (function add(c, d) {
      if (d > 4 || c == null || typeof c !== 'object') return;
      if (Array.isArray(c)) return c.forEach(x => add(x, d + 1));
      if (c.props === undefined || c.type === undefined) return;
      if (typeof c.type === 'symbol') return add(c.props.children, d + 1); // <>…</>
      out.push(c);
    })(f.memoizedProps && f.memoizedProps.children, 0);
    return out;
  }
  // Components that only render their children as-is (or after cloneElement): Provider, Tooltip, Popover, ErrorBoundary.
  // Their root node is really the element passed in from outside, so the name belongs to that element; otherwise a button would be called Tooltip
  function passThrough(f, below) {
    const els = [f, f.alternate].filter(Boolean).flatMap(childEls);
    if (!els.length) return false;
    return below.some(c => els.some(e => c.memoizedProps === e.props || (c.alternate && c.alternate.memoizedProps === e.props) || (typeof e.type !== 'string' && c.elementType === e.type)));
  }
  // By convention component names start with a capital letter; styled.div, Primitive.div, ForwardRef(Box) and the like are wrappers
  const okName = n => (n && /^[A-Z]/.test(n) && !/[.()\s]/.test(n) && !REACT_BUILTIN.has(n) ? n : null);
  function reactName(f) {
    const t = f.type;
    if (t.styledComponentId || t.__emotion_styles || t.__emotion_base) return null; // styled-components, emotion: just tags with a class
    return okName(typeName(f.elementType) || typeName(t));
  }
  // Server Components (Next.js App Router, etc.) have no fiber in the browser; React 19 dev builds record their names in the _debugInfo of the fibers they output,
  // ordered outside-in. When one returns a Fragment the name is recorded on the Fragment, so the sole-root check still applies
  const serverNames = f => (Array.isArray(f._debugInfo) ? f._debugInfo.filter(i => i && typeof i.name === 'string').map(i => i.name).reverse() : []);
  // The components el is the sole root node of, inside-out. asChild (Radix, shadcn) merges a component's own styles and behavior into its child element:
  // if the child is itself a component, the name goes to the child (TooltipTrigger asChild wrapping Button → Button); only if the child is a plain tag is the asChild component's name used (Button asChild wrapping <a> → Button)
  function reactOwners(el) {
    const f0 = fiberOf(el);
    if (!f0 || !reactDev(f0)) return [];
    const out = [], below = [f0];
    const addServer = (f, asChild) => serverNames(f).forEach(name => out.push({ name, asChild }));
    addServer(f0, false);
    for (let p = f0.return; p && !isBoundary(p); p = p.return) {
      const comp = isComposite(p);
      if (comp || serverNames(p).length) {
        if (!soleRoot(p, el)) break;
        const asChild = !!(p.memoizedProps && p.memoizedProps.asChild === true);
        if (asChild || !passThrough(p, below)) {
          if (comp) out.push({ f: p, asChild });
          addServer(p, asChild); // the Server Component that returns this component sits outside it
        }
      }
      below.push(p);
    }
    return out;
  }

  // How each framework finds components from the DOM. To support a new framework, add an adapter: detect, component (component name), iconProp (semantic icon name)
  const ADAPTERS = {
    vue3: {
      // Production builds have no __vueParentComponent; use the dev server
      detect: () => [...document.body.querySelectorAll('*')].slice(0, 300).some(e => e.__vueParentComponent),
      component(el) {
        let inst = el.__vueParentComponent, name = null;
        while (inst && inst.subTree && inst.subTree.el === el) {
          const n = inst.type && (inst.type.__name || inst.type.name);
          if (n && !BUILTIN.has(n)) name = n;
          inst = inst.parent;
        }
        return name;
      },
      iconProp(el) {
        for (let inst = el.__vueParentComponent; inst && inst.subTree && inst.subTree.el === el; inst = inst.parent) {
          const v = inst.props && inst.props.name; if (typeof v === 'string' && v.includes(':')) return v;
        }
      },
    },
    react: {
      // A production build yields no names, so it is treated as having no adapter; al-capture warns to use the dev server instead
      detect: () => [...document.body.querySelectorAll('*')].slice(0, 300).some(e => reactDev(fiberOf(e))),
      component(el) {
        let name = null, fallback = null;
        for (const { f, name: server, asChild } of reactOwners(el)) {
          const n = f ? reactName(f) : okName(server); if (!n) continue;
          if (!asChild) name = n; else if (!fallback) fallback = n;
        }
        return name || fallback;
      },
      iconProp(el) {
        // Iconify's <Icon icon="mdi:home" />, or a custom wrapper like <Icon name="system:cross" />
        for (const { f } of reactOwners(el)) {
          if (!f) continue;
          const p = f.memoizedProps || {};
          for (const v of [p.icon, p.name]) if (typeof v === 'string' && v.includes(':')) return v;
        }
      },
    },
  };
  const NO_FRAMEWORK = { component: () => null, iconProp: () => undefined };
  let FW = NO_FRAMEWORK, FW_NAME = null, CFG = {};
  const compOf = el => FW.component(el);
  // Semantic icon name (e.g. system:cross), used to match the icon library; sprite mappings come from the preset's extract.sprites
  function iconNameOf(el, sprite) {
    const v = FW.iconProp(el); if (v) return v;
    const id = (sprite || '').replace(/^#/, '');
    // Sprites often use kebab-case (star-full), libraries use camelCase (starFull)
    for (const [prefix, lib] of Object.entries(CFG.sprites || {})) if (id.startsWith(prefix)) return lib + id.slice(prefix.length).replace(/-(\w)/g, (_, c) => c.toUpperCase());
  }
  // Icons whose content hasn't loaded yet (CDN blocked, lazy load still pending) have no shapes in the svg
  const emptyIcon = el => !el.querySelector('path, circle, rect, ellipse, polygon, polyline, line, use, image, text');
  // The color may come from markup, a class or currentColor; multicolor icons return nothing, so swapping in a library icon keeps its original colors
  function iconColor(el, svg) {
    // An empty svg reads as the default black fill; once loaded, icons mostly use currentColor
    if (emptyIcon(el)) return color(getComputedStyle(el).color);
    const paints = new Set();
    for (const shape of el.querySelectorAll('path, circle, rect, ellipse, polygon, use')) {
      const c = getComputedStyle(shape);
      for (const p of [c.fill, c.stroke]) if (p && p !== 'none' && color(p)) paints.add(p);
    }
    if (paints.size === 1) return color([...paints][0]);
    if (paints.size > 1) return undefined;
    const m = svg.match(/fill="(rgba?\([^"]+\))"/);
    return m ? color(m[1]) : undefined;
  }
  function flipped(el) {
    let n = 0;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const t = getComputedStyle(e).transform;
      if (t && t.startsWith('matrix3d')) { const v = t.slice(9, -1).split(',').map(parseFloat); if (v[0] < 0 && v[10] < 0) n++; }
    }
    return n % 2 === 1;
  }
  // Utility classes like Tailwind's are meaningless as layer names; require at least two (a single class like top-bar is the project's own naming)
  const WORD_UTIL = new Set(['flex', 'grid', 'hidden', 'block', 'inline', 'relative', 'absolute', 'fixed', 'sticky', 'static', 'truncate', 'underline', 'uppercase', 'lowercase', 'capitalize', 'italic', 'container', 'contents', 'grow', 'shrink', 'transition', 'border', 'shadow', 'rounded']);
  const PREFIX_UTIL = /^-?(?:bg|text|border|rounded|shadow|font|leading|tracking|p[trblxy]?|m[trblxy]?|gap|space-[xy]|[wh]|min-[wh]|max-[wh]|size|top|left|right|bottom|inset|z|opacity|flex|grid|items|justify|self|content|overflow|whitespace|cursor|transition|duration|ease|order|col|row|aspect|object|translate|rotate|scale|ring|fill|stroke|divide|from|via|to|line-clamp|basis|shrink|grow)-/;
  // Other common Tailwind utilities; prefixes that may collide with semantic classes (select-, list-, align-…) match only Tailwind's values
  const MORE_UTIL = /^(?:animate|backdrop|blur|drop-shadow|origin|will-change|appearance|mix-blend|pointer-events|decoration|underline-offset|caret|accent|columns|indent|snap|outline|place)-|^(?:sr-only|not-sr-only|antialiased|subpixel-antialiased|tabular-nums|isolate|invisible|visible|line-through|no-underline|not-italic|normal-case|flow-root)$|^inline-(?:flex|block|grid|table)$|^select-(?:none|text|all|auto)$|^list-(?:none|disc|decimal|inside|outside)$|^align-(?:baseline|top|middle|bottom|text-top|text-bottom|sub|super)$|^break-(?:words|all|keep|normal)$|^touch-(?:auto|none|manipulation|pan-[xy]|pinch-zoom)$|^float-(?:left|right|none|start|end)$/;
  const isUtil = c => c.includes(':') || c.includes('[') || WORD_UTIL.has(c) || PREFIX_UTIL.test(c) || MORE_UTIL.test(c);
  // Library-generated ids (React useId's :r1:, «r1», _r_1_; Radix, Headless UI, MUI prefixes) may change on every render, so they can't be layer names
  const GENERATED_ID = /^(?:radix-|headlessui-|react-aria|mui-\d)|[:«»]|_r_[0-9a-z]+_|^\d/;
  const nameOf = el => {
    const dt = el.getAttribute('data-test') || el.getAttribute('data-testid');
    if (dt) return dt;
    const classes = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean);
    const utility = classes.filter(isUtil).length >= 2 || (classes.length === 1 && WORD_UTIL.has(classes[0]));
    const c = utility ? classes.find(x => !isUtil(x)) : classes[0];
    return c || (el.id && !GENERATED_ID.test(el.id) ? el.id : '') || compOf(el) || el.getAttribute('role') || el.tagName.toLowerCase();
  };
  const boxOf = r => [R1(r.left - OX), R1(r.top - OY), R1(r.width), R1(r.height)];
  let OX = 0, OY = 0, VW = 0, VH = 0;

  function fontOf(cs) {
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    return [fam, R1(px(cs.fontSize)), +cs.fontWeight || 400, cs.fontStyle === 'italic' ? 1 : 0];
  }
  function tf(s, cs) {
    if (cs.textTransform === 'uppercase') return s.toUpperCase();
    if (cs.textTransform === 'lowercase') return s.toLowerCase();
    if (cs.textTransform === 'capitalize') return s.replace(/\b\w/g, c => c.toUpperCase());
    return s;
  }
  function textColor(cs, el) {
    let c = color(cs.webkitTextFillColor) || color(cs.color);
    if ((cs.webkitBackgroundClip || cs.backgroundClip) === 'text' && cs.backgroundImage !== 'none') {
      const g = gradient(splitTop(cs.backgroundImage)[0]); if (g) return { g };
    }
    for (let e = el; e && e.nodeType === 1 && !c; e = e.parentElement) {
      const s2 = getComputedStyle(e);
      if ((s2.webkitBackgroundClip || s2.backgroundClip) === 'text') { const g = gradient(splitTop(s2.backgroundImage)[0]); if (g) return { g }; }
    }
    return c ? { c } : { c: [0, 0, 0, 1] };
  }
  const isTextish = (el) => {
    if (el.nodeType !== 1) return false;
    const tag = el.tagName.toLowerCase();
    if (['svg', 'img', 'canvas', 'video', 'input', 'textarea', 'select', 'button'].includes(tag)) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return true;
    if (!/^inline$/.test(cs.display) && tag !== 'br') return false;
    if (hasBox(cs) || hasPad(cs) || cs.position === 'absolute' || cs.position === 'fixed') return false;
    return [...el.children].every(isTextish);
  };
  function collectRuns(nodes, runs) {
    for (const n of nodes) {
      if (n.nodeType === 3) {
        const p = n.parentElement; if (!p) continue; const cs = getComputedStyle(p);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        let s = n.textContent;
        if (!/pre/.test(cs.whiteSpace)) s = s.replace(/\s+/g, ' ');
        if (s) runs.push({ s: tf(s, cs), f: fontOf(cs), col: textColor(cs, p), u: /underline/.test(cs.textDecorationLine) ? 1 : 0, node: n });
      } else if (n.nodeType === 1) {
        if (n.tagName === 'BR') { const cs = getComputedStyle(n.parentElement); runs.push({ s: '\n', f: fontOf(cs), col: textColor(cs, n.parentElement), u: 0 }); continue; }
        if (getComputedStyle(n).display === 'none') continue;
        collectRuns(n.childNodes, runs);
      }
    }
  }
  // Inline elements have no width of their own; walk up to the first block-level element
  function contentBox(el) {
    let e = el, cs = getComputedStyle(e);
    while (/^inline/.test(cs.display) && e.parentElement) { e = e.parentElement; cs = getComputedStyle(e); }
    const r = e.getBoundingClientRect(), l = px(cs.paddingLeft) + px(cs.borderLeftWidth);
    return { left: r.left + l, width: r.width - l - px(cs.paddingRight) - px(cs.borderRightWidth) };
  }
  function textJson(nodes, hostEl, hostCs) {
    const runs = []; collectRuns(nodes, runs);
    let s = runs.map(r => r.s).join('');
    const lead = s.length - s.trimStart().length; s = s.trim();
    if (!s) return null;
    const range = document.createRange(); const rects = [];
    for (const n of nodes) {
      if (n.nodeType === 3) { // measure only non-whitespace characters: leading/trailing newlines under pre-line make the text box taller and shift it up
        const t = n.textContent, a = t.search(/\S/); if (a < 0) continue;
        range.setStart(n, a); range.setEnd(n, t.trimEnd().length); rects.push(...range.getClientRects()); }
      else if (n.nodeType === 1) rects.push(...n.getClientRects());
    }
    const rs = rects.filter(r => r.width > 0 && r.height > 0);
    if (!rs.length) return null;
    const L = Math.min(...rs.map(r => r.left)), Rr = Math.max(...rs.map(r => r.right));
    let T = Math.min(...rs.map(r => r.top)), B = Math.max(...rs.map(r => r.bottom));
    // With mixed font sizes on one line the tops differ a lot; count a new line only when the rects don't overlap
    const fsz = px(hostCs.fontSize) || 12;
    let lines = 1, lineBottom = -Infinity;
    for (const r of [...rs].sort((a, b) => a.top - b.top)) {
      if (lineBottom !== -Infinity && r.top >= lineBottom - fsz * 0.3) lines++;
      lineBottom = lineBottom === -Infinity || r.top >= lineBottom - fsz * 0.3 ? r.bottom : Math.max(lineBottom, r.bottom);
    }
    // The glyph box is often taller than the line height, sticks out of the parent and gets treated as scrolled content and made absolute; correct it back to the line height.
    // Multi-line text is the opposite: the glyph box is smaller than the line height, but Figma's box is line height × lines, so without correction each block drifts down a few px
    // With mixed font sizes on one line, the largest glyphs set the line height, so the host's line-height is inaccurate
    const mixedSizes = new Set(runs.map(r => r.f[1])).size > 1;
    const lineBox = mixedSizes ? 0 : px(hostCs.lineHeight) * lines, extra = (B - T - lineBox) / 2;
    if (lineBox && (extra > 0.25 || (lines > 1 && extra < -0.25))) { T += extra; B -= extra; }
    // Lines hidden by line-clamp still have glyph boxes; count only the visible lines
    const clamped = parseInt(hostCs.webkitLineClamp, 10);
    if (clamped > 0 && lines > clamped) B = T + (B - T) * clamped / lines;
    const base = runs.find(r => r.s.trim()) || runs[0];
    const j = { k: 'T', n: s.slice(0, 40), b: [R1(L - OX), R1(T - OY), R1(Rr - L), R1(B - T)], s, f: base.f };
    // Multi-line glyphs are narrower than the container; a box built at glyph width makes Figma break lines differently
    if (lines > 1) { const c = contentBox(hostEl); if (c.width > j.b[2]) { j.b[0] = R1(c.left - OX); j.b[2] = R1(c.width); } }
    const clamp = parseInt(hostCs.webkitLineClamp, 10); if (clamp > 0) j.clamp = clamp;
    Object.assign(j, base.col.g ? { tg: base.col.g } : { c: base.col.c });
    // Text under transform: scale() keeps its computed font size but looks smaller on screen
    const sc = hostEl.offsetWidth ? hostEl.getBoundingClientRect().width / hostEl.offsetWidth : 1;
    const scale = Math.abs(sc - 1) > 0.02 ? sc : 1;
    if (scale !== 1) j.f = [j.f[0], R1(j.f[1] * scale), ...j.f.slice(2)];
    const lh = hostCs.lineHeight; if (lh !== 'normal' && !(mixedSizes && lines === 1)) j.lh = R1(px(lh) * scale);
    const ls = hostCs.letterSpacing; if (ls !== 'normal' && px(ls)) j.ls = R1(px(ls) * scale);
    if (lines > 1 || s.includes('\n')) j.ml = 1;
    // CSS ellipsis alone doesn't mean the text is actually cut; Figma text renders wider, so marking non-overflowing text as truncated adds a stray "…"
    if (hostCs.textOverflow === 'ellipsis' && hostCs.overflow === 'hidden' && hostEl.scrollWidth > hostEl.clientWidth) {
      j.tr = 1;
      // Range measures the full untruncated text width; a box that wide pushes later elements in the same row away
      const c = contentBox(hostEl); if (c.width < j.b[2]) j.b[2] = R1(c.width);
    }
    const al = hostCs.textAlign; j.al = /center/.test(al) ? 'C' : /right|end/.test(al) ? 'R' : /justify/.test(al) ? 'J' : 'L';
    if (base.u) j.u = 1;
    const tsw = px(hostCs.webkitTextStrokeWidth); if (tsw) j.ts = [R1(tsw), ...(color(hostCs.webkitTextStrokeColor) || [0, 0, 0, 1])];
    if (hostCs.textShadow && hostCs.textShadow !== 'none') { const cm = hostCs.textShadow.match(COLOR_FN); const nums = hostCs.textShadow.replace(cm ? cm[0] : '', '').match(/-?[\d.]+px/g) || []; j.sh = [...nums.map(px).slice(0, 3).map(R1), ...((cm && color(cm[0], true)) || [0, 0, 0, 0.5])]; }
    // style runs that differ from base
    let off = -lead; const segs = [];
    for (const r of runs) {
      const a = Math.max(0, off), b = Math.min(s.length, off + r.s.length); off += r.s.length;
      if (b <= a) continue;
      const same = JSON.stringify(r.f) === JSON.stringify(base.f) && JSON.stringify(r.col) === JSON.stringify(base.col) && r.u === base.u;
      if (!same) segs.push([a, b, r.f, r.col.c || (r.col.g && r.col.g.s[0].slice(1)) || [0, 0, 0, 1], r.u]);
    }
    if (segs.length) j.rn = segs;
    return j;
  }

  // Icons exported from design tools often wrap everything in a canvas-sized rectangular clipPath that clips nothing; imported into Figma it becomes a black background
  function dropRectClips(svg) {
    if (!svg.includes('clipPath')) return svg;
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return svg;
    for (const c of [...doc.querySelectorAll('clipPath')]) {
      const kids = [...c.children];
      const isRect = kids.length === 1 && (kids[0].tagName === 'rect' || /^M[\d.\-\s]+h[\d.\-]+v[\d.\-]+H[\d.\-]+z$/i.test(kids[0].getAttribute('d') || ''));
      if (!isRect) continue;
      for (const u of doc.querySelectorAll(`[clip-path="url(#${c.id})"]`)) u.removeAttribute('clip-path');
      c.remove();
    }
    for (const d of doc.querySelectorAll('defs')) if (!d.children.length) d.remove();
    return new XMLSerializer().serializeToString(doc.documentElement);
  }
  function svgJson(el) {
    const r = el.getBoundingClientRect();
    const clone = el.cloneNode(true);
    const orig = [el, ...el.querySelectorAll('*')], cl = [clone, ...clone.querySelectorAll('*')];
    orig.forEach((o, i) => {
      const c = cl[i]; if (!c || !c.setAttribute) return;
      const cs = getComputedStyle(o);
      if (cs.display === 'none') { c.setAttribute('display', 'none'); return; }
      const f = cs.fill; if (f && f !== 'none' && !f.startsWith('url')) c.setAttribute('fill', f); else if (f === 'none') c.setAttribute('fill', 'none');
      const s = cs.stroke; if (s && s !== 'none' && !s.startsWith('url')) { c.setAttribute('stroke', s); c.setAttribute('stroke-width', cs.strokeWidth); }
      if (+cs.opacity < 1) c.setAttribute('opacity', cs.opacity);
      if (cs.fillOpacity && cs.fillOpacity !== '1') c.setAttribute('fill-opacity', cs.fillOpacity);
      c.removeAttribute('class'); c.removeAttribute('style');
    });
    const ovb = (el.getAttribute('viewBox') || '').split(/[\s,]+/).map(parseFloat);
    const OW = ovb.length === 4 ? ovb[2] : r.width, OH = ovb.length === 4 ? ovb[3] : r.height;
    const uses = [...clone.querySelectorAll('use')];
    uses.forEach(u => {
      const href = u.getAttribute('href') || u.getAttribute('xlink:href');
      const ref = href && href.startsWith('#') && document.getElementById(href.slice(1));
      if (!ref) { u.remove(); return; }
      const isSym = ref.tagName.toLowerCase() === 'symbol';
      const vb = isSym && ref.getAttribute('viewBox') ? ref.getAttribute('viewBox').split(/[\s,]+/).map(parseFloat) : null;
      const ux = parseFloat(u.getAttribute('x')) || 0, uy = parseFloat(u.getAttribute('y')) || 0;
      const pct = (v, full) => v == null ? full : /%$/.test(v) ? parseFloat(v) / 100 * full : parseFloat(v);
      const uw = pct(u.getAttribute('width'), OW), uh = pct(u.getAttribute('height'), OH);
      const g = document.createElementNS(NS, 'g');
      if (vb) { const sc = Math.min(uw / vb[2], uh / vb[3]); const tx = ux + (uw - vb[2] * sc) / 2 - vb[0] * sc, ty = uy + (uh - vb[3] * sc) / 2 - vb[1] * sc; g.setAttribute('transform', `translate(${tx},${ty}) scale(${sc})`); g.innerHTML = ref.innerHTML; }
      else { g.setAttribute('transform', `translate(${ux},${uy})`); g.appendChild(ref.cloneNode(true)); }
      ['fill', 'stroke', 'opacity', 'fill-opacity', 'stroke-width'].forEach(a => { const v = u.getAttribute(a); if (v) g.setAttribute(a, v); });
      u.replaceWith(g);
    });
    if (ovb.length !== 4) clone.setAttribute('viewBox', `0 0 ${R1(r.width)} ${R1(r.height)}`);
    clone.querySelectorAll('[data-v-c74a83f9],[class]').forEach(e => { [...e.attributes].forEach(a => { if (a.name.startsWith('data-v-')) e.removeAttribute(a.name); }); });
    [...clone.attributes].forEach(a => { if (a.name.startsWith('data-v-')) clone.removeAttribute(a.name); });
    const col = getComputedStyle(el).color;
    clone.setAttribute('xmlns', NS);
    ['width', 'height', 'x', 'y', 'style', 'class'].forEach(a => clone.removeAttribute(a));
    clone.setAttribute('width', R1(r.width)); clone.setAttribute('height', R1(r.height));
    let s = new XMLSerializer().serializeToString(clone).replace(/currentColor/g, col);
    const u0 = el.querySelector('use'); const icon = u0 && (u0.getAttribute('href') || u0.getAttribute('xlink:href'));
    return { k: 'S', n: nameOf(el), b: boxOf(r), svg: dropRectClips(s), icon: icon || undefined };
  }

  function pseudo(el, which, elCs, elRect) {
    const ps = getComputedStyle(el, which);
    const content = ps.content;
    if (!content || content === 'none' || content === 'normal' || ps.display === 'none') return null;
    const txt = /^["']/.test(content) ? content.slice(1, -1).replace(/\\(.)/g, '$1') : '';
    const urlM = content.match(/url\(["']?(.*?)["']?\)/);
    const bl = px(elCs.borderLeftWidth), bt = px(elCs.borderTopWidth);
    if (ps.position !== 'absolute' && ps.position !== 'fixed') {
      // Small inline color blocks (list bullets) and boxes at the start of a flex row (custom checkboxes) have no DOM node of their own
      const dw = px(ps.width), dh = px(ps.height), dfl = fills(ps), dst = stroke(ps);
      const flexItem = /flex/.test(elCs.display);
      if (which !== '::before' || (ps.display !== 'inline-block' && !flexItem) || txt || urlM || !dw || !dh || (!dfl.length && !dst)) return null;
      const top = elRect.top - OY + bt + px(elCs.paddingTop), inner = elRect.height - bt - px(elCs.borderBottomWidth) - px(elCs.paddingTop) - px(elCs.paddingBottom);
      const lh = elCs.lineHeight === 'normal' ? px(elCs.fontSize) * 1.2 : px(elCs.lineHeight);
      const align = ps.alignSelf === 'auto' ? elCs.alignItems : ps.alignSelf;
      const y = !flexItem ? top + (lh - dh) / 2 : /center/.test(align) ? top + (inner - dh) / 2 : top;
      const d = { k: 'F', n: 'before', b: [R1(elRect.left - OX + bl + px(elCs.paddingLeft) + px(ps.marginLeft)), R1(y), R1(dw), R1(dh)], abs: 1, ord: 0, pos: 1 };
      const pz = ps.zIndex === 'auto' ? 0 : +ps.zIndex; if (pz) d.z = pz;
      if (dfl.length) d.fl = dfl;
      if (dst) d.st = dst;
      const dr = radius(ps); if (dr !== undefined) d.r = dr;
      return d;
    }
    const pw = elRect.width - bl - px(elCs.borderRightWidth), ph = elRect.height - bt - px(elCs.borderBottomWidth);
    const [w, h] = outerSize(ps);
    let x = ps.left !== 'auto' ? px(ps.left) : ps.right !== 'auto' ? pw - px(ps.right) - w : 0;
    let y = ps.top !== 'auto' ? px(ps.top) : ps.bottom !== 'auto' ? ph - px(ps.bottom) - h : 0;
    if (w <= 0 || h <= 0) return null;
    // ::before paints before the content, ::after after it
    const pord = which === '::after' ? Number.MAX_SAFE_INTEGER : 0;
    // Decorative layers with z-index: -1 go behind the content
    const pz = ps.zIndex === 'auto' ? 0 : +ps.zIndex;
    const fl = fills(ps); if (urlM) fl.push({ t: 'I', ref: imgRef(urlM[1], w, h), m: 'FIT' });
    const pm = matrixOf(ps, w, h);
    if (!txt && fl.every(f => f.t === 'S') && (tilted(pm) || mitred(ps, w, h))) {
      const sh = shapeJson(ps, w, h, pm);
      if (sh) {
        const s = { k: 'S', n: which.replace('::', ''), svg: sh.svg, b: [R1(elRect.left - OX + bl + x + sh.box[0]), R1(elRect.top - OY + bt + y + sh.box[1]), R1(sh.box[2]), R1(sh.box[3])], abs: 1, pos: 1, ord: pord };
        if (pz) s.z = pz;
        return s;
      }
    }
    const tm = (ps.transform || '').match(/matrix\(([^)]+)\)/);
    if (tm) { const v = tm[1].split(',').map(parseFloat); x += v[4]; y += v[5]; }
    const b = [R1(elRect.left - OX + bl + x), R1(elRect.top - OY + bt + y), R1(w), R1(h)];
    const j = { k: 'F', n: which.replace('::', ''), b, abs: 1, pos: 1, ord: pord };
    if (pz) j.z = pz;
    if (fl.length) j.fl = fl;
    const st = stroke(ps); if (st) j.st = st;
    const r = radius(ps); if (r !== undefined) j.r = r;
    const ef = effects(ps); if (ef) j.ef = ef;
    if (+ps.opacity < 1) j.op = R3(+ps.opacity);
    if (txt) {
      const t = { k: 'T', n: txt.slice(0, 40), b: [...b], s: tf(txt, ps), f: fontOf(ps), al: 'C', fixed: 1 };
      Object.assign(t, textColor(ps, el).c ? { c: textColor(ps, el).c } : {});
      const tsw = px(ps.webkitTextStrokeWidth); if (tsw) t.ts = [R1(tsw), ...(color(ps.webkitTextStrokeColor) || [0, 0, 0, 1])];
      if (!j.fl && !j.st) { t.abs = 1; t.n = which.replace('::', '') + ' ' + t.n; return t; }
      j.kids = [t]; j.L = { d: 'H', g: 0, p: [0, 0, 0, 0], pa: 'C', ca: 'C' };
    }
    if (!j.fl && !j.st && !j.ef && !j.kids) return null;
    return j;
  }

  // ---------- layout ----------
  function layout(j, cs, flow) {
    if (!flow.length) return;
    const [X, Y, W, H] = j.b;
    const isFlex = /flex/.test(cs.display);
    let dir = isFlex ? (cs.flexDirection.startsWith('column') ? 'V' : 'H') : null;
    const byY = [...flow].sort((a, b) => a.b[1] - b.b[1] || a.b[0] - b.b[0]);
    const byX = [...flow].sort((a, b) => a.b[0] - b.b[0] || a.b[1] - b.b[1]);
    const stackV = byY.every((k, i) => !i || k.b[1] >= byY[i - 1].b[1] + byY[i - 1].b[3] - 1.5);
    const stackH = byX.every((k, i) => !i || k.b[0] >= byX[i - 1].b[0] + byX[i - 1].b[2] - 1.5);
    // wrap rows (horizontal, several lines)
    const rows = []; byY.forEach(k => { const row = rows.find(r => Math.abs(r[0].b[1] - k.b[1]) < 2); row ? row.push(k) : rows.push([k]); });
    // Every row must start at the same x for Figma's wrap to reproduce it; grids with items spanning rows don't qualify and fall back to absolute positioning
    const rowStarts = rows.map(r => Math.min(...r.map(k => k.b[0])));
    const wrapOK = rows.length > 1 && rows.every(r => r.length >= 1) && rows.some(r => r.length > 1) && rowStarts.every(x => Math.abs(x - rowStarts[0]) <= 2) && (cs.flexWrap === 'wrap' || /grid/.test(cs.display));
    if (flow.length === 1) dir = dir || (cs.display.includes('inline') ? 'H' : 'V');
    else if (dir === 'H' && !stackH) dir = wrapOK ? 'W' : stackV ? 'V' : null;
    else if (dir === 'V' && !stackV) dir = stackH ? 'H' : null;
    else if (!dir) dir = stackV ? 'V' : stackH ? 'H' : wrapOK ? 'W' : null;
    if (!dir) { flow.forEach(k => k.abs = 1); j.noAL = 1; return; }

    if (dir === 'W') {
      const ordered = rows.map(r => r.sort((a, b) => a.b[0] - b.b[0])).flat();
      const gx = Math.min(...rows.filter(r => r.length > 1).map(r => Math.min(...r.slice(1).map((k, i) => k.b[0] - (r[i].b[0] + r[i].b[2])))));
      const gy = Math.min(...rows.slice(1).map((r, i) => r[0].b[1] - (rows[i][0].b[1] + Math.max(...rows[i].map(k => k.b[3])))));
      const pl = Math.min(...flow.map(k => k.b[0])) - X, pt = Math.min(...flow.map(k => k.b[1])) - Y;
      j.L = { d: 'H', w: 1, g: R1(Math.max(0, gx)), cg: R1(Math.max(0, gy)), p: [R1(pt), 0, 0, R1(pl)], pa: 'MIN', ca: 'MIN' };
      return ordered;
    }
    const P = dir === 'V' ? 1 : 0, C = 1 - P; // primary/cross index into b
    const seq = dir === 'V' ? byY : byX;
    const start = k => k.b[P], end = k => k.b[P] + k.b[P + 2];
    const cs0 = k => k.b[C] - j.b[C], ce0 = k => (j.b[C] + j.b[C + 2]) - (k.b[C] + k.b[C + 2]);
    const gaps = seq.slice(1).map((k, i) => start(k) - end(seq[i]));
    let gmin = gaps.length ? Math.min(...gaps) : 0;
    const uniform = gaps.length && Math.max(...gaps) - gmin <= 1.5;
    if (uniform) gmin = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    // A Spacer has a gap on each side that must be subtracted; when that isn't possible, set the gap to 0 and use a Spacer for every distance
    if (!uniform && gaps.some(g => g - gmin > 1.5 && g < 2 * gmin)) gmin = 0;
    const out = [];
    seq.forEach((k, i) => {
      if (i && !uniform && gaps[i - 1] - gmin > 1.5) {
        const size = Math.max(R1(gaps[i - 1] - 2 * gmin), 0.01);
        out.push({ k: 'F', n: 'Spacer', sp: size, b: dir === 'V' ? [k.b[0], end(seq[i - 1]), 1, size] : [end(seq[i - 1]), k.b[1], size, 1] });
      }
      out.push(k);
    });
    const ps = start(seq[0]) - j.b[P], pe = (j.b[P] + j.b[P + 2]) - end(seq[seq.length - 1]);
    const S = seq.map(cs0), E = seq.map(ce0);
    let ca, cps, cpe;
    // Leave centered content to Auto Layout; centering via padding or the text box breaks when an instance's text changes
    // When a flex-wrap row wraps into a single column, centering comes from justify-content
    const wrappedCenter = dir === 'V' && cs.flexWrap === 'wrap' && /center/.test(cs.justifyContent);
    const wantCenter = seq.every((k, i) => Math.abs(S[i] - E[i]) <= 2) && (/center/.test(cs.alignItems) || wrappedCenter || seq.every(k => k.k === 'T' && k.al === 'C'));
    if (wantCenter) {
      ca = 'C'; cps = cpe = Math.max(0, Math.min(...S, ...E));
      if (dir === 'V') seq.forEach(k => { if (k.k === 'T' && k.fixed && !k.ml && !k.tr && k.al === 'C' && k.b[3] <= (k.lh || k.f[1] * 1.6) + 1) delete k.fixed; });
    } else if (S.every(v => Math.abs(v - S[0]) <= 1.5)) { ca = 'MIN'; cps = S[0]; cpe = Math.max(0, Math.min(...E)); }
    else if (E.every(v => Math.abs(v - E[0]) <= 1.5)) { ca = 'MAX'; cpe = E[0]; cps = Math.max(0, Math.min(...S)); }
    else if (seq.every((k, i) => Math.abs(S[i] - E[i]) <= 2)) { ca = 'C'; cps = cpe = Math.max(0, Math.min(...S, ...E)); }
    else { // mixed: wrap off-line kids in a full-width aligner frame
      ca = 'MIN'; cps = Math.max(0, Math.min(...S)); cpe = Math.max(0, Math.min(...E));
      for (let i = 0; i < out.length; i++) {
        const k = out[i]; if (k.sp) continue;
        const s = cs0(k);
        if (s - cps > 1.5) {
          const b = dir === 'V' ? [j.b[0] + cps, k.b[1], j.b[2] - cps - cpe, k.b[3]] : [k.b[0], j.b[1] + cps, k.b[2], j.b[3] - cps - cpe];
          // It counts only if centered within the Align frame; with unequal padding on the two sides, a child centered in the parent would sit off-center inside Align
          const e = ce0(k), centered = Math.abs((s - cps) - (e - cpe)) <= 2;
          out[i] = { k: 'F', n: 'Align', b, kids: [k], L: { d: dir, g: 0, p: dir === 'V' ? [0, 0, 0, centered ? 0 : R1(s - cps)] : [centered ? 0 : R1(s - cps), 0, 0, 0], pa: 'MIN', ca: centered ? 'C' : 'MIN' }, fillC: 1 };
        }
      }
    }
    const pad = dir === 'V' ? [ps, cpe, pe, cps] : [cps, pe, cpe, ps];
    // Let Figma compute space-between and margin auto distances; stored as fixed values they overflow the container when text widths differ
    // When a child needs to grow, Fill absorbs the space-between spacing, so use the actual gap instead
    const between = dir === 'H' && isFlex && uniform && seq.length > 1 && cs.justifyContent === 'space-between' && !seq.some(k => k.el && +getComputedStyle(k.el).flexGrow > 0);
    const spacers = out.filter(k => k.sp);
    // End-aligned rows stored as start padding overflow with longer text; use the CSS padding and let Figma handle the alignment
    const toEnd = isFlex && !between && !spacers.length && /^(flex-)?end$/.test(cs.justifyContent);
    const realPad = side => px(cs['padding' + side]) + px(cs['border' + side + 'Width']);
    if (toEnd) { const side = dir === 'V' ? 'Top' : 'Left'; pad[dir === 'V' ? 0 : 3] = realPad(side); }
    // Same for centered rows: with the padding stored as a computed value, an instance with different text shifts to one side
    const toCenter = dir === 'H' && !between && !spacers.length && Math.abs(ps - pe) <= 2 && (isFlex ? cs.justifyContent === 'center' : /center/.test(cs.textAlign));
    const freeSpace = toCenter && ps - realPad('Left') > 1;
    if (toCenter) { pad[3] = realPad('Left'); pad[1] = realPad('Right'); }
    // getComputedStyle returns resolved px; only computedStyleMap shows auto
    const autoMargin = (el, side) => { try { return String(el.computedStyleMap().get('margin-' + side)) === 'auto'; } catch (e) { return false; } };
    const hasAutoMargin = !!j.el && [...j.el.children].some(e => autoMargin(e, 'left') || autoMargin(e, 'right'));
    const pushed = dir === 'H' && isFlex && spacers.length === 1 && hasAutoMargin;
    j.L = { d: dir, g: between ? 0 : R1(gmin), p: pad.map(v => R1(Math.max(0, v))), pa: between ? 'SB' : toEnd ? 'MAX' : toCenter ? 'C' : 'MIN', ca };
    if (gmin < 0) j.L.g = R1(gmin);
    // The only child fills the primary axis: when one component is used at different widths, an instance can only resize its outer frame, so al-build sets this layer to Fill to follow it
    const only = out.filter(k => !k.sp);
    const innerP = j.b[P + 2] - (dir === 'V' ? pad[0] + pad[2] : pad[1] + pad[3]);
    if (only.length === 1 && only[0].k !== 'T' && Math.abs(only[0].b[P + 2] - innerP) <= 1) only[0].fillP = 1;
    // sizing hints
    // A clipping container whose content is larger than its box (scrolling list, carousel) must be fixed-size; Hug would expand to show all the clipped content
    const clipsOverflow = pe < -1 && (dir === 'V' ? cs.overflowY : cs.overflowX) !== 'visible';
    j.L.hp = !between && !pushed && !toEnd && !freeSpace && !clipsOverflow && (Math.abs(pe - ps) <= 2 || pe <= 2) ? 1 : 0;
    j.L.hc = Math.abs(cpe - cps) <= 2 ? 1 : 0;
    if (pushed) spacers[0].grow = 1;
    const innerC = j.b[C + 2] - cps - cpe;
    out.forEach(k => {
      if (k.sp) return;
      if (k.b[C + 2] >= innerC - 1 && innerC > 0 && k.k !== 'T') k.fillC = 1;
      // Text whose width equals its natural width doesn't count as grow; a Fill box slightly narrower than Figma's text would wrap
      const natural = k.k === 'T' && k.tw && Math.abs(k.tw - k.b[P + 2]) <= 1;
      if (isFlex && k.el && +getComputedStyle(k.el).flexGrow > 0 && !natural) k.grow = 1;
    });
    // Figma's Fill splits the space equally after each child's padding, while CSS flex-grow adds leftover space to the content width: if the result doesn't match the browser widths, keep the browser widths
    const growers = out.filter(k => k.grow);
    const padOf = k => !k.L ? 0 : dir === 'V' ? k.L.p[0] + k.L.p[2] : k.L.p[1] + k.L.p[3];
    const share = (growers.reduce((a, k) => a + k.b[P + 2], 0) - growers.reduce((a, k) => a + padOf(k), 0)) / (growers.length || 1);
    if (growers.length > 1 && growers.some(k => Math.abs(share + padOf(k) - k.b[P + 2]) > 1)) growers.forEach(k => delete k.grow);
    // When a child grows, the parent can't Hug, or the child widens to fit its content and pushes its neighbors out
    if (out.some(k => k.grow)) j.L.hp = 0;
    return out;
  }
  // inset 0 -3px 0 is a way to draw an underline; Figma's Inner shadow is invisible on a frame without a fill, so convert it to a one-sided stroke
  function insetLine(j) {
    if (j.st || !j.ef) return;
    const i = j.ef.findIndex(e => e[8] === 1 && !e[2] && !e[3] && !e[0] !== !e[1]);
    if (i < 0) return;
    const [x, y, , , r, g, b, a] = j.ef[i];
    j.st = { c: [r, g, b, a], w: [Math.max(y, 0), Math.max(-x, 0), Math.max(-y, 0), Math.max(x, 0)] };
    j.ef.splice(i, 1); if (!j.ef.length) delete j.ef;
  }

  // Elements cut off by the viewport are missing their off-screen children; as main components they'd be just empty frames with stretched backgrounds (e.g. a whole page, a half-visible coupon card)
  const cutOff = b => b[0] < -1 || b[1] < -1 || b[0] + b[2] > VW + 1 || b[1] + b[3] > VH + 1;
  // A repeated structure that already contains components is just a container (e.g. a price column); wrapping it again only adds meaningless variants
  const holdsComp = j => (j.kids || []).some(k => k.k === 'F' && (k.c || holdsComp(k)));
  // Small components often carry state in a child's class (e.g. odd_selected); make it a variant so it can be selected, instead of relying only on instance color overrides
  const STATE_CLASS = /selected|active|disabled|checked|error|invalid/i;
  const STATE_ATTRS = { 'aria-selected': 'selected', 'aria-checked': 'checked', 'aria-pressed': 'pressed', 'aria-current': 'current', 'aria-disabled': 'disabled', 'aria-invalid': 'invalid' };
  function stateOf(el) {
    const all = [el, ...el.querySelectorAll('*')];
    if (all.length > 8) return [];
    // Variant classes like disabled:opacity-50 and hover:… are not states
    const classes = new Set(all.flatMap(e => [...e.classList]).filter(c => !c.includes(':') && STATE_CLASS.test(c)));
    if (classes.size) return [...classes];
    // Tailwind projects usually have no state classes, so check attributes instead
    const attrs = new Set();
    for (const e of all) {
      for (const [a, w] of Object.entries(STATE_ATTRS)) { const v = e.getAttribute(a); if (v && v !== 'false') attrs.add(w); }
      if (e.disabled) attrs.add('disabled');
      const ds = e.getAttribute('data-state'); if (ds && ds !== 'inactive' && ds !== 'closed' && ds !== 'unchecked') attrs.add(ds);
    }
    return [...attrs];
  }

  function nativeCheck(el, j, cs) {
    const accent = color(cs.accentColor) || [0, 0.459, 1, 1], on = el.checked, radio = el.type === 'radio';
    const [x, y, w, h] = j.b, rgb = `rgb(${accent.slice(0, 3).map(v => Math.round(v * 255)).join(',')})`;
    j.fl = [{ t: 'S', c: on && !radio ? accent : [1, 1, 1, 1] }];
    j.st = { c: on ? accent : [0.463, 0.463, 0.463, 1], w: 1 };
    j.r = radio ? R1(w / 2) : 2.5;
    if (el.disabled) j.op = 0.5;
    if (!on) return [];
    const mark = radio ? `<circle cx="8" cy="8" r="4" fill="${rgb}"/>` : '<path d="M3.5 8.3L6.7 11.4L12.6 4.9" stroke="white" stroke-width="2"/>';
    return [{ k: 'S', n: 'checkmark', b: [x, y, w, h], abs: 1, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 16 16" fill="none">${mark}</svg>` }];
  }

  function sig(j) {
    let s = j.k;
    if (j.k === 'S') { let h = 0; for (let i = 0; i < j.svg.length; i++) h = (h * 31 + j.svg.charCodeAt(i)) | 0; s += h; }
    if (j.fl && j.fl.some(f => f.t === 'I')) s += 'i';
    // Vertical and horizontal layouts can't share a main component because an instance can't change direction (e.g. the same component stacked on mobile, in a row on desktop)
    if (j.L) s += j.L.d;
    if (j.kids) s += '(' + j.kids.map(k => sig(k) + (k.abs ? '@' + Math.round((k.b[0] - j.b[0]) / 4) + ',' + Math.round((k.b[1] - j.b[1]) / 4) : '')).join(',') + ')';
    return s;
  }

  // Intersect overflow clipping all the way up; an empty intersection means fully invisible (e.g. an enlarged glow inside a carousel item outside the visible area)
  // For video, grab the current frame; fall back to black only if it hasn't loaded or is cross-origin and unreadable
  function videoFrame(el) {
    if (el.readyState < 2 || !el.videoWidth) return null;
    try {
      const c = document.createElement('canvas'); c.width = el.videoWidth; c.height = el.videoHeight;
      c.getContext('2d').drawImage(el, 0, 0);
      return c.toDataURL('image/jpeg', 0.85);
    } catch (e) { return null; }
  }
  function clippedOut(el) {
    const r = el.getBoundingClientRect();
    let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const c = getComputedStyle(p), q = p.getBoundingClientRect();
      if (c.overflowX !== 'visible') { left = Math.max(left, q.left); right = Math.min(right, q.right); }
      if (c.overflowY !== 'visible') { top = Math.max(top, q.top); bottom = Math.min(bottom, q.bottom); }
      if (left >= right || top >= bottom) return true;
    }
    return false;
  }

  function node(el, depth) {
    if (el.nodeType !== 1) return null;
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'link', 'meta', 'template', 'noscript'].includes(tag)) return null;
    if (el.classList.contains('vue-devtools__anchor') || el.id === '__vue-devtools-container__' || el.matches('[class*=vue-devtools]')) return null;
    if (tag === 'nextjs-portal') return null; // the N badge in the bottom-left corner and the error overlay in Next.js dev mode
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null;
    if (cs.backfaceVisibility === 'hidden' && flipped(el)) return null;
    const r = el.getBoundingClientRect();
    if (r.right <= OX || r.bottom <= OY || r.left >= OX + VW || r.top >= OY + VH) {
      // Keep elements that are off-screen themselves but have children overflowing into view (e.g. a carousel wrapper pushed out by transform)
      const inView = e => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 && q.right > OX && q.bottom > OY && q.left < OX + VW && q.top < OY + VH && !clippedOut(e); };
      if (r.width > 0 && r.height > 0 && ![...el.querySelectorAll('*')].some(inView)) return null;
    }
    // Icons drawn with a CSS mask (e.g. lucide-* classes in frappe-ui/UnoCSS): no children, the shape is in the mask-image SVG and the color is the background color.
    // Build vectors from the mask SVG and color them with the background color, otherwise they become solid blocks
    const maskUrl = (cs.webkitMaskImage && cs.webkitMaskImage !== 'none' ? cs.webkitMaskImage : cs.maskImage) || '';
    if (tag !== 'svg' && !el.children.length && /^url\("?data:image\/svg\+xml/.test(maskUrl) && r.width > 0 && r.height > 0) {
      const raw = maskUrl.replace(/^url\("?/, '').replace(/"?\)$/, '');
      const comma = raw.indexOf(',');
      let svg = raw.slice(0, comma).includes(';base64') ? atob(raw.slice(comma + 1)) : decodeURIComponent(raw.slice(comma + 1));
      svg = svg.replace(/<!--[\s\S]*?-->/g, '').trim();
      const bg = color(cs.backgroundColor, true) || [0, 0, 0, 1];
      const rgb = `rgb(${bg.slice(0, 3).map(v => Math.round(v * 255)).join(',')})`;
      svg = svg.replace(/currentColor/g, rgb).replace(/\s(width|height|class)="[^"]*"/g, '').replace(/<svg\b/, `<svg width="${R1(r.width)}" height="${R1(r.height)}"`);
      if (!/viewBox=/.test(svg)) svg = svg.replace(/<svg\b/, `<svg viewBox="0 0 24 24"`);
      if (!/xmlns=/.test(svg)) svg = svg.replace(/<svg\b/, `<svg xmlns="${NS}"`);
      const cls = [...el.classList].find(c => /^(?:i-)?lucide[-:]/.test(c)) || [...el.classList].find(c => /^i-/.test(c));
      const sv = { k: 'S', n: nameOf(el), b: boxOf(r), svg, icon: cls || undefined, c: compOf(el) ? { nm: compOf(el) } : undefined };
      if (bg[3] < 1) sv.op = R3(bg[3]);
      return sv;
    }
    if (tag === 'svg') {
      if (!(r.width > 0)) return null;
      // An icon sprite holds only <symbol> definitions and is invisible on screen; extracting it would add hundreds of vector layers to every card
      if (el.querySelector('symbol') && [...el.children].every(k => ['symbol', 'defs', 'title', 'desc'].includes(k.tagName.toLowerCase()))) return null;
      const sv = Object.assign(svgJson(el), { c: compOf(el) ? { nm: compOf(el) } : undefined });
      sv.lib = iconNameOf(el, sv.icon);
      sv.col = iconColor(el, sv.svg);
      if (emptyIcon(el)) sv.empty = 1;
      // Bake rotated or flipped icons (e.g. an arrow that points up when expanded) into the SVG, otherwise the direction is reversed; when swapping in a library icon, flip turns it back
      const flip = tfOf(cs);
      if (flip) {
        sv.flip = flip;
        const [vx, vy, vw, vh] = (sv.svg.match(/viewBox="([^"]+)"/) || [0, `0 0 ${r.width} ${r.height}`])[1].split(/[\s,]+/).map(Number);
        const [a, b, c, d] = flip, cx = vx + vw / 2, cy = vy + vh / 2;
        sv.svg = sv.svg.replace(/(<svg[^>]*>)([\s\S]*)(<\/svg>)/, `$1<g transform="matrix(${a} ${b} ${c} ${d} ${cx - a * cx - c * cy} ${cy - b * cx - d * cy})">$2</g>$3`);
      }
      // When the svg itself has a background/radius/padding (e.g. an icon button on a round gradient), wrap it in a frame that carries the background and shrink the svg to the content box
      if (hasBox(cs) || hasPad(cs)) {
        const pt = px(cs.paddingTop) + px(cs.borderTopWidth), pr = px(cs.paddingRight) + px(cs.borderRightWidth), pb = px(cs.paddingBottom) + px(cs.borderBottomWidth), pl = px(cs.paddingLeft) + px(cs.borderLeftWidth);
        const cw = R1(r.width - pl - pr), ch = R1(r.height - pt - pb);
        sv.svg = sv.svg.replace(/^(<svg[^>]*?\s)width="[^"]*"/, `$1width="${cw}"`).replace(/^(<svg[^>]*?\s)height="[^"]*"/, `$1height="${ch}"`);
        sv.b = [R1(r.left + pl - OX), R1(r.top + pt - OY), cw, ch];
        const w = { k: 'F', n: sv.n + '-box', b: boxOf(r), kids: [sv], L: { d: 'H', g: 0, p: [R1(pt), R1(pr), R1(pb), R1(pl)], pa: 'C', ca: 'C' } };
        const fl = fills(cs, el); if (fl.length) w.fl = fl;
        const rad = radius(cs); if (rad !== undefined) w.r = rad;
        const ef = effects(cs); if (ef) w.ef = ef;
        const st = stroke(cs); if (st) w.st = st;
        if (cs.position === 'absolute' || cs.position === 'fixed') w.abs = 1;
        if (cs.position === 'fixed') w.fx = 1;
        return w;
      }
      return sv;
    }

    const j = { k: 'F', n: nameOf(el), b: boxOf(r), el };
    if (tag === 'button') j.tag = 'button';
    const cname = compOf(el); if (cname && !cutOff(j.b)) j.c = { nm: cname };
    const fl = fills(cs, el);
    const shown = tag === 'img' && el.currentSrc ? shownAs(el, cs, r) : null;
    if (tag === 'img' && el.currentSrc) fl.push({ t: 'I', ref: imgRef(el.currentSrc, r.width, r.height, shown), m: !shown && cs.objectFit === 'contain' ? 'FIT' : 'FILL' });
    if (tag === 'canvas') { try { fl.push({ t: 'I', ref: imgRef(el.toDataURL('image/png'), r.width, r.height), m: 'FILL' }); } catch (e) { } }
    if (tag === 'video') {
      const frame = videoFrame(el);
      fl.push(frame ? { t: 'I', ref: imgRef(frame, r.width, r.height), m: 'FILL' } : { t: 'S', c: [0, 0, 0, 1] });
    }
    if (fl.length) j.fl = fl;
    let st = stroke(cs);
    if (st && cs.borderCollapse === 'collapse' && cs.display === 'table-cell') st = collapsedStroke(el, st);
    if (st) j.st = st;
    const rad = radius(cs); if (rad !== undefined) j.r = rad;
    const ef = effects(cs); if (ef) j.ef = ef;
    // The filter is already drawn into the image, so don't add a layer blur on top
    if (j.ef && shown && shown.filter) { j.ef = j.ef.filter(e => e[0] !== 'LB'); if (!j.ef.length) delete j.ef; }
    insetLine(j);
    if (+cs.opacity < 1) j.op = R3(+cs.opacity);
    if (/hidden|clip|auto|scroll/.test(cs.overflow) && !(r.width === 0 || r.height === 0)) j.cl = 1;
    if (cs.position === 'absolute' || cs.position === 'fixed') j.abs = 1;
    if (cs.position === 'fixed') j.fx = 1;
    const z = cs.zIndex === 'auto' ? 0 : +cs.zIndex; if (z) j.z = z;
    // Positioned elements and those with transform, opacity or filter paint after normal-flow elements
    j.ord = ++domOrder;
    const context = cs.transform !== 'none' || +cs.opacity < 1 || cs.filter !== 'none' || cs.mixBlendMode !== 'normal' || cs.backdropFilter !== 'none' || cs.isolation === 'isolate';
    if (cs.position !== 'static' || context) j.pos = 1;
    if (context || (cs.position !== 'static' && cs.zIndex !== 'auto')) j.ctx = 1;
    if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') j.bm = cs.mixBlendMode;

    const kids = [];
    const pb = pseudo(el, '::before', cs, r); if (pb) kids.push(pb);
    if (tag === 'input' && /^(checkbox|radio)$/.test(el.type)) {
      if (cs.appearance !== 'none') kids.push(...nativeCheck(el, j, cs));
    } else if (['input', 'textarea'].includes(tag)) {
      // An input's value/placeholder isn't in a DOM text node, so build the text directly from the content box
      // range, color, file and the like draw their value as a control, not as text; a password shows one dot per character and must never leave the page as text
      const noText = tag === 'input' && /^(?:range|color|file|hidden|image)$/.test(el.type);
      const val = noText ? '' : el.type === 'password' && el.value ? '\u2022'.repeat(el.value.length) : el.value || el.placeholder || '';
      if (val) {
        const pcs = el.value ? cs : getComputedStyle(el, '::placeholder');
        const fsz = px(cs.fontSize) || 12, lh = cs.lineHeight === 'normal' ? R1(fsz * 1.4) : R1(px(cs.lineHeight));
        const cl = r.left + px(cs.paddingLeft) + px(cs.borderLeftWidth), cr = r.right - px(cs.paddingRight) - px(cs.borderRightWidth);
        const t = { k: 'T', n: val.slice(0, 40), s: tf(val, cs), f: fontOf(pcs), c: color(pcs.color) || [0, 0, 0, 1], lh,
          b: [R1(cl - OX), R1(r.top + (r.height - lh) / 2 - OY), R1(cr - cl), lh], fixed: 1, tr: 1,
          al: /center/.test(cs.textAlign) ? 'C' : /right|end/.test(cs.textAlign) ? 'R' : 'L' };
        kids.push(t);
      }
    } else {
      let buf = [];
      const flush = () => { if (buf.length) { const t = textJson(buf, el, cs); if (t) kids.push(t); buf = []; } };
      for (const ch of el.childNodes) {
        if (ch.nodeType === 3) { if (ch.textContent.trim() || buf.length) buf.push(ch); continue; }
        if (ch.nodeType !== 1) continue;
        if (isTextish(ch)) { buf.push(ch); continue; }
        flush();
        const k = node(ch, depth + 1); if (k) kids.push(k);
      }
      flush();
    }
    const pa = pseudo(el, '::after', cs, r); if (pa) kids.push(pa);

    // Decorative elements without children: small rotated boxes, CSS triangles
    if (!kids.length && (j.fl || []).every(f => f.t === 'S')) {
      // Rotations by multiples of 90° are left to rotWrap below; triangles become vectors right here, so carry the matrix along so flipped arrows point the right way
      const [sw, sh] = outerSize(cs), sm = matrixOf(cs, sw, sh);
      if (sw > 0 && sh > 0 && ((tilted(sm) && !tfOf(cs)) || mitred(cs, sw, sh))) {
        const shape = shapeJson(cs, sw, sh, sm);
        if (shape) {
          const s = { k: 'S', n: j.n, svg: shape.svg, b: j.b, ord: j.ord };
          ['pos', 'ctx', 'abs', 'fx', 'z', 'op'].forEach(p => { if (j[p]) s[p] = j[p]; });
          return s;
        }
      }
    }

    // collapse: plain element holding just one text → text node with element box
    const plain = !j.fl && !j.st && !j.ef && !j.cl && !j.op && !tfOf(cs);
    // Don't collapse when the text isn't vertically centered in the element (e.g. bottom-aligned flex-col); keep the frame so auto layout positions the text with padding
    const tCentered = kids.length === 1 && kids[0].k === 'T' && Math.abs((kids[0].b[1] + kids[0].b[3] / 2) - (j.b[1] + j.b[3] / 2)) <= 2;
    // Don't collapse a component root into text: c on text is the color, c on a component is the component info
    if (plain && !j.c && kids.length === 1 && kids[0].k === 'T' && !kids[0].abs && (tCentered || kids[0].ml)) {
      const t = kids[0];
      // When collapsing, keep the padding on the aligned side, otherwise the text sits flush against the frame
      t.tw = t.b[2];
      if (!t.ml) {
        const left = t.al === 'L' ? Math.max(0, t.b[0] - j.b[0]) : 0;
        const right = t.al === 'R' ? Math.max(0, j.b[0] + j.b[2] - t.b[0] - t.b[2]) : 0;
        t.b = [R1(j.b[0] + left), j.b[1], R1(j.b[2] - left - right), j.b[3]]; t.va = 'C';
      }
      t.fixed = 1;
      t.n = j.n; t.el = el; t.ord = j.ord; if (j.pos) t.pos = 1; if (j.ctx) t.ctx = 1; if (j.abs) t.abs = 1; if (j.fx) t.fx = 1; if (j.z) t.z = j.z;
      return t;
    }
    // collapse: plain wrapper with exactly one same-size child
    if (plain && !hasPad(cs) && kids.length === 1 && kids[0].k !== 'T') {
      const k = kids[0];
      if (Math.abs(k.b[2] - j.b[2]) < 1 && Math.abs(k.b[3] - j.b[3]) < 1 && Math.abs(k.b[0] - j.b[0]) < 1 && Math.abs(k.b[1] - j.b[1]) < 1 && !(j.c && k.c)) {
        k.ord = j.ord; if (j.pos) k.pos = 1; if (j.ctx) k.ctx = 1; if (j.abs) k.abs = 1; if (j.fx) k.fx = 1; if (j.c && !k.c) k.c = j.c; if (j.z && !k.z) k.z = j.z;
        return k;
      }
    }
    if (!kids.length && !j.fl && !j.st && !j.ef) return null;
    if (j.b[2] < 0.5 || j.b[3] < 0.5) { if (!kids.length) return null; }

    // Axis-aligned transforms (rotations by multiples of 90°, mirroring; e.g. a third card turned sideways, a mirrored card corner): convert this node's and its descendants' boxes back to untransformed coordinates, recompute the layout, and wrap it in a placeholder frame
    const M = tfOf(cs);
    let rotWrap = null;
    if (M) {
      const [a, b, c, d] = M, [x, y, w, h] = j.b, cx = x + w / 2, cy = y + h / 2, sw = Math.abs(b) > 0.5;
      const unrot = n => { const [dx, dy, dw, dh] = n.b; const ux = dx + dw / 2 - cx, uy = dy + dh / 2 - cy; const lx = a * ux + b * uy, ly = c * ux + d * uy; const nw = sw ? dh : dw, nh = sw ? dw : dh; n.b = [R1(cx + lx - nw / 2), R1(cy + ly - nh / 2), nw, nh]; (n.kids || []).forEach(unrot); };
      rotWrap = { k: 'F', n: j.n + ' (transformed)', b: [...j.b], noAL: 1 };
      kids.forEach(unrot);
      const nw = sw ? h : w, nh = sw ? w : h; j.b = [R1(cx - nw / 2), R1(cy - nh / 2), nw, nh];
      kids.forEach(relayout);
      j.tf = M;
    }
    // Scrolled content (children starting before the parent) keeps its actual position and becomes absolute
    // Zero-size children (wrappers holding only absolute content) take no space; left in the layout they would add an extra gap
    kids.forEach(k => { if (!k.abs && (k.b[0] < j.b[0] - 1 || k.b[1] < j.b[1] - 1 || k.b[2] < 0.5 || k.b[3] < 0.5)) k.abs = 1; });
    const flow = kids.filter(k => !k.abs);
    const abs = kids.filter(k => k.abs).sort((a, b) => (a.z || 0) - (b.z || 0));
    const ordered = layout(j, cs, flow) || flow;
    j.kids = paintOrder(ordered, abs);
    if (!j.kids.length) delete j.kids;
    if (rotWrap) {
      rotWrap.kids = [j]; j.abs = 1;
      ['abs', 'fx', 'z'].forEach(k => { if (j['_' + k] !== undefined) rotWrap[k] = j['_' + k]; });
      if (cs.position === 'absolute' || cs.position === 'fixed') { rotWrap.abs = 1; if (cs.position === 'fixed') rotWrap.fx = 1; }
      if (j.z) rotWrap.z = j.z;
      return rotWrap;
    }
    return j;
  }
  function tfOf(cs) {
    const m = (cs.transform || '').match(/^matrix\(([^)]+)\)/); if (!m) return null;
    const v = m[1].split(',').map(parseFloat).slice(0, 4).map(x => Math.abs(x) < 0.02 ? 0 : Math.abs(Math.abs(x) - 1) < 0.02 ? Math.sign(x) : x);
    if (!v.every(x => x === 0 || x === 1 || x === -1)) return null;
    if (v[0] === 1 && v[1] === 0 && v[2] === 0 && v[3] === 1) return null;
    return v;
  }
  // Recompute the layout after descendants' boxes change (removing previously inserted Spacer/Align)
  function relayout(d) {
    if (!d.kids) return;
    d.kids = d.kids.filter(k => k.n !== 'Spacer').flatMap(k => k.n === 'Align' && k.kids ? k.kids : [k]);
    d.kids.forEach(relayout);
    if (d.k !== 'F' || !d.el) return;
    delete d.L; delete d.noAL;
    const flow = d.kids.filter(k => !k.abs), abs = d.kids.filter(k => k.abs);
    const ordered = layout(d, getComputedStyle(d.el), flow) || flow;
    d.kids = paintOrder(ordered, abs);
  }

  // Order layers by the browser's paint order: negative z-index → normal-flow elements → positioned elements with z 0 or auto (in DOM order) → positive z-index.
  // Absolute children don't affect Auto Layout, so they can be inserted between flow children
  // Inside an element that doesn't create a stacking context, z-index competes with outer elements. Layers can't be split, so use the content covering the largest area (a small badge's high z-index doesn't count)
  const AREA = k => k.b ? k.b[2] * k.b[3] : 0;
  function dominantZ(k) {
    if (k.ctx || !k.kids) return k.z || 0;
    let best = k.z || 0, area = 0;
    (function walk(list) {
      for (const c of list) {
        if (c.z && AREA(c) > area) { best = c.z; area = AREA(c); }
        if (!c.ctx && c.kids) walk(c.kids);
      }
    })(k.kids);
    return area >= AREA(k) * 0.5 ? best : k.z || 0;
  }
  const paintKey = k => { const z = dominantZ(k); return k.pos || z > 0 ? z : -0.5; };
  function paintOrder(flow, abs) {
    // In containers that couldn't become Auto Layout, flow children are already absolute too, so all of them can be reordered
    const out = flow.filter(k => !k.abs);
    const order = [...flow.filter(k => k.abs), ...abs].sort((x, y) => paintKey(x) - paintKey(y) || (x.ord || 0) - (y.ord || 0));
    for (const a of order) {
      const key = paintKey(a);
      const i = out.findIndex(k => paintKey(k) > key || (paintKey(k) === key && (k.ord || 0) > (a.ord || 0)));
      if (i < 0) out.push(a); else out.splice(i, 0, a);
    }
    return out;
  }
  // With a negative z-index and no stacking context on the parent, the browser paints the element beneath the parent's background. A Figma child can't go below its parent's fill, so lift it to the bottom of the nearest stacking context
  function liftBehind(j) {
    if (!j.kids) return [];
    const up = [];
    j.kids = j.kids.filter(k => {
      up.push(...liftBehind(k));
      if (!(k.z < 0) || !k.abs || j.ctx) return true;
      up.push(k); return false;
    });
    if (!j.ctx && !j.cl) return up;
    // Can't lift out of a clipping container; if the container has a background, the element is fully hidden in the browser too
    if (j.ctx || !j.fl) j.kids.unshift(...up);
    return [];
  }

  function finalize(j, parent) {
    // fixed-position nodes are hoisted to the root later; mark repeated sibling structures as components
    if (j.kids) {
      j.kids.forEach(k => finalize(k, j));
      const groups = new Map();
      j.kids.forEach(k => { if (k.k === 'F' && !k.c && k.kids && !k.sp && !cutOff(k.b) && !holdsComp(k)) { const key = k.n + '|' + sig(k); groups.set(key, (groups.get(key) || []).concat([k])); } });
      // Children are already finalized, so add sig while marking them here, or al-build won't recognize them as components
      for (const [key, arr] of groups) if (arr.length >= 2) arr.forEach(k => { k.c = { nm: (parent && parent.c ? parent.c.nm : (j.c ? j.c.nm : 'Item')) + '/' + k.n, rep: 1 }; k.sig = sig(k); });
    }
    if (j.el) {
      if (j.c && !j.c.rep) { const cls = (j.el.getAttribute('class') || '').trim(); if (cls) j.c.cls = cls; }
      if (j.c) { const st = stateOf(j.el); if (st.length) j.c.st = st; }
      delete j.el;
    }
    j.sig = j.c ? sig(j) + (j.c.st ? '|' + j.c.st.join(' ') : '') : undefined;
    if (!j.sig) delete j.sig;
  }
  function hoistFixed(root) {
    const out = [];
    (function walk(j) { if (!j.kids) return; j.kids = j.kids.filter(k => { if (k.fx && j !== root) { out.push(k); return false; } walk(k); return true; }); })(root);
    out.forEach(k => { k.abs = 1; });
    root.kids = (root.kids || []).concat(out.sort((a, b) => (a.z || 0) - (b.z || 0)));
  }

  const IMG_MAX_SIDE = 1600, IMG_RETINA = 2;
  function encodeCanvas(c, ctx) {
    const SMALL_PNG = 30000; // small images are sharper as PNG and not worth comparing with JPEG
    const png = c.toDataURL('image/png');
    if (png.length <= SMALL_PNG) return png;
    // JPEG has no alpha channel, so transparent images would get a black background; keep PNG
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return png;
    const jpg = c.toDataURL('image/jpeg', 0.85);
    return jpg.length < png.length ? jpg : png;
  }
  // Figma images only support centered crop-to-fill (FILL) and proportional fit (FIT). Other display modes are redrawn as the browser shows them:
  // SVG in a stretched box (scaled proportionally per preserveAspectRatio), distorted stretched bitmaps, off-center object-position, none/scale-down,
  // and CSS filter (a drop-shadow glow hugs the shape, while Figma shadows only follow the rectangular frame)
  function shownAs(el, cs, r) {
    const svg = /\.svg([?#]|$)/i.test(el.currentSrc) || el.currentSrc.startsWith('data:image/svg');
    const iw = el.naturalWidth, ih = el.naturalHeight, fit = cs.objectFit, ratio = r.width / r.height;
    const stretched = fit === 'fill' && !svg && iw && ih && Math.abs(iw / ih - ratio) > ratio * 0.02;
    const offCenter = /cover|contain/.test(fit) && cs.objectPosition !== '50% 50%';
    const filtered = !!cs.filter && cs.filter !== 'none';
    if (!(svg && fit === 'fill') && !stretched && !offCenter && !/none|scale-down/.test(fit) && !filtered) return null;
    if (!(r.width > 0 && r.height > 0)) return null;
    return { el, w: r.width, h: r.height, fit: svg && fit === 'fill' ? 'svg' : fit, pos: cs.objectPosition, filter: filtered ? cs.filter : '' };
  }
  // Draw the already-loaded <img> directly instead of refetching. Filter lengths are in canvas pixels, so scale them by the same factor
  function drawShown(a) {
    const s = Math.min(IMG_RETINA, IMG_MAX_SIDE / Math.max(a.w, a.h));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(a.w * s)); c.height = Math.max(1, Math.round(a.h * s));
    const ctx = c.getContext('2d');
    if (a.filter) ctx.filter = a.filter.replace(/(-?[\d.]+)px/g, (_, v) => (+v * s) + 'px');
    const iw = a.el.naturalWidth, ih = a.el.naturalHeight;
    let dw = a.w, dh = a.h;
    // SVG in a stretched box is scaled proportionally and centered per the default xMidYMid meet; SVG without an intrinsic size fills the box
    const fit = a.fit === 'svg' ? (iw && ih ? 'contain' : 'fill') : a.fit;
    if (iw && ih && /contain|cover|scale-down/.test(fit)) {
      let k = fit === 'cover' ? Math.max(a.w / iw, a.h / ih) : Math.min(a.w / iw, a.h / ih);
      if (fit === 'scale-down') k = Math.min(1, k);
      dw = iw * k; dh = ih * k;
    } else if (iw && ih && fit === 'none') { dw = iw; dh = ih; }
    const [ppx, ppy = '50%'] = a.fit === 'svg' ? ['50%', '50%'] : (a.pos || '50% 50%').split(' ');
    const at = (v, free) => /%$/.test(v) ? free * parseFloat(v) / 100 : px(v);
    ctx.drawImage(a.el, at(ppx, a.w - dw) * s, at(ppy, a.h - dh) * s, dw * s, dh * s);
    return encodeCanvas(c, ctx);
  }

  async function toDataURL(url, box) {
    const MAX_CHARS = 600000;
    // Inline data URLs and canvases also need downscaling when too large; use them as-is only when small
    if ((url.startsWith('data:image/png') || url.startsWith('data:image/jpeg')) && url.length <= MAX_CHARS) return url;
    // Image.decode() doesn't resolve in a hidden tab, so use fetch + createImageBitmap
    const blob = await (await fetch(url)).blob();
    let img;
    if (blob.type.includes('svg')) return 'svg:' + (await blob.text());
    img = await createImageBitmap(blob);
    let w = img.width || 300, h = img.height || 150;
    // Use the larger ratio so object-fit: cover crops stay sharp; 2× the display size is enough, and downscaling saves a lot of data and Figma memory
    const fit = box && box[0] && box[1] ? Math.max(box[0] * IMG_RETINA / w, box[1] * IMG_RETINA / h) : 1;
    const k = Math.min(1, fit, IMG_MAX_SIDE / Math.max(w, h)); w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
    return encodeCanvas(c, ctx);
  }


  // ---------- stabilization helpers before screenshots ----------
  // Clear every timer on the page (countdowns and polling would overwrite the state that was set up)
  window.__alFreeze = () => { const top = setTimeout(() => { }, 0); for (let i = 0; i <= top; i++) { clearTimeout(i); clearInterval(i); } window.requestAnimationFrame = () => 0; return top; };
  const MAX_ENTRANCE_MS = 1500; // animations longer than this aren't entrance animations
  // Finish entrance animations; reset the marquees/carousels listed in loopSelectors to their start; hide dev tool overlays
  window.__alSettle = (loopSelectors = []) => {
    let st = document.getElementById('__alSettle');
    if (!st) { st = document.createElement('style'); st.id = '__alSettle'; document.head.appendChild(st); }
    st.textContent = loopSelectors.map(s => `${s}{animation:none !important;transform:none !important}`).join('\n') + '\n*,*::before,*::after{transition:none !important;animation-play-state:paused !important}\n#__vue-devtools-container__,[class*=vue-devtools],#react-devtools,nextjs-portal{display:none !important}';
    // Short ones are entrance animations and must run to the end; long or infinite ones (marquees) often restart after ending, so pause them where they are. The style above also pauses animations that start later
    document.getAnimations().forEach(a => {
      try {
        const t = a.effect && a.effect.getComputedTiming();
        if (t && t.endTime <= MAX_ENTRANCE_MS) a.finish(); else a.pause();
      } catch (e) { }
    });
  };
  // Swiper autoplay stops on a random slide, so every capture differs and the baseline jumps with it; carousels that are autoplaying go back to the first slide.
  // Leave non-autoplaying ones alone: card.run may have switched to that slide on purpose. Slide changes in loop mode use requestAnimationFrame, so run this before __alFreeze
  window.__alResetCarousels = () => {
    let n = 0;
    document.querySelectorAll('.swiper, .swiper-container').forEach(el => {
      const s = el.swiper; if (!s || !(s.autoplay && s.autoplay.running)) return;
      try { if (s.autoplay && s.autoplay.stop) s.autoplay.stop(); if (s.params && s.params.loop && s.slideToLoop) s.slideToLoop(0, 0, false); else s.slideTo(0, 0, false); n++; } catch (e) { }
    });
    return n;
  };

  // opts.sprites: sprite id prefix → icon library name prefix (extract in presets/*.json)
  window.__alExtract = async (name, opts = {}) => {
    IMG = new Map(); IMG_BOX = new Map(); IMG_AS = new Map(); IMG_AS_KEY = new Map(); imgN = 0; domOrder = 0; CFG = opts;
    FW_NAME = Object.keys(ADAPTERS).find(k => ADAPTERS[k].detect()) || null;
    FW = FW_NAME ? ADAPTERS[FW_NAME] : NO_FRAMEWORK;
    VW = innerWidth; VH = innerHeight; OX = 0; OY = 0;
    const html = document.documentElement, body = document.body;
    const root = { k: 'F', n: name, b: [0, 0, VW, VH], cl: 1, ctx: 1, kids: [] };
    const bg = color(getComputedStyle(body).backgroundColor) || color(getComputedStyle(html).backgroundColor) || [1, 1, 1, 1];
    root.fl = [{ t: 'S', c: bg }];
    const top = [];
    for (const ch of body.children) { const k = node(ch, 1); if (k) top.push(k); }
    // When the page is scrolled, content y is negative; Auto Layout padding can't be negative, so the whole block would be pushed off screen
    top.forEach(k => { if (k.b[1] < -1) k.abs = 1; });
    const flow = top.filter(k => !k.abs), abs = top.filter(k => k.abs);
    const ordered = layout(root, getComputedStyle(body), flow) || flow;
    root.kids = paintOrder(ordered, abs);
    hoistFixed(root);
    liftBehind(root);
    finalize(root, null);
    const images = {};
    for (const [url, ref] of IMG) { try { images[ref] = await toDataURL(url, IMG_BOX.get(url)); } catch (e) { images[ref] = /^data:image\/(png|jpeg)/.test(url) ? url : null; } }
    // A cross-origin image without CORS leaves the canvas unreadable, so fall back to the original image
    for (const [ref, a] of IMG_AS) { try { images[ref] = drawShown(a); } catch (e) { try { images[ref] = await toDataURL(a.url, [a.w, a.h]); } catch (e2) { images[ref] = null; } } }
    let count = 0; (function c(j) { count++; (j.kids || []).forEach(c); })(root);
    return { name, w: VW, h: VH, root, images, count, framework: FW_NAME };
  };
})();
