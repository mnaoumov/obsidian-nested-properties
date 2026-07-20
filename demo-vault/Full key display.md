---
aVeryLongPropertyKeyNameThatGetsTruncatedWithATrailingEllipsisByDefault: value
metadata:
  anotherRatherLongNestedKeyThatAlsoGetsTruncatedWhenSpaceIsTight: value
  short: ok
---
[Docs](https://github.com/mnaoumov/obsidian-nested-properties#commands)

# Full key display

By default, long nested keys are **truncated with a trailing ellipsis** to save space. The **Toggle full key display** command (and the matching button in the Properties header) switches keys to their full text, widening each field and scrolling horizontally where needed.

## Try it

1. Look at the long keys above - they are truncated by default.
2. Click the **Toggle full key display** button in the Properties header (the wrap-text icon next to the collapse/expand-all button), or run the **Toggle full key display** command.
3. The keys expand to their full text; toggle again to go back. The choice is remembered across restarts.

The toggle state is persisted in the plugin setting `isFullKeyDisplayEnabled` (saved to the plugin's `data.json`), so it survives restarts.

## Switch it with a button

The block below toggles full key display for you (needs the [[CodeScript Toolkit prerequisite]]). Manual equivalent: use the header button or the command palette as described above.

```code-button
---
caption: Toggle full key display
---
require('/demoSetup.ts').toggleFullKeyDisplay(app);
```
