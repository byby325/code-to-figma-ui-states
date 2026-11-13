# Contributing

Thanks for helping. This project turns real web screens into editable Figma layers, so most bugs show up as "the Figma result doesn't look like the browser". The fastest way to get a fix in is a small, reproducible case.

## Reporting a problem

Please include:

- What you ran (skill name and the prompt) and your stack (framework, CSS approach, component library)
- A browser screenshot and a Figma screenshot of the same screen
- `stats.json` from the capture folder, and the `log.warn` / `log.drift` returned by `__alBuild` if you got that far
- If you can, a minimal HTML page that reproduces it — most extractor bugs can be reproduced without your app

Check `skills/code-to-figma/references/troubleshooting.md` first; many symptoms are already listed with their cause.

## Running the tests

```bash
npm install          # installs playwright; set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 to use your local Chrome
npm test             # frontmatter + board skeleton (fake Figma) + extractor, capture and React adapter (Chrome)
npm run test:fast    # no browser needed
```

The tests need no Figma account and use no MCP calls. They catch script errors, matrix validation, layout-tree regressions and board structures that `audit.js` would reject. They do **not** prove the Figma result looks right.

## Changing the tools

| You changed | Also do |
|---|---|
| `al-extract.js` | Add a case to `tests/extract.test.cjs` that fails before your fix and passes after |
| A framework adapter in `al-extract.js` | Test it against the real framework in the browser, like `tests/react.test.cjs` does for React 18 and 19, including its production build |
| `al-build.js` or `al-extract.js` in a way that changes layout | Re-run every case in `skills/code-to-figma/evals/trials.json` in real Figma and update the baselines. A change often breaks only one kind of project |
| `al-capture.cjs` | Add a case to `tests/capture.test.cjs` |
| `board-skeleton.js`, `screenshot-slots.js` or `audit.js` | Keep them consistent with `skills/figma-state-board/references/board-format.md`; add a test to `tests/board-skeleton.test.cjs` |
| A `SKILL.md` description | `npm run test:fast` — an unquoted `: ` breaks YAML and the skill silently fails to load |
| Anything user-visible | Add a line to `CHANGELOG.md` |

Budget Figma MCP calls before running evals: Starter plans and View/Collab seats get about 20 per month (see `skills/code-to-figma/references/scale-guard.md`).

## Writing docs and skills

- Each rule says what goes wrong if it's ignored. A rule without a failure mode is usually not needed.
- Skills tell the agent when to stop and ask (memory, call budget, overwriting a designer's work). Keep those checkpoints when you edit.
- Never put real customer data, internal file names or credentials in examples, fixtures or evals.
- Skills are written in English. Keep the `description` in each `SKILL.md` bilingual (English and Traditional Chinese) so prompts in either language trigger it.
- Board labels live in two places: `LABELS` in `board-skeleton.js` (what gets drawn) and `LABELS` in `audit.js` (what the audit recognizes). To add a board language, add it to both and add a test to `tests/board-skeleton.test.cjs`.
