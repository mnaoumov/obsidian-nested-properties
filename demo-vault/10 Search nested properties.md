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

## Try it

**Step 1.** Seed a few notes. Search is most convincing when several notes match, so this creates a `Search demo` folder with three books that have different `book.author` / `book.genres`.

```code-button
---
caption: Seed search demo notes
---
await require('/demoSetup.ts').seedSearchDemoNotes(app);
```

Manual equivalent: add your own notes with nested `book` frontmatter.

**Step 2.** Search for `[book.genres: fantasy]`. The button opens Obsidian's own search pane with that query typed in.

```code-button
---
caption: Search for fantasy books
---
await require('/demoSetup.ts').searchFor(app, '[book.genres: fantasy]');
```

Manual equivalent: open the search pane (the magnifier in the left sidebar, or `Ctrl`/`Cmd` + `Shift` + `F`) and type the query.

Both this note and the two fantasy books match, because `fantasy` is one of their `book.genres`; `Dune` (sci-fi only) does not.

**Step 3.** Expand a result: the line under it shows the nested value it matched, such as `book.genres: fantasy sci-fi`, with the matching member highlighted. Click a result to open it.

**Step 4.** Try a composed query, which excludes this note's author:

```code-button
---
caption: Search for fantasy books not by Le Guin
---
await require('/demoSetup.ts').searchFor(app, '[book.genres: fantasy] -[book.author: Ursula K. Le Guin]');
```

Manual equivalent: type `[book.genres: fantasy] -[book.author: Ursula K. Le Guin]` into the search pane. Only `The Hobbit` is left.

The seeded folder is removed by the clean-up button in [09 Vault-wide rename and delete](<./09 Vault-wide rename and delete.md>), or by deleting `Search demo` by hand.
