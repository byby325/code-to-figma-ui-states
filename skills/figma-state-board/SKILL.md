---
name: figma-state-board
description: Inventory every UI state of a feature from its code and lay them out on one Figma canvas (a state board) — real screens for states the prototype already handles, plus a gap check of missing error, empty and loading states, split into spec-required and suggested. Use when the user asks for a "state board", "all states of this feature in Figma", "which error screens are missing", or to update an existing board. 從任何產品專案的程式碼盤點一個功能的所有狀態，在 Figma 產出或更新「情境稿」：原型（通常是 mock data 做的）已經有的狀態畫真實畫面，原型缺的狀態全列進「缺漏檢查」，再分「規格有寫」（規格要求、原型漏做）和「建議補」（規格和原型都沒提的錯誤、空狀態、載入等）。Use when 使用者要「做情境稿」「把所有狀態／狀況畫到 Figma」「state board」「檢查缺了哪些 error 畫面」，或要依新規則增修既有情境稿。只要狀態清單用 state-discovery，只要把畫面轉進 Figma 用 code-to-figma。
---

# Figma State Board

A state board is a Figma section that lays out **every state a feature can be in** on one canvas. Groups are split by device, tab or topic. Each card has "ID · name", "trigger; result" and a product screen. The last group, **Gap check** (zh-TW: 缺漏檢查), lists states the prototype doesn't have yet but the feature should. Designers, engineers, QA and PMs all use it as their shared list of states.

Project code is usually a prototype built on mock data, not connected to a real backend. So **don't split states into "implemented / not yet implemented"**. Ask one question only: does the prototype build this state? Cards have only three tags:
- **Prototype** (zh-TW: 原型): the prototype has this branch. Draw the real screen; no tag label
- **In spec** (zh-TW: 規格有寫): mentioned in AC, specs, mockups or unused i18n copy, but the prototype doesn't build it. Goes in the gap check
- **Suggested** (zh-TW: 建議補): neither the spec nor the prototype mentions it; inferred from code evidence or the feature type. Goes in the gap check

Works for any stack and any product. [board-format.md](references/board-format.md) is the source of truth for the board spec.

**Language.** Write the matrix, card names, descriptions, wireframe text and the report in the user's language. The board's fixed labels (tags, Gap check, coverage summary, wireframe headings, layer names) come from `BOARD.lang`: `'zh-TW'` when the user works in Traditional Chinese, `'en'` otherwise. Other languages keep English labels with card text in the user's language.

This skill owns the overall flow, the board and the audit. Other work goes to other skills in the same plugin:

| Task | Use | When |
|---|---|---|
| Scale guard | [scale-guard.md](../code-to-figma/references/scale-guard.md) | Read before step 1 |
| Bind to a design system | [figma-library-binding](../figma-library-binding/SKILL.md) | Confirm in step 1, use in step 5 |
| Inventory states, find gaps | [state-discovery](../state-discovery/SKILL.md) | Step 2 |
| Rebuild screens from code | [code-to-figma](../code-to-figma/SKILL.md) | Step 5, on Route B |

This skill's own files:
- [board-format.md](references/board-format.md): board layout, type sizes, tags and card ID rules. Read before drawing anything
- [board-skeleton.js](scripts/board-skeleton.js): builds the board skeleton and gap wireframes from the matrix. Used in step 4
- [screenshot-slots.js](scripts/screenshot-slots.js): fits uploaded browser screenshots into the cards. Used in step 5 on Route C
- [audit.js](scripts/audit.js): board audit. Used in step 6

