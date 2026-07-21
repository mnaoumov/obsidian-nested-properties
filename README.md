# Nested Properties

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/mnaoumov)
[![GitHub release](https://img.shields.io/github/v/release/mnaoumov/obsidian-nested-properties)](https://github.com/mnaoumov/obsidian-nested-properties/releases)
[![GitHub downloads](https://img.shields.io/github/downloads/mnaoumov/obsidian-nested-properties/total)](https://github.com/mnaoumov/obsidian-nested-properties/releases)
[![Coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/mnaoumov/obsidian-nested-properties)

This is a plugin for [Obsidian](https://obsidian.md/) that allows to view/edit nested frontmatter properties.

Inspired by the [Feature request](https://forum.obsidian.md/t/properties-bases-support-multi-level-yaml-mapping-of-mappings-nested-attributes/63826).

```yaml
---
level1simple: simple1
level1Nested:
  level2simple: simple2
  level2Nested:
    level3simple: simple3
    level3Nested:
      level4simple: simple4
      level4Nested:
        level5simple: simple5
---
```

![Nested Properties Screenshot](<./images/screenshot.png>)

## Features

- Render nested YAML objects and arrays as a collapsible tree inside the Properties editor
- Collapse/expand individual properties or all at once
- Context menu (Cut, Copy, Paste, Remove) on nested properties
- Set and **persist** the type of any nested property — text, number, checkbox, date, list, object, and even **Tags** (which Obsidian's UI won't let you assign). The choice is saved to the vault's `types.json` under the property's dotted path (e.g. `foo.bar.property`), so it survives reload and applies across notes (see [Nested property types](#nested-property-types))
- Add new properties at any nesting level
- Horizontal scrolling for deeply nested structures
- Toggle full display of nested property keys (see [Commands](#commands))

## Commands

The plugin adds the following command to the command palette (it can be bound to a hotkey):

- **`Toggle full key display`** — An on/off toggle that switches nested property keys between the default view (long keys truncated with a trailing ellipsis) and the full key text. Deeply nested keys scroll horizontally.

The same on/off toggle is also available as a button in the Properties header (next to the collapse/expand-all button), so you can flip it directly from the frontmatter without opening the command palette. The button is highlighted while full key display is on.

The chosen state is remembered and restored the next time Obsidian starts.

## Nested property types

Right-click any nested key (or click its type icon) and open the **Property type** submenu to convert a value to another type — text, number, checkbox, date, list, or object. Converting a rich value to a simpler one can lose data, so a confirmation dialog appears first.

Unlike Obsidian's built-in property types, the submenu also offers reserved types such as **Tags**, which Obsidian's own UI won't let you assign. This is handy when you want, for example, a nested `tags` list to behave exactly like the top-level one.

The chosen type is **persisted** to the vault's `.obsidian/types.json` under the property's dotted path, so it survives reloads and is shared across notes:

```yaml
foo:
  bar:
    property: "Value"
```

```json
{
  "types": {
    "foo.bar.property": "text"
  }
}
```

For arrays of objects, a field's type is stored once for the whole array (the item index is collapsed), so it applies to every item:

```yaml
versions:
  - version: "1.0.0"
    released: 2026-03-06
  - version: "1.1.0"
    released: 2026-03-21
```

```json
{
  "types": {
    "versions.version": "text",
    "versions.released": "date"
  }
}
```

The context menu offers two scopes for a field inside an array item: **Property type (all items)** writes the shared per-field key (`versions.released`), while **Property type (this item only)** writes a per-index override (`versions.0.released`) that wins for just that item. When a chosen type matches what the plugin would infer from the value anyway, the entry is removed from `types.json` to keep it tidy.

## Demo vault

A ready-made [demo vault](./demo-vault/README.md) ships with the plugin. Run the **`Open demo vault`** command to download the current release's vault and open it in a new window. Each note's frontmatter showcases one feature (nested objects, arrays, mixed lists, deeply nested structures, type changes, and the full-key-display toggle) — open a note and look at the Properties panel.

## Installation

The plugin is available in [the official Community Plugins repository](https://community.obsidian.md/plugins/nested-properties).

### Beta versions

To install the latest beta release of this plugin (regardless if it is available in [the official Community Plugins repository](https://community.obsidian.md) or not), follow these steps:

1. Ensure you have the [BRAT plugin](https://community.obsidian.md/plugins/obsidian42-brat) installed and enabled.
2. Click [Install via BRAT](https://intradeus.github.io/http-protocol-redirector?r=obsidian://brat?plugin=https://github.com/mnaoumov/obsidian-nested-properties).
3. An Obsidian pop-up window should appear. In the window, click the `Add plugin` button once and wait a few seconds for the plugin to install.

## Debugging

By default, debug messages for this plugin are hidden.

To show them, run the following command in the `DevTools Console`:

```js
window.DEBUG.enable('nested-properties');
```

For more details, refer to the [documentation](https://mnaoumov.dev/obsidian-dev-utils/guides/debugging/).

## Support

<!-- markdownlint-disable MD033 -->

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60" width="217"></a>

<!-- markdownlint-enable MD033 -->

## My other Obsidian resources

[See my other Obsidian resources](https://github.com/mnaoumov/obsidian-resources).

## License

© [Michael Naumov](https://github.com/mnaoumov/)
