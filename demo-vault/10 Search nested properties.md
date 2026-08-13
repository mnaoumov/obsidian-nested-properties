---
book:
  author: Ursula K. Le Guin
  genres:
    - fantasy
    - sci-fi
---
# Search nested properties

Obsidian's built-in search understands *top-level* property operators like `[author]` or `[status: done]`, but out of the box it cannot reach into nested frontmatter such as `book.author`. This plugin teaches Obsidian's **own search** to understand nested paths - so you just type the query into the normal search bar, and results appear in the search pane like any other query. No separate command, and no Base required.

Write the nested key as a dotted path inside the property brackets:

- `[book.author]`
  - notes that have the nested `book.author` property.
- `[book.author: Ursula K. Le Guin]`
  - notes whose `book.author` equals that value.
- `[book.genres: fantasy]`
  - a query value matches any member of a nested list, so this matches the note above.

Because it is real Obsidian search, a nested-property operator composes with everything else - content terms, `path:`, `OR`, `-`, and so on (e.g. `[book.genres: fantasy] -[book.author: Ursula K. Le Guin]`), and it works inside embedded ` ```query ` blocks too.

## Seed a few notes first

Search is most convincing when several notes match. The button below creates a `Search demo` folder with three books that have different `book.author` / `book.genres`, so a query returns more than one match. Manual equivalent: add your own notes with nested `book` frontmatter.

```code-button
---
caption: Seed search demo notes
---
await require('/demoSetup.ts').seedSearchDemoNotes(app);
```

## Try it

1. Click **Seed search demo notes** above (or add your own notes with nested `book` frontmatter).
2. Open Obsidian's search (the magnifier in the left sidebar, or `Ctrl`/`Cmd` + `Shift` + `F`).
3. Type `[book.genres: fantasy]` - both this note and the two fantasy books above match, because `fantasy` is one of their `book.genres`; `Dune` (sci-fi only) does not.
4. Click a result to open it.
