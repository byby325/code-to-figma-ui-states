# Scale guard

Two things can stop work halfway: the Figma MCP call budget and file memory. This doc sets what to calculate before starting and when to stop and ask the user. It applies to state boards and to standalone code to Figma alike. A "screen" is one product screen; on a state board, that is one **Prototype** (zh-TW: 原型) card.

## MCP call budget

When the budget runs out, every Figma tool returns "reached the Figma MCP tool call limit", and you have to wait for the budget to reset or change plans before continuing; half-built screens get stuck on the canvas. So **calculate before starting**.

Official limits ([Rate limits](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/); Figma may change them at any time):

| Seat | Starter | Professional | Organization | Enterprise |
|---|---|---|---|---|
| View, Collab | 20 per month | 20 per month | 20 per month | 20 per month |
| Full, Dev | 20 per month (measured) | 200 per day, 10 per minute | 200 per day, 15 per minute | 600 per day, 20 per minute |

- Officially, only tools that "read data" count and write tools don't, but `use_figma` is not listed. Measured in 2026-11: on the Starter plan, calls were blocked at about the 21st, which matches the count of `use_figma` (**including write-only builds**) plus `get_screenshot`; `upload_assets`, `create_new_file` and `whoami` appear not to count
- The budget is counted per plan (team), not per account. Measured 2026-11-14: a file in a team where the account has a View seat was blocked, and a new file in another Starter team with a Full seat worked in the same hour
- The budget follows the seat the signed-in account has **in the plan that owns the file**. The same person may be Full in one team and View in another; `whoami` lists the seat for each plan

**How to estimate**: counted calls ≈ screens × 2 + 5

| Item | Calls |
|---|---|
| Read the target file (read-only `use_figma` after `create_session`) | 1 |
| Build the state board skeleton (board-skeleton.js) | 1 |
| Build each screen (`use_figma`) | screens |
| Screenshot each screen for comparison (`get_screenshot`) | screens |
| Audit (audit.js and audit-screens.js in the same `use_figma`), Components section screenshot | 2–3 |

A state board with browser screenshots in its cards (figma-state-board Route C) doesn't grow with the number of screens: counted calls ≈ 3

| Item | Calls |
|---|---|
| Read the target file | 1 |
| Build the state board skeleton | 1 |
| Fit the screenshots, audit and screenshot the board (screenshot-slots.js, audit.js and `await section.screenshot()` in the same `use_figma`) | 1 |
| A closer look at one group (`get_screenshot` with a larger `maxDimension`), only if the inline screenshot is too small to read | 0–1 |

In a new, blank file you can skip the read: the skeleton call is the access check. Measured 2026-11-14 on a Starter plan with a Full seat: a 4-card board took 2 counted calls (skeleton; fit + audit + inline screenshot), and `upload_assets` with the four slot ids as `nodeIds` filled the slots directly. Whether `upload_assets` counts could not be told apart at this size. Figma may change any of this: if a call is refused, stop as the stop conditions say.

**Before starting**: use `whoami` to find the seat in the plan that owns the target file, and compare it with the estimate. If it is not enough, tell the user first and let them choose:

1. For a state board, use Route C: browser screenshots in the cards instead of rebuilt layers. Any card can be rebuilt as layers later
2. Split into batches: this time do only the representative screens and the most important group; do the rest after the budget resets
3. Move to a file in a paid-plan team where the account has a Full/Dev seat
4. Skip per-screen screenshot comparison; compare only the representative screens and screens at high risk of differences (state in the report which ones were not compared)

**Ways to save calls**: paste both audit scripts into the same `use_figma`; compare a representative screen with a single `get_screenshot`, without also reading metadata; the `log.drift` returned by the build is already a structural check, so you don't need another read to confirm.

## Figma limits

