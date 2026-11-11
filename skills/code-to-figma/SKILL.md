---
name: code-to-figma
description: Rebuild screens from a running web app as native, editable Figma layers (Auto Layout, components, instances) and diff them against browser screenshots — not a screenshot import or a Code layer. Use when the user asks to "turn this page into Figma", "code to Figma", "push this screen to Figma" or "rebuild the UI in Figma". 把 Web 專案實際跑出來的畫面重建成 Figma 原生圖層：造狀態、抽 DOM 版面樹，建 Auto Layout 和 component／instance，再跟瀏覽器截圖比對。單一畫面或一批畫面都能用，不需要做情境稿。Use when 使用者要「code to figma」「把這頁轉成 Figma」「從程式重建畫面」「push 畫面到 Figma」，或 figma-state-board 走路線 B。產出是可編輯圖層，不是 Code layer 或截圖。
---

# Code to Figma

Run the project, extract the DOM into a layout tree in the browser, then rebuild it in Figma as editable Auto Layout and components.

For web front ends. Component boundaries have adapters for Vue 3 and React (React 18 and 19 tested, including Next.js App Router Server Components; 16 and 17 have the same fiber structure but are untested). Other frameworks get repeated-node detection only. Native apps and screens drawn entirely in Canvas/WebGL are out of scope; use the design file or wireframes instead.

| File | Contents |
|---|---|
| [web-capture.md](references/web-capture.md) | The full process; read before starting |
| [screen-structure.md](references/screen-structure.md) | Structure rules the output must meet |
| [scale-guard.md](references/scale-guard.md) | Thresholds and stop conditions for the MCP call budget and file memory; read before starting |
| [troubleshooting.md](references/troubleshooting.md) | Pitfall lookup table; check it when results are wrong |
| [examples/](examples/) | Capture config templates for four kinds of project: built-in mock, Playwright fixture, Nuxt dev, intercepting the backend API |
| [evals/trials.json](evals/trials.json) | Regression cases and baselines; rerun all of them after changing the tools |

## Steps

1. **Confirm the inputs**: the project and how to run it, which screens, each screen's viewport and height type, the target Figma file, and the design system to bind. The user decides the topic and scope; do not pick them yourself. Once you have the Figma link, run `create_session` plus one read-only `use_figma` to confirm the account MCP is signed in with can read and write the file (if it can't open the file, use `whoami` to explain which account it is and who to share the file with). Then estimate how many calls this job needs per scale-guard.md "MCP call budget"; if the budget is not enough, say so first
2. **Start the project, write the config, capture**: run `al-capture.cjs`, following web-capture.md
3. **Build one representative screen per device first**, compare it with the browser screenshot, and batch only once it matches
4. **Compare every screen after the batch**: run `al-diff.py`; also screenshot and check the Components section
5. **Audit**: run `audit-screens.js`

Done when: every screen has a rebuild, each screen's root frame width equals the viewport, and the representative screen of each device has a reference screenshot layer; `issues` is empty, or every entry is reported with its cause; the Components section has been checked in a screenshot.

## Hard rules for writing to Figma

A Figma file's memory can spike past the limit in an instant, even when static usage is low, and a file that blows up cannot always be recovered (scale-guard.md "Incident"). Follow these on every project:

1. **Before writing to an existing file, ask the user to save a version**, including before deleting or rebuilding screens you built earlier. Do not start until the user replies that it is saved. When the target page has nothing on it except what you built yourself (new file, blank page), you may skip this; say so in the report
2. **Send one screen at a time**: upload this screen's images and data SVG, build it, confirm the `ALDATA-` and `ALIMG-` temporary frames are deleted, then do the next. Do not upload the whole batch first
3. **If the user reports a red warning or recovery mode, stop immediately**. Do not run even a read-only `use_figma` until the user confirms the file is fine
4. **Stop when the call limit is reached**: if any Figma tool returns "reached the Figma MCP tool call limit", do not retry and do not switch tools to get around it. List the screens completed and the node IDs of temporary frames still on the canvas

## Known limits

- Component boundaries have adapters for Vue 3 and React; both require dev mode (production builds have no component names, and `stats.json` will warn). Svelte, Angular and other frameworks get repeated-node detection only; to support one, add an entry to `ADAPTERS` in `al-extract.js`
- React component naming rules: a DOM node counts as a boundary only when it is the component's only root node, and the name is taken from the outermost component. Components that only pass children (Provider, Tooltip, ErrorBoundary), styled-components/emotion style components, and router and framework internal components do not count. Next.js Server Component names require a React 19 dev build (Next 15 and later); with React 18 only client components are captured
- React component boundaries have been verified through capture and packing with unit tests and two demo projects (Vite + Radix + Tailwind 4, Next.js App Router), but there is no baseline for rebuilding them in Figma yet
- Icons that use an SVG as `mask-image` and have no children (e.g. frappe-ui, UnoCSS `lucide-*` classes) are converted to vectors and colored with the background color. Other `mask-image` uses (gradient fades, bitmap masks) and `clip-path` have no equivalent; faded edges and angled cuts become full shapes
- Colors: `rgb()` is supported, plus the formats Chrome may return, such as `oklch()`, `color(srgb …)`, `lab()` and `hsl()`; the latter are converted to sRGB through a canvas, and each channel may be off by 1 (8-bit rounding)
- The Plugin API cannot change the width of a frame inside an instance. A sole child that stretches to fill its parent frame is changed to Fill, children that stretch to fill the parent are adjusted through padding, and Auto Layout frames that are Hug in the data are changed to Hug; in all other cases the size follows the main component, and `log.boxes` lists them
- Small elements with nested z-index may end up covered; the layer tree cannot move a single child out of its parent
- System fonts (`ui-sans-serif`) are replaced with Inter; character widths differ slightly
- `font-variant-numeric: tabular-nums` (tabular figures) cannot be turned on in Figma: the Plugin API's `openTypeFeatures` is read-only. Dates, times and amounts come out narrower than in the browser, and the text after them shifts 5–8px; `log.drift` lists these
- Rotation and CSS triangles are handled only for elements without children (check marks, tab triangles, small squares), which are converted to vectors; rotated containers with children are laid out by their bounding box, and their content is not rotated

## Report

- Structure: Auto Layout container ratio, component/variant count; which areas are absolute (overlays, content mid-scroll)
- Comparison results: text drift, the screens with the highest diff ratio, and known spots that cannot be reproduced. Read the diff ratio in context: gradients or bitmap `mask-image` push the ratio up, so explain the cause; when `stats.json` warns that icons are empty, allow the icon source and recapture first. When a whole screen has almost no color, first check whether the `stat` returned by `__alBuild` picked up any colors (troubleshooting.md)
- Reference screenshots go only on representative screens; the rest stay in the local output folder
- With a library bound, write this part per the figma-library-binding "Report" section; without a library, colors and font sizes are hard-coded values
- Screens are reproduced from mock data; which areas were filled in with live screenshots, and which copy was changed in the mocks
- Which font was substituted when Figma doesn't have the product font
- Scale: one line in the scale-guard.md format
