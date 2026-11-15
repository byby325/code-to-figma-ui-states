# Changelog

## 0.8.0

### Renamed to code-to-figma-ui-states

- The plugin, marketplace and repository are now `code-to-figma-ui-states`: the name says where it starts (your code), where it ends (Figma) and what it covers (UI states). The four skills keep their names, so `figma-state-board` is still the skill that builds the board. Install with `/plugin install code-to-figma-ui-states@code-to-figma-ui-states`

### State boards on a small call budget

- New Route C for `figma-state-board`: each Prototype card shows a browser screenshot of the running app instead of rebuilt layers. The whole board takes about 3 counted Figma MCP calls however many cards it has, so it fits the 20 calls a month of Starter plans and View/Collab seats. The gap check, wireframes and audit are unchanged, and any card can be rebuilt as editable layers later
- `al-capture.cjs` takes `shotOnly: true`: screenshots only, at 2x, with no layout tree. A screen whose 2x image would pass Figma's 4096px image limit is saved at 1x, and one longer than 4096px gets a warning
- New `screenshot-slots.js`: after the screenshots are uploaded, it makes each one its card's fill, sizes the slot to the image, and reports the cards that have no screenshot. It finds screenshots uploaded onto the slots, inside them, or left on the page as `<card ID>.jpg`
- `audit.js` returns `screens`: how many Prototype cards hold layers, how many hold a screenshot, and which are still empty
- `scale-guard.md` has the call estimate for Route C and offers it first when the budget is short
- Verified in a real Figma file (Starter plan, Full seat): a React orders page with four states and two gap cards took 2 counted calls. This was also the first real run of `board-skeleton.js` and of an English board
- `scale-guard.md` records two measurements: the call budget is counted per plan (team), and `await section.screenshot()` inside the audit call replaces a separate `get_screenshot`

### React rebuild verified in Figma

- The Vite + React 19 + Radix + Tailwind 4 demo (four states of an order list) is rebuilt in Figma: 0.02–0.12% different from the browser, no text or box drift, 13 components with variants. The baseline is in `evals/trials.json`. The Next.js App Router case is still verified through capture only
- The screens were built into slots that first held browser screenshots, so upgrading a Route C card to editable layers is verified too. `al-build.js` now drops "(browser screenshot)" from the slot's layer name when it does
- `audit-screens.js` no longer counts an icon's frame (only vector shapes inside) as a container without Auto Layout; a screen with a few icons was flagged for a low Auto Layout ratio

### Demo app and README pictures

- New `examples/orders-demo`: the React orders page used for the runs above, with a mock API in the dev server (`?state=empty|loading|error`), a capture config for its four states, and prompts to try the plugin on it
- The READMEs show the board built from the demo and one of its gap cards

### Tests

- `board-skeleton.test.cjs`: 16 cases (was 13), adding empty slots in the audit and screenshot slots on English and zh-TW boards
- New `capture.test.cjs`: 4 cases for the normal and `shotOnly` capture in Chrome

## 0.7.0

### English

- Every skill, reference, example, eval and script comment is now in English, so people outside Taiwan can read, trust and contribute to it. Skill descriptions stay bilingual so Chinese prompts still trigger them. The Traditional Chinese originals of 0.6.0 are kept outside the repo
- Script messages (errors, warnings, audit issues) are in English; the agent relays them in your language

### The board follows your language

- `board-skeleton.js` takes `BOARD.lang`: `'en'` (default) or `'zh-TW'`. The fixed labels, coverage summary, gap check title, wireframe headings and layer names switch with it; other languages keep English labels with card text in the user's language
- Gap card tags in `BOARD` are `'spec'` and `'suggested'`; the Chinese labels used before are still accepted
- English boards use Inter; boards in Chinese, or with any CJK card text, keep Noto Sans TC and its fallbacks
- `audit.js` recognizes boards in both languages and returns `count` as `{ prototype, spec, suggested }`
- `audit.js` reads the tag from the tag chip instead of searching the whole title row, so a prototype card named "Suggested products" is no longer flagged as a misplaced gap card
- The reference screenshot layer is now `Reference screenshot (browser)`; `audit-screens.js` still finds the old `參考截圖` layer on boards built by earlier versions

### Tests

- `board-skeleton.test.cjs`: 13 cases (was 7), covering English and zh-TW boards, old tag values, font fallbacks for both, an unknown `lang`, a wrong coverage summary, and the misleading card name above

## 0.6.0

### React support

- `al-extract.js` added a React adapter: it finds components from the fiber on each DOM node. The rules match Vue: a node is a boundary only if it is the component's sole root node, and the name comes from the outermost component. Function, class, `memo` and `forwardRef` components are all recognized. Names are read only in dev builds; a production build is treated as having no adapter, and `stats.json` reminds you to use the dev server instead
- Components that only pass children down (Provider, Tooltip, ErrorBoundary, `cloneElement` wrappers) don't take the name. When Radix/shadcn `asChild` wraps a component, the name goes to the inner component (`TooltipTrigger asChild` wrapping `Button` → `Button`); only when it wraps a plain tag does it use its own name (`Button asChild` wrapping `<a>` → `Button`). Styled components from styled-components and emotion, and routing, transition and Next.js internal components, don't count
- Next.js App Router Server Components get names too: React 19 dev builds record the name in the fiber's `_debugInfo`. Nested ones take the outermost name; ones that return a Fragment don't count
- Iconify `<Icon icon="mdi:home" />` carries the icon name through, for library binding
- The Next.js dev mode N badge (`nextjs-portal`) is not extracted into the layout tree and does not appear in screenshots
- Verified through capture and packing: four states of an order page in Vite + React 19 + Radix + lucide-react + Tailwind 4, and an order page in Next.js 16 App Router; both cases added to evals. There is no baseline for rebuilding them in Figma yet

