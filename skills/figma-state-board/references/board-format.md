# State board format

Two layers:

- **Board** (section, titles, groups, cards, descriptions, tags): every project uses the same spec, and the values below are the defaults
- **Product screen** (the UI inside a card): follows the project's own components, tokens and viewports; the values here don't apply

This document is the source of truth for board values. If the target file already has text styles or variables for annotations or documentation, bind to those first. Only otherwise use the values here, and keep the same semantic names, but don't reuse variable IDs.

**Board language.** The board's fixed labels (tags, the gap group title and description, wireframe section names, the coverage summary, layer names) and its fonts follow `BOARD.lang`: `'en'` (default) or `'zh-TW'`. For other languages, write card names and descriptions in the user's language; the fixed labels use English. Wherever this spec gives a fixed label, layer name or font, the English value comes first and the zh-TW value is next to it.

## Contents

- Hierarchy, Size and layout, Product screen structure
- Text and tag styles
- Gap check group, Card IDs, Writing descriptions
- Right-hand area and Feedback, Shared practice file

## Hierarchy

```
SECTION "<Project>-<Feature>"            fill = light gray; e.g. Shop-Checkout
├─ TEXT Board title                      "<Feature> · <Interface> UI"
├─ TEXT Board subtitle                   lists every dimension value, e.g. "Mobile / Desktop · Logged out / Logged in"
├─ TEXT Coverage summary                 "Prototype N · Gaps N (In spec N · Suggested N)"
└─ FRAME group "NN · <dimension value or topic>"   ×N, top to bottom; the last group is "Gap check"
   ├─ TEXT Group title "NN · <full name>"
   ├─ TEXT Group description (rules this group shares)
   └─ FRAME "Scenarios"                  cards in a row
      └─ FRAME card "<ID> · <short name>"   ×n
         ├─ FRAME Card title row         HORIZONTAL: TEXT Card title "<ID> · <full name>" + Tag (only on In spec / Suggested)
         ├─ TEXT Card description "trigger; result"
         └─ FRAME Screen                 Prototype: product UI, or a browser screenshot (Route C); In spec / Suggested: wireframe
```

Layer names and the coverage summary follow `BOARD.lang`:

| en | zh-TW |
|---|---|
| Board title | 板標題 |
| Board subtitle | 板副標 |
| Coverage summary | 覆蓋摘要 |
| Groups | Groups |
| Group title | 群組標題 |
| Group description | 群組描述 |
| Scenarios | Scenarios |
| Card title row | 卡片標題列 |
| Card title | 卡片標題 |
| Tag | 標籤 |
| Card description | 卡片描述 |
| Screen | 畫面 |
| Screen (browser screenshot) | 畫面（瀏覽器截圖） |
| Screen (wireframe) | 畫面（線框） |
| `Prototype N · Gaps N (In spec N · Suggested N)` | `原型 N · 缺漏 N（規格有寫 N · 建議補 N）` |

## Size and layout

W = product viewport width (e.g. phone 360 / 375 / 390, tablet 768, desktop 1280). Cards in the same group use the same W; different devices go in different groups.

| Node | Auto Layout | Size | Other |
|---|---|---|---|
| Board title / subtitle / coverage summary | — | Same width as the groups, textAutoResize HEIGHT | At (94, 93) from the section's top left; 12px between the three lines |
| Groups (wrapper) | VERTICAL, gap 64 | Height Hug | Wraps all groups, so they don't overlap when content gets taller; the first group is 96px below the coverage summary |
| Group | VERTICAL, gap 20, padding 0 | Width = that group's Scenarios width, height Hug | No fill |
| Scenarios | HORIZONTAL, gap 40, padding 0 | Width = n×W + (n−1)×40; height Hug | At phone widths, at most 6 cards per row (width 2360); beyond that, turn on layoutWrap WRAP, fix the width at 2360 and wrap with a 64 row gap. At desktop widths, 2–3 cards per row |
| Card | VERTICAL, gap 12, padding 0 | Width W Fixed, height Hug | No fill |
| Card title row | HORIZONTAL, gap 8, counter axis centered | Width Fill | Title text Fill, tag Hug |
| Card description | — | Width W, height fixed at 3 lines (60 at the default type size) | textAutoResize NONE, so screens in the same row are top-aligned; if the text runs past 3 lines, shorten it; don't make one card taller |
| Screen (product) | Follows the product | Width W Fixed, height Hug; the screen root frame inside is also width W Fixed | Corner radius always 0, following neither the product nor the template; clip; background follows the product. Structure per screen-structure.md |
| Screen (browser screenshot) | — | Width W Fixed, height = W × the image's height ÷ width | The screenshot is the frame's only fill (scale mode Fill); no children; corner radius 0. Set by screenshot-slots.js |
| Screen (wireframe) | VERTICAL, gap 8, padding 16 | Width W Fixed, height Hug, min 200 | White background, corner radius 8, 1.5px dashed border in the card's tag color |

Screen frames use Hug height. The product screen inside is either viewport or full page (screen-structure.md), and the matrix must say which one each card is. Use viewport for states with fixed elements, and full page when the whole page's content must be visible; describe the product's actual scroll behavior in the description.

## Product screen structure

The product UI inside cards follows [screen-structure.md](../../code-to-figma/references/screen-structure.md); the audit checks it.

## Text and tag styles

