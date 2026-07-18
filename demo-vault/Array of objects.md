---
contributors:
  - name: Ada
    role: author
  - name: Bob
    role: editor
  - name: Carol
    role: reviewer
tasks:
  - title: Draft outline
    done: true
  - title: Write body
    done: false
---
[Docs](https://github.com/mnaoumov/obsidian-nested-properties#features)

# Array of objects

A list whose items are **objects** is the most common nested shape - each item expands into its own set of keys, and you can right-click any item or key for the context menu.

## Look at the Properties panel

1. Expand `contributors` - each entry has a `name` and a `role`.
2. Expand a `tasks` item - `done` is a boolean you can flip.