### Layer naming

- Ids generated automatically by React `useId`, Radix, Headless UI and MUI (`radix-_r_1_`, `:r1:`) are not used as layer names
- More Tailwind utilities are recognized (`inline-flex`, `animate-pulse`, `sr-only`…), so layers use the component name instead of being called `inline-flex`

### Tests

- Added `tests/react.test.cjs`: loads real React 18 and 19 dev builds and a React 19 production build in Chrome, 38 cases. With the adapter removed, 31 fail; removing any single exclusion rule makes its matching case fail
- Fixed text lookup in `extract.test.cjs`: "transparent oklch produces no fill" used to pass even when it couldn't find the node
- Added React 18 and 19 to devDependencies (`.npmrc` sets `legacy-peer-deps`, because the peer ranges of the two versions conflict anyway); upgraded Playwright to 1.64.1 to avoid the security advisory for versions before 1.55.1

## 0.5.0

This version comes from a trial run on the frappe-ui project (Vue 3, an oklch color palette, all data from a backend API). On a project like this the tools produced screens with no color at all and icons as solid blocks, and the Figma MCP call budget ran out halfway through.

### No more getting stuck halfway

- scale-guard added "MCP call budget": the budget for each plan and seat, which tools count against it (tested: `use_figma` and `get_screenshot` both count), an estimate formula (screens × 2 + 5), and three options when the budget is not enough. Stop conditions gained "call limit reached"; when temporary frames can't be deleted, list their node ids
- Step 1 of figma-state-board and code-to-figma first checks that the MCP account can read and write the target file; if it can't open the file, say which account it is and who needs to share the file with it
- The save-a-version hard rule gained an exception: when the target page has no other content (new file, blank page), you may skip saving and skip asking about memory; say so in the report
- The two audit scripts are pasted into the same `use_figma` call, saving one call

### State board

- Added `board-skeleton.js`: fill the confirmed matrix into `BOARD` and it builds the section, titles, coverage summary (calculated automatically), groups, placeholder slots and gap check wireframes in one go, and returns each card's `slotId`. Before writing it checks for duplicate card IDs, references to cards that don't exist, and gap cards with no Basis; if Noto Sans TC is missing it switches to a CJK font in the file and warns
- Swapped the order so "4. Build the board skeleton" comes before "5. Build the screens in Figma": screens go into the placeholder slots, so the skeleton has to exist first

### code-to-figma

- Colors support `oklch()`, `color(srgb …)`, `lab()`, `hsl()` and the other formats Chrome returns (converted to sRGB through a canvas). 0.4.0 only recognized `rgb()`, so projects that define their palette in oklch, like Tailwind 4 and frappe-ui, came out with no color at all
- Icons that use an SVG as `mask-image` (frappe-ui, UnoCSS `lucide-*` and `i-*` classes) become vectors colored with the background color. 0.4.0 drew them as solid blocks
- `setup`, `ready` and `run` in `al-capture.cjs` receive the card ID: `setup(context, id, card)`; a card can also have its own `setup`. In 0.4.0 the only way to tell which card was current was to guess from the capture order
- Added `examples/api-intercept/`: for projects with no e2e fixtures whose data comes from a backend API, capture one real response as the base and change only what differs for each card; error and loading states are also produced by interception
- Known limits now cover tabular figures: `tabular-nums` can't be turned on in Figma (`openTypeFeatures` is read-only), so text after dates and amounts shifts by 5–8px
- web-capture and the README now explain how to install Playwright and Pillow in the working directory when they are missing

### Tests

- Added `tests/`, which run without Figma: `board-skeleton.test.cjs` runs the skeleton script against a fake Figma and then runs the audit (7 cases); `extract.test.cjs` runs the extractor in Chrome and checks oklch, color(srgb), rgb, transparent colors and mask icons (5 cases; 0.4.0 fails 3 of them)
- Added a frappe-ui case to evals

### figma-library-binding

- Removed the built-in design system preset; added `presets/README.md` describing the preset format

## 0.4.0

### Keeping Figma files from blowing up

- Images are split out of the data SVG: `al-pack.py` saves them as `ALIMG-` image files, which are uploaded with `upload_assets` as native images. The data SVG now holds only the layout and code, and its limit dropped from 10MB to 2MB
- `__alBuild` stops when it sees `ALDATA-` or `ALIMG-` temporary frames from another screen, which blocks uploading a whole batch at once; after building, it deletes this screen's image frames automatically
- code-to-figma added three hard rules for writing: save a version before writing to an existing file (including delete-and-rebuild), send one screen at a time, and stop immediately on a warning or recovery mode
- scale-guard records an incident where a file's memory blew past the limit, plus memory calibration for desktop and full-page screens

