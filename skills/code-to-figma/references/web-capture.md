# Rebuilding screens from code

Run the project, push the screen into each state with fixed mock data, extract the DOM into a **layout tree** (direction, gap, padding, alignment, component boundaries), then rebuild it in Figma with Auto Layout frames and components/instances.

## Contents

- Tools
- Process: start the project, write the config, capture, send to Figma, representative screen, batch comparison, audit
- Live-product screenshots

## Tools

| Tool | Runs in | What it does |
|---|---|---|
| [al-capture.cjs](../scripts/al-capture.cjs) | Local Node | Uses Playwright to set up states, extract the layout tree and take reference screenshots |
| [al-extract.js](../scripts/al-extract.js) | In the page, injected by al-capture | Extracts the DOM into a layout tree and images |
| [al-pack.py](../scripts/al-pack.py) | Local Python | Packs the layout tree and build code into a "data SVG" and saves bitmaps as separate image files; both go into Figma through `upload_assets`. `use_figma` code has a length limit, so data goes through this channel |
| [al-upload.py](../scripts/al-upload.py) | Local Python | Uploads the images and data SVG, in order, to the URLs `upload_assets` returns |
| [al-build.js](../scripts/al-build.js) | eval'd inside `use_figma` | Builds screens, builds/reuses components, places them in a section or card |
| [cleanup-components.js](../scripts/cleanup-components.js) | `use_figma` | Lists and deletes unused old main components, including ones used only by other old components; by default it only lists |
| [al-diff.py](../scripts/al-diff.py) | Local Python, needs Pillow | Compares against browser screenshots and lists the screens with the largest differences |
| [audit-screens.js](../scripts/audit-screens.js) | `use_figma` | Structure, text drift, binding ratio, scale |

When the environment is missing packages, do not change the project's dependencies; install them in the working directory:

- **Playwright**: use the project's if it has one (point the config's `project` at the project). Otherwise run `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i -D playwright` in the working directory and point `project` at the working directory; al-capture uses the local Chrome first (`channel: 'chrome'`), so no browser download is needed
- **Pillow**: `pip install pillow`; to leave the system Python alone, use `uv run --with pillow python al-diff.py <shot> <figma>`

## Process

### 1. Start the project

**Always run dev mode.** Vue and React production builds have no component names, so extraction falls back to repeated-node detection only and Components gets messy; `framework` in `stats.json` will be null, with the warning "No component info". If the project's e2e runs a production bundle, use its dev mode instead and keep using the same fixtures.

| Project | Dev mode |
|---|---|
| Vite (Vue, React) | `npm run dev` |
| Nuxt | `nuxi dev` |
| Next.js | `next dev`. App Router Server Component names require React 19 (Next 15 and later); with React 18 only client components are captured, and the rest relies on repeated-node detection |
| Create React App | `npm start` |

Mock sources, in this order:

1. The project's existing e2e fixtures or mock upstream, intercepted with `context.route()` in the config's `setup`
2. The project's built-in MSW or mock server, turned on with the matching environment variable
3. If neither exists, intercept the backend API: first fetch a response from the real backend (local or test environment) and save it as JSON as the base, copy it for each card and change only what differs for that state, and return it with `context.route()` in `setup`. For backends that need login or use CSRF (Frappe, Django, Rails, etc.) this is the least effort, since you don't even have to run the login flow. Template in [examples/api-intercept/](../examples/api-intercept/)
4. Only if none of the above works, add to the mock layer (MSW handlers, mock API responses)

Create error states with interception too: return the matching HTTP status code and the backend's error format; for "Loading", never respond to the request. Error responses must include the message the backend really sends, or the front-end framework may fill in a default string such as "Internal Server Error" and draw a screen the product never actually shows.

**Do not add screenshot-only branches to production components.** Avoid changing the repo if you can; if you must, revert afterward and report what you changed.

When copy is missing (the screen shows translation keys directly), add it to the mock translation data; find the copy in the design file or rule documents, and if you can't find it, leave the key and list it in the report. Fix times, random numbers and countdowns to constant values.

Start the dev server with the browser tool's dev server config (Claude's `.claude/launch.json` + `preview_start`), not as a background Bash process.

### 2. Write the config

Put the config in the working directory, not in the project repo:

```js
// capture.config.cjs
module.exports = {
  project: '/path/to/repo',            // Playwright is looked up from here
  url: 'http://localhost:5173',
  viewport: { width: 1280, height: 800 },
  out: './capture',                    // not in scratchpad; it gets wiped between sessions
  preset: 'my-ds',                     // file name in figma-library-binding/presets/; omit if none
  fullPage: false,                     // default height; each card can override it
  settle: ['.marquee_inner'],          // selectors of infinite loop animations; they are stopped at their start
  hide: ['.dev-toolbar'],              // dev panels and toolbars that only exist in mock mode
  setup: async (context, id, card) => {}, // before each screen: intercept APIs, set cookies. id is the card ID
  ready: async (page, id, card) => { await page.waitForSelector('.card'); }, // after each goto
  cards: {
    L01: { url: '/home' },
    L02: { url: '/home', fullPage: true, run: async page => { await page.getByRole('tab', { name: 'Deals' }).click(); } },
    M01: { url: '/home', viewport: { width: 360, height: 800 } },
    E01: { url: '/home', setup: async context => { await context.route('**/api/list', r => r.fulfill({ json: [] })); } }, // this card's own interception
  },
};
```

