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

## Try it

1. Run the **Find notes by nested property** command.
2. Enter `book.genres: fantasy` (or `[book][genres: fantasy]`) - this note matches because `fantasy` is one of its `book.genres`.
3. Pick the note from the list to open it.