If the project has its own UI rules skill (for example, the project's UI guidelines skill), follow it for product screen tokens, naming and acceptance.

## Steps

### 1. Confirm the inputs

Ask for anything missing:
- **Code source**: repo, branch, feature entry point (route, page, screen or component)
- **Rule source**: Jira AC, PRD, Confluence, error code docs. If there are none, write "None"; the gap check will have more cards
- **Target**: Figma file and page; a new section, or an update to an existing state board. For practice boards, or boards to share with others, use the team's shared practice file (rules in board-format.md "Shared practice file"). If the target is an existing file, also ask the user to report its current memory usage (scale-guard.md)
- **Dimensions**: which axes the states vary along (device width, login state, role, tab, data volume, interaction sequence…), and the viewport width for each device
- **Product screen source**: components in the target file or a library, or a running prototype / dev server. If there is none, you can only draw wireframes; say so up front
- **Design system library**: which libraries product screens must bind to (figma-library-binding). If none, write "None"

As soon as you have the Figma link, do two things first. Don't wait until the inventory is done to find out you can't draw into the file:

1. **Confirm read and write access**: `create_session`, then run one read-only `use_figma` (list pages and top-level nodes). If it reports "could not access the requested file", use `whoami` to see which account MCP is signed in as, and give the user two options: share the file with that account with can edit, or sign in with an account that has access in the connector settings (after switching, the original account's files can't be opened)
2. **Estimate the call budget**: follow [scale-guard.md](../code-to-figma/references/scale-guard.md) "MCP call budget" to estimate how many calls this run needs, and compare it with the seats of the target file's plan in `whoami`. If it's not enough, say so first and let the user choose: Route C (browser screenshots in the cards, about 3 calls for the whole board; step 5), split into batches, switch files, or do fewer comparisons

Done when: all six items have a clear value, or the user said explicitly that they don't apply; the target file is readable; the call budget is enough, or the user has chosen how to split the work.

### 2. Inventory states and build the state matrix

Build the matrix with state-discovery. Assign card IDs up front, following the rules in board-format.md.

**Don't draw until the user has confirmed the matrix.** How groups are split, which cards to merge and which Suggested cards to keep are all settled in this step; changing them after drawing costs much more. If there are more than 150 Prototype cards, follow scale-guard.md and ask the user to decide whether to merge cards, split pages or split files. Don't draw until they decide.

### 3. Prepare data for each card

- Prototype: reproduce it with fixed mock data or a storybook story. Add missing data in the mock layer; don't add branches to components just for screenshots.
- In spec, Suggested: the prototype has no screen, so no data is needed; draw a wireframe. For In spec cards, write in the wireframe what the spec requires and where it says so.

Done when: every Prototype card has reproducible data, or is clearly marked "Illustrative in Figma only".

### 4. Build the board skeleton

First load the Figma plugin's two skills, `figma-use` and `figma-generate-design` (in Claude Code: `figma:figma-use` / `figma:figma-generate-design`; without the Figma plugin, use `get_figma_skill` to read `skill://figma/figma-use/SKILL.md` and so on, with a `resource:` prefix in `skillNames`).

If the target is an existing file, ask the user to save a version before writing. The same applies before deleting or rebuilding cards you built yourself. If the target page has nothing on it except what you built (a brand-new file, a blank page), you can skip saving; say so in the report.

For a new state board, use [board-skeleton.js](scripts/board-skeleton.js): fill the matrix confirmed in step 2 into `BOARD` at the top, and paste the whole script into one `use_figma` call. Following board-format.md, it builds the section (named "<Project>-<Feature>", placed to the right of existing content on the page) → board title, subtitle, coverage summary (calculated automatically) → groups → Scenarios → cards. The last group is the gap check, with its wireframes drawn. Prototype card screens start as placeholder slots with `placeholder = true`; the script returns each card's `slotId`, which you pass in when building screens in step 5. In a shared file, use one page per feature and set `BOARD.pageName` to the page name. Set `BOARD.lang` per "Language" above, and each gap card's `tag` to `'spec'` (In spec) or `'suggested'` (Suggested).

When updating an existing state board, don't run the skeleton script. Use these rules instead:
- Re-read the target node before every mutation; the designer may have moved or split things by hand
- Change only the affected cards. Keep their IDs; new cards continue after the last number in their group
- Once the prototype builds a gap check card's state, move the card to the group it belongs to, remove the tag, give it a new ID, and note the old G ID in the description
- Recalculate the numbers in the coverage summary
- Keep the board's existing language for labels you add, even if the user now writes in another language; a board with mixed labels is hard to read
- Don't touch the designer notes area on the right or the Feedback section

Done when: every Prototype card has a placeholder slot and a `slotId`; all gap check wireframes are drawn.

### 5. Build the screens in Figma

Use `use_figma` to build **native layers** and put them in the placeholder slots from step 4. `send_code_to_figma` imports a Code layer and produces no editable Design layers, so it doesn't work for state boards.

On Route B, follow code-to-figma "Hard rules for writing to Figma" and send only one screen at a time. With more than 100 Prototype cards or more than 20 unique images, ask the user to report memory usage after each group, following scale-guard.md. If you hit a scale-guard.md stop condition while writing (including call limit reached), stop and don't retry.

Pick a route first and confirm it with the user:

- **Route A: copy the mockups** (default). Use when the target file or library has complete mockup screens. You can bind variables and keep Auto Layout.
- **Route B: rebuild from the project code**. Use when the target file has no mockups to copy, or when the user asks to rebuild from code instead of pasting mockups. Follow code-to-figma and pass `slotId` to `__alBuild`; the product screen goes into the card's placeholder slot. Currently Web front ends only.
- **Route C: browser screenshots**. Each Prototype card shows a screenshot of the running app; nothing is rebuilt. The whole board takes about 3 counted calls however many cards it has, so offer it when the call budget can't cover Route B (Starter plans, View and Collab seats), or when the user only needs the list of states and the gap check. The screens are pictures, not editable layers; say so when you offer it and again in the report. Web front ends only. Steps are under "Route C" below.

On Routes A and B, product screens must follow [screen-structure.md](../code-to-figma/references/screen-structure.md): screen root frame width Fixed = W; Auto Layout for containers whose children are arranged; no Groups; repeated UI as components (variants for different states); carousel containers clip and are never Hug; long text Fill + auto height. Gap check cards (In spec, Suggested) follow the wireframe spec in board-format.md; don't draw fake product UI.

Steps 1–3 below are Route A:

1. Find screens and components: if the target file already has complete mockup screens, prefer copying them and changing the state (switch variants, hide layers); that's closest to the product. Next, use `search_design_system` and local components. Only if neither exists, build local layers from the code's structure and styles. Bind colors, type sizes and spacing to the project's variables. Where the mockups and the code disagree, follow the code and note it in the description.
   - If the product font can't load in the Figma runtime (for example Arial), don't change existing text. For new text, use a font with compatible widths (Arial → Arimo), and list where you used it in the report.
2. **Build one representative screen per device first**, and compare its screenshot with the prototype or the live screen: move on only once text, spacing, corner radius and tokens are all right. If there's nothing to compare with, say in the report that these screens weren't compared.
3. Generate the remaining Prototype cards from the representative screen by clone or instance plus overrides, changing only what differs in this state.

Route C:

1. Capture: follow [web-capture.md](../code-to-figma/references/web-capture.md) steps 1–3 with `shotOnly: true` in the config. It writes `shot/<ID>.jpg` at 2x and skips the layout tree. Read `stats.json`: a warning about 4096px means the screen is too long for one image; capture it as several viewport-height cards instead
2. Look at every screenshot locally before uploading. This is the comparison step on Route C: a wrong state, a spinner that never finished or a dev toolbar left in the shot costs nothing to fix here
3. Upload: call `upload_assets` with `nodeIds` set to the cards' `slotId`s in card order (at most 60 per call). Write the submitUrls to a file, one per line, and send the screenshots in the same order: `python3 al-upload.py urls.txt capture/shot/C01.jpg capture/shot/C02.jpg`. If `upload_assets` won't fill the slots, call it with `currentPageId` and `count` instead; the screenshots land on the page as layers named `<ID>.jpg`, and the next step moves them into their cards. Don't rename the files
4. Run [screenshot-slots.js](scripts/screenshot-slots.js) with `SECTION_ID` replaced, in the same `use_figma` call as audit.js (step 6): wrap each in an async function, call them in order, then `await section.screenshot()` on the board section before returning both results, so the picture of the board comes back with the same call. It sizes each slot to its screenshot and returns `placed`, `missing` and `skipped`. Upload again for the cards in `missing`
5. To turn a screenshot card into editable layers later, rebuild that card with Route B and pass the same `slotId`; the build replaces the picture

Done when: you have looked at a screenshot of each device's representative screen, and it matches the prototype, or you noted that there was nothing to compare with. Route B must also meet the completion criteria in code-to-figma. On Route C, every Prototype card is in `placed`, or the report lists the ones that are not.

### 6. Audit

1. Run both audit scripts, replacing `SECTION_ID` with the target section. Paste both into the **same** `use_figma` call (wrap each in an async function, call them in order and return both results) to save one call from the budget:
   - [audit.js](scripts/audit.js): the board. Whether groups have a title and description, duplicate card IDs, whether card IDs cited in descriptions exist, truncated descriptions, equal card widths within a group, whether Scenarios is wide enough, whether gap check cards have a tag and a **Basis** (zh-TW: 依據), whether the coverage summary numbers are right
   - [audit-screens.js](../code-to-figma/scripts/audit-screens.js): the product screens inside cards. Structure, text offset, binding ratio, scale. Run it on Routes A and B. On Route C there are no layers to check: skip it, run screenshot-slots.js and audit.js in one call, and check that `screens.empty` in the audit result lists no card
2. If the whole section is too big to screenshot, screenshot one group at a time and view it at a normal readable scale: text alignment, clipping, overlap, and whether screens in the same row are top-aligned. Screenshot the Components section too: problems hidden because the card clips the screen show up there. A component shouldn't be taller than its screen, have large empty areas, or be cut off by the section.
3. Spot-check three kinds of cards against the product: longest text, error state, most items. On Route B, compare every Prototype card with its browser screenshot (web-capture.md "6. Compare every card after the batch"); looking only at the thumbnails of a whole group misses things. On Route C the cards are the browser screenshots, so the inline screenshot from step 5 is enough to check that every card has its picture and nothing overlaps; use `get_screenshot` with a larger `maxDimension` only when the text is too small to read. There is no Components section.

Done when: `issues` from both audits is empty, or every issue has been reported to the user with the reason; you have looked at a screenshot of every group and of the Components section. On Route C: `issues` from audit.js and `screens.empty` are both empty, and you have looked at the board in a screenshot.

## Report

- Coverage summary: how many Prototype cards, how many gap cards (how many In spec and how many Suggested)
- Scale: one line in the scale-guard.md format
- List the IDs of cards added, changed and deleted, with Figma node links to their groups
- List each gap check card with its basis: In spec means the prototype missed it and it should be built; Suggested is for design and product to decide whether to build
- State clearly: which screens were compared with the product, which are illustrative per the rules, the audit results, and where rules and code disagree and haven't been settled
- On Route B, also report per code-to-figma "Report"; when there are required libraries, report per figma-library-binding "Report"
- On Route C, say that the Prototype cards are browser screenshots and not editable layers, list any card without a screenshot, and say that any card can be rebuilt as layers later with Route B
- Don't call "drawn" "audited"; say directly which groups you haven't looked at in a screenshot
