---
name: figma-library-binding
description: Bind Figma screens to a design system library — tokens only on exact value matches, swap icons and components for library versions, and list unmatched values for designers instead of snapping to the nearest token. Use when the user asks to "bind tokens", "use library components" or "find unbound colors". 把 Figma 畫面綁到專案的 design system library：顏色、圓角、邊框、間距、字級完全相同才綁 token，圖示和元件換成 library 版本，沒有對應的值列給設計決定，不取最近值。Use when 使用者要「綁 library」「綁 token」「換成 design system 元件」「檢查沒綁 variable 的顏色」，或 code-to-figma、figma-state-board 的畫面要綁 design system。
---

# Binding to a design system library

Product screens must use the project's design system, not only local layers.

## Pick a preset

Each design system has one preset, in [presets/](presets/). Ask the user which one the project uses, or check the project's dependencies (e.g. if the project depends on a design token package, use the matching preset). See [presets/README.md](presets/README.md) for the format. If there's no preset, look it up once following "How automatic binding works" below, then save the result as a new preset. If the project has no library, write "None" and say so in the report.

Before starting, use `get_libraries` to confirm every library is in `libraries_added_to_file`. For any that are missing, ask the user to add them in Figma under Assets › Libraries; don't continue until they're added.

## Binding rules

Better to leave something unbound than to change the screen. The tool does only what's below; everything else stays local and is reported.

| Type | Rule | Don't |
|---|---|---|
| Color | Bind only on an exact match, including opacity. Semi-transparent colors need a token with that transparency, because Figma resets opacity to 1 when binding | Don't snap to the nearest color |
| Radius, stroke, spacing, type size | Bind only when the value is exactly equal | Don't change 3px to 2px or 4px |
| Alias tokens | A token that points at another token (a semantic token over a primitive) counts with the value at the end of the chain. When a value has both, the token with its own value wins; the alias is used only for values nothing else has | Don't pick between two semantic tokens with the same value by guessing; report it |
| Text style | Bind only when font, size and line height are all equal | If the font differs, bind only the size |
| Icon | Swap only when the library has a component with the same name; accept old names only for mappings confirmed to have the same purpose | Don't use an icon with a similar meaning but a different look |
| Component | Swap only when the library component looks the same as the product's; keep the product's size | If it looks different, keep the local component and don't change the product screen |

Why not snap to the nearest value: a matching value doesn't mean a matching meaning, and it makes the state board disagree with the code. A value with no matching token is a gap in the design system; list it for design to decide, rather than letting the tool pick.

## How automatic binding works

With a preset, set `preset` in the `al-capture.cjs` config and pass the preset name as the fourth argument to `al-pack.py`; screens are bound automatically when they're built. Only without a preset, follow the process below, then save the result as `presets/<name>.json`: `libs` is the binding config, and `extract` is the sprite mapping used during extraction.

1. After extracting the layout tree, list every `lib` (icon name) in the JSON
2. For each name, search the Icon System with `search_design_system`: `system:cross` maps to `icon / system / cross`. Accept exact name matches only
3. Use `search_design_system` to find the component set, place a few instances, screenshot them, compare their look with the product, and decide `buttons.rules`
4. Assemble `opts.libs`. Build 3–4 cards first and check `log.drift` and the screenshots; batch only if they look right

```js
const libs = {
  tokens: ['My DS - Foundation'],        // read variables from these libraries
  icons: { 'system:cross': '<componentKey>' },
  buttons: {
    set: '<componentSetKey>',
    rules: { FFE13A: { Type: 'primary', Size: 'medium', Compact: 'false', Status: 'default' } }, // key is the button background color
  },
  words: { value: 'Price' },             // rename text properties to match the team's terms
};
```

The `al-capture.cjs` output includes `unmappedIcons`, listing icons used this time that the preset doesn't map yet. Look them up with `search_design_system` and add exact name matches to the preset; next time they bind automatically, so the preset gets more complete with use.

The `stat` returned by `__alBuild` has the binding results: `boundColors`, `boundLayout`, `libIcons`, `dsButtons`, `unboundColors`, `localIcons`.

## Binding existing screens

[al-bind.js](scripts/al-bind.js) can be used on its own. It binds tokens only and doesn't swap icons or components. Paste the whole script into `use_figma` (or load it with `eval`), then call:

```js
return await __alBind(['<frame id>'], { tokens: ['<library name>'] });
```

It returns `boundColors`, `boundLayout`, and `unboundColors` (colors with no token). `skippedText` counts text whose font could not be loaded, so its size was left unbound.

When screens are built with `__alBuild`, the token table is cached in `_registry` so later screens don't import every variable again. It is rebuilt when the preset lists different token libraries. After the library publishes new or changed tokens, pass `refreshTokens: true` to the next `__alBuild` call.

## Components

- **Center with Auto Layout**: not with padding or text box width, so changing the text doesn't shift it
- **Containers aren't components**: a repeated structure that already contains components is just a container
- **States are variants**: selected and disabled must be switchable through properties, not by overriding instance colors
- **Split small components into properties**: two variant properties, `Type` and `State`; make the text a component property
- **Main components must be complete**: don't make elements cut off by the viewport into components

## Report

Always list:
- Binding ratio: colors, layout values
- Number of icons and components swapped for library versions
- Colors with no token (top few), for design to decide
- Icons and components kept local, and why
