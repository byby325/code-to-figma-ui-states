---
name: state-discovery
description: Inventory every screen state of a feature from code and specs into a state matrix — states the prototype handles, states the spec requires but the prototype lacks, and missing error, empty and loading states. No Figma needed. Use when the user asks to "list all states", "state inventory", "what error handling is missing" or "edge cases for this feature". 從任何專案的程式碼和規格盤點一個功能的所有畫面狀態，產出狀態矩陣，列出原型已有的狀態、規格有寫但原型沒做的狀態，以及缺漏的 error、空狀態、載入狀態。不需要 Figma。Use when 使用者要「盤點狀態」「列出所有狀態」「這個功能缺哪些 error handling」「邊界狀態清單」「state inventory」。要畫成 Figma 情境稿用 figma-state-board。
---

# State inventory and gap check

First find the states that **already exist** in the code and rules, then use the gap checklist to find states that **should exist but don't**. The result is a matrix; see the example in [examples/checkout-matrix.md](examples/checkout-matrix.md).

## Process

1. Confirm the code source (repo, branch, feature entry point) and the rule source (Jira AC, PRD, Confluence, error code docs). If there is no rule source, write "None"; there will be more gaps
2. **Find existing states**: look in the code's conditional branches, state values, API response handling, error codes, form validation, permission checks, feature flags, storybook and mock fixtures. Then check against the rule source, and list what the spec mentions but the prototype doesn't build as **In spec** (zh-TW: 規格有寫)
3. **Find gaps**: go through the gap checklist below, checking only the categories relevant to this feature. Give every item a basis (code evidence first, category inference second)
4. Assemble the matrix and give it to the user to confirm

Matrix columns: card ID, group, tag (**Prototype** (zh-TW: 原型) / In spec / **Suggested** (zh-TW: 建議補)), trigger, result, basis (`file:line`, AC number or reasoning). When drawing a state board, assign card IDs per [board-format.md](../figma-state-board/references/board-format.md) "Card IDs".

Done when:
- Every branch in the code that affects the screen maps to a card, or is listed under "Not drawn" with a reason
- Every relevant gap category has a conclusion: a matching card, a Suggested card, or a note saying "Handled"
- Where rules and code disagree, list it separately; don't pick a side yourself

## The three card tags

Project code is usually a prototype built on mock data, so there's no "implemented / not yet implemented" split; the only question is whether the prototype builds this state. "How to draw" and "Where it goes" apply when drawing a state board.

| Tag | Meaning | How to draw | Where it goes |
|---|---|---|---|
| Prototype | The prototype has this branch, and it can be reproduced with mocks | Real product screen | Its own group |
| In spec | Mentioned in the rule source (AC, spec, mockups, i18n copy the code doesn't use), but the prototype doesn't build it | Wireframe with what the spec requires and where it says so | The last group, **Gap check** (zh-TW: 缺漏檢查) |
| Suggested | Neither the prototype nor the spec has it; inferred from the gap checklist | Wireframe; don't draw fake product UI | The last group, Gap check |

Prototype cards get no tag label. The other two both get a tag next to the card title and must state their basis. In spec means the prototype missed it and it should be built; Suggested is only an inference, so don't present it as a confirmed requirement. If there's only i18n copy or a mockup and no formal spec, tag it In spec but state the source clearly in the basis, so the user can confirm whether it counts as spec.

## Finding states in code

Find the feature entry point first (route, page, screen), then read down the component tree. Every branch that makes the screen look different is a candidate state.

| Stack | Where to look |
|---|---|
| Vue | `v-if` / `v-else-if` / `v-show`, computed, Pinia / Vuex getters, state classes bound with `:class` |
| React | `&&`, ternaries, early `return`, `useState` / reducer state values, Suspense / ErrorBoundary fallbacks |
| Angular | `*ngIf`, `@if` / `@switch`, loading / error branches of the `async` pipe |
| Svelte | `{#if}`, pending / then / catch of `{#await}` |
| SwiftUI / Compose | Views wrapped in `if` / `switch`, enum values of `@State` / `State`, `.alert` / `.sheet` |
| Any stack | loading / success / error of API calls, error code tables, form validation rules, permission checks, feature flags / toggles, mock fixtures and storybook stories |

When you find one, note its `file:line`; the matrix's basis column needs it. Storybook stories and existing mock fixtures are usually a ready-made list of states, so look at those two first.

## Gap checklist

Check only the categories **relevant to this feature**. If the feature makes no API calls, don't check network errors; if it has no forms, don't check validation. For each category, check two things: whether the code handles it, and whether the user can see the result.

| Category | States to look for | Common evidence of a gap |
|---|---|---|
| Loading | First load, refresh, loading the next page, submitting | No loading state during `await`; button not disabled while submitting |
| Empty states | First use, no results after filtering, data cleared | List renders `[]` directly, with no empty-state branch |
| Network and server | Offline, timeout, 5xx, retry | `catch` only has `console.error` or is empty; no way to retry |
| Permissions and login | Logged out, session expired, no permission (401 / 403) | 401 only redirects to the login page; what the user just entered isn't kept |
| Input validation | Required, format, range, cross-field rules, server-side validation failure | The front end validates, but there's no matching message when the server returns 422 |
| Business rules | Unmet conditions, mutually exclusive options, limits, insufficient balance, expired | The error code table has the code, but the UI has no matching copy |
| Data limits | Longest text, largest number, 0, negative numbers, many items, a single item | Long text in a fixed-size container; no thousands separator or abbreviation rule for numbers |
| Concurrency and staleness | Data changed mid-action, duplicate submit, background updates | Data changed after submit, with no notice or reconfirmation |
| Completion and feedback | Success confirmation, partial success, undoable actions | No feedback at all after success; batch actions only report full success |

## Writing Suggested cards

- Every card needs a **basis**, one of two kinds:
  - Code evidence: "The catch in `useSubmit.ts:42` only logs; the screen doesn't change when submitting fails"
  - Category inference: "The feature calls `/orders`, but nothing in the flow handles timeouts or going offline"
- Write the description as "trigger; result" as usual, but write the result as what the screen **must show**: what happened, what the user can do, whether data will be lost.
- Don't decide visuals or write specific copy; that's the designer's job.
- One card per root cause. For example, if no API handles timeouts, make one "Site-wide timeout" card, not one per API.

## The matrix the user confirms

Write the matrix in the user's language, tag names included: Prototype / In spec / Suggested in English, 原型 / 規格有寫 / 建議補 in Traditional Chinese.

List the matrix in two parts: Prototype and Gaps. In the Gaps part, list In spec first, then Suggested; sort Suggested by confidence: cards with code evidence first, category inferences after. The user can delete Suggested cards they don't need (before deleting an In spec card, confirm whether the spec changed); deleted cards are simply not drawn and don't need to be recorded anywhere.
