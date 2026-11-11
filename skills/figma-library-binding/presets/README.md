# Preset format

One preset per design system: `<name>.json` holds the config, and `<name>.md` holds notes for people. Put `<name>` in `preset` for `al-capture.cjs` and in the fourth argument of `al-pack.py`. Without a preset, leave it out; screens are still built, just without automatic binding.

No presets are built in yet. The first time you use a design system, look it up once following [SKILL.md](../SKILL.md) "How automatic binding works", then save the result as a new preset.

## `<name>.json`

```json
{
  "extract": {
    "sprites": { "icon-": "icon:" }
  },
  "libs": {
    "tokens": ["My DS - Foundation"],
    "icons": { "icon:close": "<componentKey>" },
    "buttons": {
      "set": "<componentSetKey>",
      "rules": { "1A73E8": { "Type": "primary", "Size": "medium", "Status": "default" } }
    },
    "words": { "value": "Label" }
  }
}
```

| Field | Purpose |
|---|---|
| `extract.sprites` | During layout extraction, replaces icon class prefixes in the code with the library's icon naming, e.g. `icon-close` → `icon:close` |
| `libs.tokens` | Read variables from these libraries; bind only on exact value matches |
| `libs.icons` | Icon name → library component key; include only mappings confirmed to have the same look and purpose |
| `libs.buttons` | Button component set; keys in `rules` are button background hex colors, and values are the variants to switch to |
| `libs.words` | Rename text properties to match the team's terms |

## `<name>.md`

Write down the known differences for this design system, so the next person doesn't have to look them up again:

- Which projects use this preset, and which libraries they must bind
- The matching results for colors, text styles, icons and components (what can be bound, what stays local, and why)
- Old icon name mappings, and icons that look alike but aren't the same
- Calibration cases: color binding ratio and number of library instances, as a reference for the audit's `MIN_BIND_RATIO`
