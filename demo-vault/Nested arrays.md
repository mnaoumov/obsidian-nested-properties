---
tags:
  - red
  - green
  - blue
matrix:
  - [1, 2, 3]
  - [4, 5, 6]
  - [7, 8, 9]
weeklyHours:
  - [9, 17]
  - [9, 17]
  - [0, 0]
---
[Docs](https://github.com/mnaoumov/obsidian-nested-properties#features)

# Nested arrays

An array renders as a collapsible list. An **array of arrays** (like `matrix`) nests one list inside another, each row expandable on its own.

## Look at the Properties panel

1. Expand `matrix` - each item is itself a three-number list.
2. `tags` is a flat list of strings.
3. `weeklyHours` pairs an open and close hour per row.
