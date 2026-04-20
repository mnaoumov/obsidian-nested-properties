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
- Add new properties at any nesting level
- Horizontal scrolling for deeply nested structures

## Installation

The plugin is not available in [the official Community Plugins repository](https://obsidian.md/plugins) yet.

### Beta versions

To install the latest beta release of this plugin (regardless if it is available in [the official Community Plugins repository](https://obsidian.md/plugins) or not), follow these steps:

1. Ensure you have the [BRAT plugin](https://obsidian.md/plugins?id=obsidian42-brat) installed and enabled.
2. Click [Install via BRAT](https://intradeus.github.io/http-protocol-redirector?r=obsidian://brat?plugin=https://github.com/mnaoumov/obsidian-nested-properties).
3. An Obsidian pop-up window should appear. In the window, click the `Add plugin` button once and wait a few seconds for the plugin to install.

## Debugging

By default, debug messages for this plugin are hidden.

To show them, run the following command in the `DevTools Console`:

```js
window.DEBUG.enable('nested-properties');
```

For more details, refer to the [documentation](https://github.com/mnaoumov/obsidian-dev-utils/blob/main/docs/debugging.md).

## Support

<!-- markdownlint-disable MD033 -->

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60" width="217"></a>

<!-- markdownlint-enable MD033 -->

## My other Obsidian resources

[See my other Obsidian resources](https://github.com/mnaoumov/obsidian-resources).

## License

© [Michael Naumov](https://github.com/mnaoumov/)
