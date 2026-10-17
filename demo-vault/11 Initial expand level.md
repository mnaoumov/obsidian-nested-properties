---
nestedProperties:
  initialExpandLevel: 2
generated:
  by: human
  at: 2026-02-09
  foo:
    - bar: 1
    - baz: 2
---
# Initial expand level

A nested property does not have to arrive collapsed. **Initial expand level** decides how many levels are already open when you open a note:

- `0` — the default: everything collapsed. Every nested property is one row you click to open - and, as below, one you can read without opening.
- `1` — the nested property itself is open, its children are not.
- `2` — its children are open too, and so on for higher numbers.

An array index counts as a level of its own, so in `generated.foo.0` the array item sits one level below `generated.foo`.

## Anything still collapsed is readable

A collapsed row is not an opaque `{ ... }` — it shows a one-line preview of what is inside, so you can read the value without opening it. A complex value nested inside the preview stays elided, which keeps the row exactly one line tall.

This note is set to level `2`, so `generated.foo` is open while its two array items are collapsed — and each of them reads as `{ bar: 1 }` and `{ baz: 2 }` rather than `{ ... }`.

## Per-note override

The plugin setting applies vault-wide, and any note can override it for itself with a `nestedProperties` property — exactly what this note's own frontmatter does:

```yaml
---
nestedProperties:
  initialExpandLevel: 2
---
```

## Try it

**Step 1.** Look at the Properties panel above: `generated` and `generated.foo` are open, and the two array items are collapsed with a readable preview.

**Step 2.** Change `initialExpandLevel` to `0` and reopen the note - everything arrives collapsed, each row still readable. The level applies when a note is opened, so the button reopens this note in the next tab and leaves this one as it is.

```code-button
---
caption: Set this note's level to 0 and reopen it
---
await require('/demoSetup.ts').setNoteInitialExpandLevel(app, 0);
```

Manual equivalent: edit `initialExpandLevel` in the Properties panel, then close and reopen the note.

**Step 3.** Remove the `nestedProperties` property entirely and reopen the note - the note falls back to the vault-wide setting in **Settings → Nested Properties → Initial expand level**, which is `0` unless you change it.

```code-button
---
caption: Remove the per-note override and reopen
---
await require('/demoSetup.ts').setNoteInitialExpandLevel(app, null);
```

Manual equivalent: right-click `nestedProperties` and choose **Remove**, then close and reopen the note.

**Start over.** Put this note's frontmatter back to how it shipped, at level `2`:

```code-button
---
caption: Reset this note's properties and reopen
---
await require('/demoSetup.ts').resetInitialExpandLevelDemo(app);
```

Manual equivalent: add the `nestedProperties` property back as shown under **Per-note override** above, then reopen the note.

Expanding or collapsing a row by hand always wins over the level for as long as the note stays open.
