# Nested Properties

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/mnaoumov)
[![GitHub release](https://img.shields.io/github/v/release/mnaoumov/obsidian-nested-properties)](https://github.com/mnaoumov/obsidian-nested-properties/releases)
[![GitHub downloads](https://img.shields.io/github/downloads/mnaoumov/obsidian-nested-properties/total)](https://github.com/mnaoumov/obsidian-nested-properties/releases)
[![Coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/mnaoumov/obsidian-nested-properties)

YAML frontmatter nests, but [Obsidian](https://obsidian.md/)'s Properties editor does not. Give a note
a nested structure and the panel shows you nothing useful — the values are there in the file, and the
only way to read or change them is to edit the raw YAML by hand and hope you get the indentation right.

This plugin renders nested objects and arrays as a collapsible tree in the Properties panel, where you
can read them, edit them, change their types, and rename or delete a nested key across the whole vault.

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

Inspired by this [feature request](https://forum.obsidian.md/t/properties-bases-support-multi-level-yaml-mapping-of-mappings-nested-attributes/63826).

<!-- markdownlint-disable MD033 -->

<a href="images/screenshots/screenshot-desktop-1.png"><img src="images/screenshots/screenshot-desktop-1.png" alt="Without the plugin: nested values have nowhere to go" width="600"></a>

<details>
<summary>More screenshots</summary>

<a href="images/screenshots/screenshot-desktop-2.png"><img src="images/screenshots/screenshot-desktop-2.png" alt="With it: every nested key on its own row" width="600"></a>
<a href="images/screenshots/screenshot-desktop-3.png"><img src="images/screenshots/screenshot-desktop-3.png" alt="Arrays nest too, including arrays of objects" width="600"></a>
<a href="images/screenshots/screenshot-desktop-4.png"><img src="images/screenshots/screenshot-desktop-4.png" alt="Cut, copy, paste or remove any node" width="600"></a>
<a href="images/screenshots/screenshot-desktop-5.png"><img src="images/screenshots/screenshot-desktop-5.png" alt="Rename a nested key in every note at once" width="600"></a>
<a href="images/screenshots/screenshot-mobile-1.png"><img src="images/screenshots/screenshot-mobile-1.png" alt="Without the plugin: nested values have nowhere to go" width="270"></a>
<a href="images/screenshots/screenshot-mobile-2.png"><img src="images/screenshots/screenshot-mobile-2.png" alt="With it: every nested key on its own row" width="270"></a>
<a href="images/screenshots/screenshot-mobile-3.png"><img src="images/screenshots/screenshot-mobile-3.png" alt="Arrays nest too, including arrays of objects" width="270"></a>
<a href="images/screenshots/screenshot-mobile-4.png"><img src="images/screenshots/screenshot-mobile-4.png" alt="Cut, copy, paste or remove any node" width="270"></a>
<a href="images/screenshots/screenshot-mobile-5.png"><img src="images/screenshots/screenshot-mobile-5.png" alt="Show long keys in full instead of truncated" width="270"></a>

</details>

<!-- markdownlint-enable MD033 -->

## Demo vault

**The documentation is a demo vault.** Every feature has a note whose own frontmatter demonstrates it —
open the note, look at the Properties panel, and you are looking at the feature.

**[Start reading here](<./demo-vault/00 Start.md>)** — it is plain markdown, so it works on GitHub with
nothing installed.

A copy of the vault ships with every release. You can access it via any of the following:

1. Running the **Nested Properties: Open demo vault** command.
2. Downloading `nested-properties-demo-vault-<version>.zip` (`<version>` is the release version) from the [Releases](https://github.com/mnaoumov/obsidian-nested-properties/releases).
3. Browsing its source in [`demo-vault/`](./demo-vault/README.md) in this repository.

## What it does

- **Nested objects and arrays as a tree** in the Properties panel, collapsible to any depth.
  [01 Nested objects](<./demo-vault/01 Nested objects.md>) ·
  [02 Nested arrays](<./demo-vault/02 Nested arrays.md>) ·
  [05 Deeply nested and scrolling](<./demo-vault/05 Deeply nested and scrolling.md>)
- **Mixed and complex shapes** — lists holding different types, and arrays of objects.
  [03 Mixed lists](<./demo-vault/03 Mixed lists.md>) ·
  [04 Array of objects](<./demo-vault/04 Array of objects.md>)
- **Edit in place** — add, remove and reorder entries from the context menu, and change a nested
  property's type without rewriting the YAML.
  [06 Context menu actions](<./demo-vault/06 Context menu actions.md>) ·
  [07 Changing property types](<./demo-vault/07 Changing property types.md>)
- **Rename or delete a nested key across the whole vault**, not just in the note you are looking at.
  [09 Vault-wide rename and delete](<./demo-vault/09 Vault-wide rename and delete.md>)
- **Find them** — search nested properties the way you search anything else.
  [10 Search nested properties](<./demo-vault/10 Search nested properties.md>)
- **See the full key** of a nested entry when the short name is ambiguous.
  [08 Full key display](<./demo-vault/08 Full key display.md>)

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

## Changelog

All notable changes to this project will be documented in the [CHANGELOG](./CHANGELOG.md).

## Contributing

Contributions are welcome — see [CONTRIBUTING](./CONTRIBUTING.md) to get set up.

## Support

<!-- markdownlint-disable MD033 -->

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60" width="217"></a>

<!-- markdownlint-enable MD033 -->

## My other Obsidian resources

[See my other Obsidian resources](https://github.com/mnaoumov/obsidian-resources).

## License

© [Michael Naumov](https://github.com/mnaoumov/)