The shared `setup` runs first, then the card's own `setup`. Playwright matches routes registered later first, so a card can override the shared interception. When each card intercepts its own copy of the API response, the least effort is a shared `setup` that looks up a table by `id` (see [examples/api-intercept/](../examples/api-intercept/)).

Order for setting up states: route or query string → clicks → change the store (e.g. for Pinia, `app.config.globalProperties.$pinia._s.get('<StoreId>')`) → change component internal state. Use real interactions whenever you can; they are less likely to produce states the product can't reach.

**Pick one of two screen heights**, and write it in the screen list:

| Type | Height | Use for |
|---|---|---|
| viewport | One viewport | States with fixed elements (bottom cart bar, modals, toasts), so their positions come out right |
| Full page (`fullPage: true`) | To the end of the content, max 8000px | Screens where the whole page's content must be visible |

Full-page mode enlarges the viewport to the content height before extracting, and inner scroll containers are included. Layouts that use 100vh may get unstable heights; `warnings` in `stats.json` will flag this.

Templates are in [examples/](../examples/). When the project's mocks are Playwright fixtures (`mockBackend` and the like), the config can't use the fixtures; instead, write a spec and a config in the working directory and call `capture()` directly, without touching the project repo:

```ts
// capture.spec.ts: testDir points to the working directory, baseURL to the dev server; import the project's fixtures by absolute path
import { test } from '/path/to/repo/e2e/fixtures/mockBackend';
const { capture } = require('/path/to/al-capture.cjs');
const opts = { out: './capture', preset: 'my-ds' };

test('C01', async ({ page, mockBackend }) => {
  mockBackend.use(someScenario);
  await openSomething(page);
  await capture(page, 'C01', opts);
});
```

```bash
cd /path/to/repo && node_modules/.bin/playwright test --config /path/to/work/pw.config.ts
```

The project's e2e pages and scenarios can all be reused; this is usually much shorter than writing your own state setup steps.

- ESM projects (`"type": "module"` in `package.json`): put a package.json with `{ "type": "module" }` in the working directory, import Playwright by absolute path from `.../@playwright/test/index.mjs`, and load `capture` with `createRequire(import.meta.url)`
- Projects whose e2e runs a production build (Nuxt, etc.): start the mock upstream in the spec's `beforeAll`, then spawn the dev server pointed at it, with the same environment variables as the e2e setup
- When the e2e blocks all external domains, icons, fonts and images hosted on CDNs fail to load; the captured icons are empty, and in Figma they are missing or turn black. Allow the domains of these static assets and keep blocking the APIs; if `warnings` in `stats.json` has "icons are empty", something is still blocked

### 3. Capture

```bash
node al-capture.cjs capture.config.cjs           # all
node al-capture.cjs capture.config.cjs L01 L02   # only the listed cards
```

Outputs `json/<ID>.json`, `shot/<ID>.jpg` and `stats.json`. Check `stats.json`:

- `warnings`: "No component info" means a production build was running; "icons are empty" means the icon source was blocked or had not loaded yet
- `missingImages`: images that were not extracted
- `nodes`: check this first when it differs a lot from similar screens

### 4. Send to Figma

**Send one screen at a time**: upload this screen's images and data, build it, delete the temporary frames, then do the next. Do not upload the whole batch first: memory spikes the moment temporary frames are imported, and putting a whole batch on the canvas once blew up a file (scale-guard.md "Incident"). `__alBuild` stops if it sees another screen's temporary frames on the page. When the target is an existing file, ask the user to save a version before starting.

1. `python3 al-pack.py <ID> <json folder> <output folder> [preset]` → `ALDATA-<ID>.svg`; bitmaps are saved separately as `ALIMG-<ID>-<image ID>.png|jpg`, and the images to upload are listed at the end. With a design system, pass the preset (e.g. `my-ds`) and `__alBuild` binds automatically. If the data SVG exceeds 2MB, it stops; split the screen into several viewport-height screens and capture again
2. Upload this screen's images and data SVG: call `upload_assets` with `currentPageId` (the page the screen goes on) and `count` equal to the number of images plus 1 (max 60 per call; above that, split into several calls, with the data SVG in the last batch). Write the submitUrls you get into a file, one per line, and upload them in order with `al-upload.py`, images first and the data SVG last:
   ```bash
   python3 al-upload.py urls.txt out/ALIMG-L01-* out/ALDATA-L01.svg
   ```
   The file name becomes the layer name, and `__alBuild` uses it to match images; do not rename files. The node ID printed on the `ALDATA-` line is the data frame (`placedOnNodeId`)
