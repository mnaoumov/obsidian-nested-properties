---
book:
  author: Ursula K. Le Guin
  year: 1969
  genres:
    - fantasy
    - sci-fi
---
# Nested properties in Bases

Out of the box, a [Base](https://help.obsidian.md/bases) reads `note.book.author` as one property whose name happens to contain a dot. No note has such a property, so the column stays empty, the **Properties** picker never offers it, and the only way to see a nested value is a formula, which you cannot edit.

With this plugin a nested property is an ordinary column:

- **Pick it** from the **Properties** toolbar menu: every nested path of the notes the base shows is listed, such as `book.author` and `book.year`.
- **See it** in its column, and **sort by it** like any other property.
- **Edit it in place**: type into a table cell and the value is written back into the nested key, `book:` → `author:`.

## Try it

The base below lists every note with a `book` property. This note is one of them; the `Seed search demo notes` button in [10 Search nested properties](<./10 Search nested properties.md>) adds three more.

```base
filters:
  and:
    - file.hasProperty("book")
views:
  - type: table
    name: Books
    order:
      - file.name
      - note.book.author
      - note.book.year
      - note.book.genres
    sort:
      - property: note.book.author
        direction: ASC
```

1. Click the `book.author` cell of this note, change the name and press `Enter`. The Properties panel at the top shows the new value under `book`.
2. Open the base's **Properties** menu and tick another nested path to add it as a column.

Manual equivalent: in any `.base` file, add `note.<parent>.<child>` to a view's `order`, exactly as you would add a top-level property.