### Fixes

- The Components section was covered by the main section after screens made it grow: it is now moved out of the way after building, a warning is raised when it overlaps other nodes, and audit checks for it too
- Pseudo-elements with `z-index: -1` covered the parent's background: they are now raised to the bottom of the nearest stacking context
- Table borders with `border-collapse` became 2px: adjacent cells now keep only one line
- Triangles drawn with CSS borders, rotated check marks and small squares: elements with no children become vectors, with support for the Tailwind 4 `rotate`/`translate`/`scale` properties
- Truncated text was built at the full text width and pushed other elements in the same row away: its width is now limited to the container
- 0-size wrappers were included in layout, shifting whole blocks down: they no longer take part in layout
- Centered children leaned to one side when the parent's padding differed on each side: this is now decided inside an Align frame
- Empty svg icons (CDN blocked, lazy load not back yet) turned black: their color now comes from `color`, and `stats.json` warns; capture waits up to 3 seconds for lazy-loaded icons
- Instances whose state differs only by opacity (e.g. the current item in a sidebar) kept the main component's transparency: instances with no opacity set are now back to 1
- Instances overrode only padding, not alignment: when the main component positioned content with padding and this instance switched to centered, the content stuck to the edge; alignment now follows the data too
- Wrapping was not applied the first time variants were combined, so two widescreen variants sat side by side and overflowed the Components section; components wider than the shelf now widen the shelf
- When one component was used at different widths (e.g. each column of a table header), the instance's inner frame stayed at the main component's width: a sole child that fills its parent frame is now set to Fill
- Instances also sync corner radius and clipping, not just padding, alignment and opacity
- Images are drawn separately to match how the browser shows them: SVGs in stretched frames, stretched bitmaps, off-center object-position, none/scale-down, and CSS filter (drop-shadow glow)
- Radial gradient size and center are calculated from the CSS shape, size keywords and position
- Carousels stopped on a page in the middle: autoplaying carousels go back to the first page before freezing; capture waits for smooth scrolling to stop
- CSS triangles flipped with `transform: rotate()` were drawn pointing the opposite way: the rotation is now carried over when converting to vectors
- When a section has more than 40 screens, the other screens' fingerprints are not recalculated, to avoid `use_figma` timeouts
- Nested instances overlapped their neighbors when their content got longer: Auto Layout frames whose size can't be changed are now set to Hug
- When a later screen updated a shared main component, earlier screens were wrongly flagged as "modified": after building, fingerprints are recalculated for screens that were unmodified before the build

### Tools

- `al-upload.py`: uploads the images and the data SVG in order to the URLs that `upload_assets` returns, and refuses if the data SVG is not last
- `cleanup-components.js`: lists and deletes old main components that are no longer used, including ones used only by other old components, so one confirmation cleans them all up; by default it only lists them, and it deletes only the ids the user approved
- `al-diff.py` sorts regions by amount of difference, and for the screens with the most difference saves side-by-side crops of each region
- `audit-screens.js` counts icon vectors separately in its color stats; the preset check looks only at colors outside icons

## 0.3.0

### Structure

- Split into four skills: `figma-state-board`, `state-discovery`, `code-to-figma`, `figma-library-binding`, each usable on its own
- Tools moved to each skill's `scripts/`; design system settings moved to `presets/`
- Audit split into `audit.js` for the board and `audit-screens.js` for screens

### Added

- `al-capture.cjs`: Playwright capture, driven by a config file or by calling `capture()` in a spec, including full-page mode
- `al-diff.py`: compares against browser screenshots
- `al-bind.js`: binds tokens on existing screens
- Rebuild protection: pass `replace` when a screen already exists, and `force` when it has been modified
- Audit checks text offset and lists main components with no instances
- When used on its own, screens are laid out in a section; no state board cards needed
- Vue 3 adapter interface, Tailwind layer naming, state detection from `aria-*` and `data-state`
- Images scaled down to 2× their display size; `image-set()`, video frames, `mix-blend-mode`, `line-clamp`, and `::before` in flex rows

### Fixes

- Layers follow the browser's paint order, so sticky and z-index elements are no longer covered
- Instance padding, gap, font size, line height and truncation follow each data item
- Multi-line text uses the container width, text boxes are corrected to the line height, and mixed font sizes are no longer mistaken for multiple lines
- Collapsed text keeps the padding on its aligned side; `transform: scale()` is converted into font size
- Clipping scroll containers get a fixed size, `flex-wrap` rows are centered, and grids with items spanning rows don't use wrap
- Icon colors are read from the computed style, rectangular clipPaths are removed, and sprite names are converted to camelCase
- Font matching is case-insensitive, system fonts are replaced with Inter, and transparent gradient stops borrow the neighboring color
- Only entrance animations that end within 1.5 seconds are finished; the rest are paused. Extraction waits for the network and images to settle

## 0.2.0

- Added scale guard, Route B tools and design system binding