| Use | Font (en) | Font (zh-TW) | Size / line height | Color |
|---|---|---|---|---|
| Board title | Roboto Bold | Roboto Bold | 36 / 50 | Navy #26304C |
| Board subtitle | Inter Bold | Noto Sans TC Bold | 20 / 28 | Navy |
| Coverage summary | Inter Regular | Noto Sans TC Regular | 14 / 20 | Dark gray #444444 |
| Group title | Inter Bold | Noto Sans TC Bold | 28 / 39 | Navy |
| Group description | Inter Regular | Noto Sans TC Regular | 14 / 20 | Dark gray |
| Card title | Inter Bold | Noto Sans TC Bold | 18 / 25 | Navy |
| Card description | Inter Regular | Noto Sans TC Regular | 14 / 18 | Dark gray |
| Wireframe body text | Inter Regular | Noto Sans TC Regular | 13 / 20 | Dark gray; the headings Must show / 必須交代, Basis / 依據 and Related / 相關卡 in Bold |

| Tag (en / zh-TW) | Text color | Background | Spec |
|---|---|---|---|
| In spec / 規格有寫 | #2F5BD3 | #E8EEFB | Auto Layout padding 2 / 8, corner radius 4, Bold 12 / 16 (Inter / Noto Sans TC) |
| Suggested / 建議補 | #C2410C | #FDEEE6 | Same as above |

The wireframe's dashed border uses the card's tag text color: In spec #2F5BD3, Suggested #C2410C.

The zh-TW fonts are for Chinese boards and for any board whose text contains CJK; English boards without CJK use Inter. Check fonts first with `figma.listAvailableFontsAsync()`. If the target environment doesn't have the font (Inter, or Noto Sans TC), switch to one the file already has (a CJK font when the board has CJK text), and say so in the report. Board explanatory text is always dark gray #444444, never a lighter gray.

## Gap check group

- Always the last group, titled `NN · Gap check` / `NN · 缺漏檢查`, with card ID prefix G.
- Holds the states the prototype hasn't built yet, with two tags: In spec first, Suggested after.
- The group description is always this text:
  - en: The prototype has no screen for these states yet. "In spec": the spec requires it and the prototype missed it. "Suggested": neither the spec nor the prototype mentions it; inferred from code evidence or the kind of feature, and design and product decide whether to build it.
  - zh-TW: 以下狀態原型還沒有畫面。「規格有寫」是規格有要求、原型漏做；「建議補」是規格和原型都沒提，依程式證據或功能類型推論，要不要做由設計與產品決定。
- The wireframe in each card has these sections:
  - **Must show** / 必須交代: 2–4 points, e.g. "What happened", "What the user can do", "Whether entered data is kept"; for In spec cards, follow the spec
  - **Basis** / 依據: for In spec, the source (AC number, document name, mockup screen name, i18n key); for Suggested, `file:line` plus one sentence, or "Category inference: <reason>"
  - **Related** / 相關卡: IDs of the Prototype cards this gap affects, e.g. "Affects S03, P02"
- If there are no gaps at all, keep this group anyway and change the description to `Checked <categories>; no gaps found.` / `已檢查<類別>，沒有發現缺漏。`, so readers know the check was done.

## Card IDs

- Each group gets a letter prefix plus a two-digit sequence number. The prefix comes from the initials of the group's topic in English and is unique on the board; G is reserved for the gap check.
- Groups that differ only in device or size reuse the same sequence number and change only the prefix (e.g. phone S03 ↔ desktop D03). The description says "Same scenario as S03; <differences only at this size>". Every ID cited must actually be on the board.
- Deleted IDs are never reused, and cards are never renumbered, so old references in Jira / Confluence don't point to the wrong card. If the prototype later builds a gap check card's state, move the card to the group it belongs to and give it a new ID; note the old G ID in the description, e.g. "Formerly G03".
- Lay out operation sequences left to right, and write the transition in the description: "Start: …; delete the last one → T02".
- Layer names can be abbreviated; titles visible on the board always use the product's full names.

Example (Shop-Checkout): PL = product list, PD = product details, C = cart, CO = checkout form, R = notices and order result, G = gap check.

## Writing descriptions

- Group description: the rules all cards in the group share, in one or two sentences.
- Card description: "trigger; result". The trigger says what the user did and what state the data is in; the result says what's visible.
  - E.g.: "3 items in the cart, 1 of them out of stock; the out-of-stock row is grayed out and shows a restock notification button; the checkout button still works."
- Write unmet conditions (notices) and errors (failures, conflicts) separately; don't call them all "error".
- Numeric examples must add up, e.g. unit price × quantity = subtotal.

## Right-hand area and Feedback

- The area to the right of the groups (from 500 past the right edge of the widest group) is for designers' handwritten handoff notes and reference screens. The skill neither generates nor overwrites this area.
- Put discussion feedback in a separate section, "<Project>-<Feature> Feedback"; don't mix it into the state board section.

## Shared practice file

When the team has a shared practice file that everyone has access to, put practice boards and boards to share with others there (if there isn't one, ask the user which file to use):

- One page per project feature; name both the page and the section "<Project>-<Feature>", and put the section at the top left of the new page. Figma counts only loaded pages, so separate pages keep the file's memory from piling up
- If a page or section with the same name already exists, this is an update; don't make another copy. Update an old section in place on its original page; don't move it
- If adding a page fails (Starter plans allow at most 3 pages per file), stop and ask the user. Don't delete other people's pages, and don't fall back to stacking boards to the right on one page
- Touch only your own section; put only your own section in the audit scripts' `SECTION_ID`
- When a product screen uses local components from another file, the screen displays normally after copy and paste, but people without access to the original file can't see the component definitions; say in the report which file the components come from
