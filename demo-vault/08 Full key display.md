---
aVeryLongPropertyKeyNameThatGetsTruncatedWithATrailingEllipsisByDefault: value
metadata:
  anotherRatherLongNestedKeyThatAlsoGetsTruncatedWhenSpaceIsTight: value
  short: ok
---
# Full key display

By default, long keys are **truncated with a trailing ellipsis** to save space - both plain top-level keys (like `aVeryLongPropertyKeyName…` above) and nested ones. The **Toggle full key display** command (and the matching button in the Properties header) switches keys to their full text, widening each field and scrolling horizontally where needed.

## Try it

1. Look at the long keys above - they are truncated by default.
2. Click the button below. It runs the **Toggle full key display** command, the same thing the button in the Properties header does (the wrap-text icon next to the collapse/expand-all button).
3. The keys expand to their full text; press the button again to go back. The choice is remembered across restarts.

```code-button
---
caption: Toggle full key display
---
require('/demoSetup.ts').toggleFullKeyDisplay(app);
```

Manual equivalent: click that header button, or run **Toggle full key display** from the command palette.

The toggle state is persisted in the plugin setting `isFullKeyDisplayEnabled` (saved to the plugin's `data.json`), so it survives restarts.