3. For a screen without images, upload only the data SVG, with `count: 1`
4. In `use_figma`, read the data back and run the build. The build takes the images from the image frames and deletes those frames when done; the data frame is deleted by the code below. First create the section that will hold the screens (for a state board, use the board's section and pass the card's `slotId`). For the first screen, don't pass `compSectionId`: the build creates "<section name> · Components" to the right of the section. Note the returned `sectionId` and pass it for every screen after that:
   ```js
   const holder = await figma.getNodeByIdAsync('<placedOnNodeId>');
   const texts = holder.findAll(n => n.type === 'TEXT');
   const pick = p => texts.filter(t => /^\w\d{3}$/.test(t.name) && t.name.startsWith(p)).sort((a, b) => a.name < b.name ? -1 : 1).map(t => t.characters).join('');
   const c = pick('c'), d = pick('d'); if (!c || !d) throw new Error('Data SVG text is empty; upload it again');
   const code = atob(c), json = atob(d); holder.remove();
   eval(code + '\n;globalThis.__alBuild = __alBuild;');
   return await globalThis.__alBuild(JSON.parse(json), { boardId: '<section id>', slotId: '<state board only>', compSectionId: '<components section id>', withRef: <true only for representative screens> });
   ```
   It returns `refId` (the hidden reference screenshot layer; null when `withRef` is not passed) and how many frames/components/instances were built. If `log.warn` has "uploaded image not found", an image was not uploaded or was renamed

   To rebuild an existing screen, pass `replace: true`. If the screen was changed after it was last built, this throws an error; pass `force: true` only after asking the user, and never overwrite a designer's changes without asking. After a build, it recomputes the fingerprints of screens that were unchanged before the build, so when screens you build later update shared main components, the earlier screens are not flagged as "changed". Screens built with tools older than 0.4.0 may still be blocked once on their first rebuild; mention this when you ask. On error the whole build rolls back, and this screen's temporary frames stay on the page: if the user agrees, rerun with `force`; if not, delete the temporary frames
5. Reference screenshot for the representative screen: call `upload_assets` with `nodeIds: [refId]` and upload `<ID>.jpg` with curl (`type=image/jpeg`); the image fills that layer
6. For screens whose width differs from the card width (e.g. landscape screens), scale proportionally with `rescale(W / width)`; do not just change the width
7. Confirm that no frames starting with `ALDATA-` or `ALIMG-` are left on the page before doing the next screen. With more than 100 screens or many images, ask the user to report memory after each group, per scale-guard.md

### 5. One representative screen per device first

After building the representative screen, screenshot it side by side with the reference screenshot and compare: batch the remaining cards only once text wrapping, spacing, icons, font weights and alignment are all right. Later cards reuse the components already built, so the number of new frames drops noticeably; this is normal.

### 6. Compare every card after the batch

A thumbnail of the whole group can't tell you whether the screens are right; compare them one by one.

1. Check `log.drift` returned by `__alBuild`: after building, al-build.js compares each text run with its browser coordinates and lists those off by more than 2px here. If it is not empty, investigate; do not dismiss it as font error
2. Use `get_screenshot` to capture each screen and save it as `<ID>.png`, then run `python3 al-diff.py <shot folder> <figma screenshot folder>`. The few screens with the largest differences are also saved as `<ID>-diff<n>.png` (browser on top, Figma below); start from the segment with the largest difference. Text takes up very few pixels, so the ratio is insensitive to text drift; zoom in and look, don't just read the numbers
3. Confirm the cause of a difference in the source code, by checking which CSS that part uses, before writing it in the report; do not guess from thumbnails (the scaling of an SVG background image was once misdiagnosed as `mask-image`)
4. When differences cluster in the same row or area, it is usually a tool problem: fix the tool and rebuild; do not hand-fix screens one by one
5. Some differences change on every recapture: mock random values generated in a service worker (MSW) are not fixed, because `SEED_RANDOM` fixes only the page's `Math.random`, so marquees and amounts change every time; scroll positions after clicks may also be off by a few px. Recapture once and compare; areas that change count as noise, and explain this in the report

Take a separate screenshot of the Components section. Screens are clipped by their root layer but main components are not, so broken layout only shows up there.

### 7. Audit

Run audit-screens.js with `SECTION_ID` replaced by the section that holds the screens. `issues` must be empty, or every entry must be reported with its cause. `unusedComponents` are main components with no instances, which is common after rebuilds. Use cleanup-components.js to list the full set for the user; it will also include components used only by these old components. Once the user agrees and has saved a version, paste the list's `ids` into `APPROVED_IDS` and run it again; it deletes only those. Right after the deletion, Figma may still count instances inside deleted components as in use; list again a few minutes later to confirm.

## Live-product screenshots (screens mocks can't produce)

When mocks can't draw live video streams, third-party embedded content, or data that exists only in production, **you may use this only if the user provides the live product URL**:

- Only view and take screenshots; do not do anything on the live product that changes account state (placing orders, submitting forms, changing settings)
- If the URL carries a login token, do not write the URL into any file, report, or Figma
- Crop captured video frames to the size of that area and use them as the area's image fill, with a layer name that notes "Live screenshot (date)"; the rest of the UI is still editable layers rebuilt from mocks
- When live and mock data differ (names, counts, list contents), state in the report which areas come from the live product
