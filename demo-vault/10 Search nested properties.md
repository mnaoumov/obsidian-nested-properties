---
book:
  author: Ursula K. Le Guin
  genres:
    - fantasy
    - sci-fi
---
[Docs](https://github.com/mnaoumov/obsidian-nested-properties#commands)

# Search nested properties

Obsidian's built-in search understands *top-level* property operators like `[author]` or `[status: done]`, but it cannot reach into nested frontmatter such as `book.author`. The **Find notes by nested property** command fills that gap: enter a nested-property query, and pick from the matching notes to open one - no Base required.

Two equivalent syntaxes are accepted:

- Bracket chain: `[book][author]` (existence) or `[book][author: Ursula K. Le Guin]` (value).
- Dotted path: `book.author` or `book.author: Ursula K. Le Guin`.

Value matching is case-insensitive, and a query value matches any member of a list-valued property (for example `book.genres: sci-fi` matches the note above).

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
2. Run the **Find notes by nested property** command.
3. Enter `book.genres: fantasy` (or `[book][genres: fantasy]`) - both this note and the two fantasy books above match, because `fantasy` is one of their `book.genres`; `Dune` (sci-fi only) does not.
4. Pick a note from the list to open it.