- Memory is capped at 2GB per browser tab; the desktop app has the same limit
- At 90%, a red warning appears that can't be dismissed, and Figma's docs say data may be lost if usage doesn't come down; at 100% the file is locked, and editors must enter recovery mode to bring it below 90%
- Only loaded pages count, so splitting into pages works; hidden layers, variants and images all count
- **Usage spikes instantly; static usage is not the whole story**: when a data SVG is imported, every character of the few MB of base64 text inside it has to be laid out; when you delete in bulk and rebuild, the old layers and undo history are still there. A file with only a few % static usage can still blow past the limit in one go
- **The agent can't read the memory percentage or see the warning**; only the user can: Main menu › View › Memory usage, then open the Manage memory panel, which shows Total memory used and Total layers. Open the target page first and wait for it to finish loading
- Saving a version must be done manually by the user: calling `saveVersionHistoryAsync` from `use_figma` returns `not a supported API`. Saving and restoring versions both require edit access

Sources: [Reduce memory usage in files](https://help.figma.com/hc/en-us/articles/360040528173-Reduce-memory-usage-in-files), [View a file's version history](https://help.figma.com/hc/en-us/articles/360038006754-View-a-file-s-version-history)

## Checkpoints

If you change 150, change `MAX_PROTOTYPE_CARDS` in audit to match.

| When | Condition | Action |
|---|---|---|
| Confirming the target | Every time | Estimate MCP calls and compare them with the budget of the plan that owns the target file ("MCP call budget" above). If it is not enough, ask first |
| Confirming the target | The target is an existing file and the page already has other content | Ask the user to report the current memory %. At 70% or above, don't add to this file; start a new file instead |
| Confirming the screen list | More than 150 screens this time | Ask about the options together: merge, split pages or split files. Don't draw until the user decides |
| Before writing | The target is an existing file, including deleting or rebuilding screens you built earlier | Ask the user to save a version (file menu › Save to Version History), and write only after they reply that it is saved. **Exception**: when the target page has nothing on it except what you built this time (new file, blank page), nothing can be overwritten, so you may skip saving a version and asking about memory; state "target page was empty" in the report |
| Uploading temporary frames (data SVG, images) | Every time | One screen at a time: upload this screen's images and data, build it, confirm the temporary frames are deleted, then do the next. Don't upload the whole batch first; `__alBuild` stops if it sees another screen's temporary frames |
| Batch writing | More than 100 screens, more than 20 unique images, or deleting and rebuilding several screens | Pause after each group and ask the user to report memory % |
| Uploading screenshots (Route C) | More than 20 cards | Every card is one image of up to 4096px. Upload one group at a time and ask the user to report memory % after each |
| Finishing | Every time | Ask the user to report memory % once, and write it in the report together with audit's `scale` |

When screens are much bigger than mobile (e.g. full desktop pages), convert before comparing with the thresholds: estimated layers ≈ node count of the representative screen × number of cards × 1.3. Over 60,000 counts as over 150 screens; over 40,000 counts as over 100 screens.

## Calibration

Project A mobile prototype (2026-11, test file A): 36 mobile Prototype cards at 360×800, 11 wireframes, only 1 image.

| layers | memory |
|---|---|
| about 5,500 | 1% |
| 9,254 | 1.5% |
| 14,414 | 2.1% |
| 17,609 | 2.5% |

- About 0.12–0.16% per 1,000 layers; use 0.16% for estimates. The layers in the table include full-page components that were removed later; after removal, the 36 cards total 13,901 nodes, and one Prototype card, including its share of components, is about 390 layers, 0.06%
- 150 screens is about 60,000 layers, 10%; 100 screens is about 40,000 layers, 6%. Both are extrapolated from 36 cards and have not been measured
- Readings taken after clearing and rebuilding the whole board twice were still on the same line; deleted layers left no lingering usage
- Images are not calibrated, so 20 images is a separate condition; for image-heavy files, report memory to collect the next data point
- 70% and 85% are buffers before Figma's 90% warning and don't depend on board size, so they were not changed

Incident (2026-11-03, test file A): the file's static usage was 4.6%, 35,944 layers. After deleting 8 desktop and full-page screens, 9 data SVGs were uploaded at once (8.6MB total, largest 3.7MB) and then rebuilt one by one; the user's browser showed out of memory, and recovery mode was needed to save the file. The moment of the crash was not measured; the most likely cause is the whole batch of data SVGs being laid out on the canvas at the same time, 66–95% of which was image base64. Since then images are uploaded separately, and data SVGs are under 1MB. The user had another file that blew up and could not be recovered, so "one screen at a time" and "save a version before deleting and rebuilding" are both hard rules. After the recovery mode rescue, the file measured 36,908 layers, 2.3%.

Desktop and full-page screens have far more nodes than mobile ones. On 2026-11-03 the whole file measured 35,944 layers, 4.6% (another trial page with 20,118 layers and 201 unique images, plus the Project A page with 13,903 layers), about 0.13% per 1,000 layers, consistent with the mobile estimate; images did not noticeably raise static usage. But the same file was later blown up by a usage spike; see "Incident" above:

| Project | Screens | Nodes (incl. components) | Images |
|---|---|---:|---|
| Project B | Three desktop 1280, one mobile; one of them full page, 3,937px | 6,472 | 177 unique |
| Project C | Four desktop 1280 | 6,707 | 0 |
| Project D | Two each of desktop 1920 and mobile 360, full page | 4,845 | 24 unique |

On average one screen (including its share of components) is about 1,200–1,700 nodes, 3–4 times a mobile Prototype card, so convert thresholds through layers as above; do not compare screen counts directly.

## Stop conditions

Stop writing on any of these, and do not retry:

- The user reports memory at 85% or above, or sees the red warning
- The user reports that the file has to be opened in recovery mode
- `use_figma` times out, or an error message mentions memory
- The same write reports an unknown error twice in a row
- Any Figma tool reports that the call limit is reached (`reached the Figma MCP tool call limit`). After that even read-only calls are blocked; do not retry

After stopping, report the IDs of completed and unfinished cards, the last memory %, and whether any `ALDATA-` data frames or `ALIMG-` image frames are left on the page, then ask the user to choose between splitting into a new file and restoring a version. When the call limit is reached, the temporary frames can't be deleted: list their node IDs and explain that after the budget resets they can be used for the build directly (no re-upload needed), or ask the user to delete them manually. Restoring a version is done by the user in Figma. For a file that has been in recovery mode, do not run even a read-only `use_figma`; wait for the user to confirm the file is fine and report the current memory, then decide.

## How to split

- **Merge cards**: merge states that differ only in copy or values into one card, and describe the differences clearly
- **Split pages**: one page per device or per group of topics, one section per page, with the device or topic added to the section name. The Starter plan allows at most 3 pages per file; if `createPage` throws an error, split files instead
- **Split files**: components can't be shared across files, so each file has its own Components section

After splitting, run audit.js once per section; the coverage summary uses that section's numbers, and card IDs stay unique across all sections. Two kinds of issue, a missing **Gap check** (zh-TW: 缺漏檢查) group and cross-page references, are caused by splitting pages; note them in the report.

## Default ways to save memory

- Put reference screenshots only on each device's representative screen; keep the rest local (screen-structure.md)
- Use instances for repeated UI; do not clone whole blocks of layers
- `al-pack.py` splits bitmaps out into separate image files, which `upload_assets` uploads as native images; the data SVG holds only layout and code, and packing stops above 2MB. 2MB is a conservative value; the exact breaking point was not measured
- After several rounds of rebuilding, use cleanup-components.js to clear out unused old main components. On 2026-11-03 in test file A, clearing 18 of them went from 42,551 layers, 5.1% to 41,735 layers, 4.5%; the drop was larger than the layer count would predict, and the cause was not confirmed

## Report

Always write one line: `Scale: Prototype N, nodes N, hidden N, images N (unique N), memory start N% → end N%, MCP calls N (estimated N)`. Memory is what the user reports; if you didn't ask, write "unconfirmed"; if the target page was empty, write "blank page, not measured".
