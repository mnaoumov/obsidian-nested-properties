---
level1simple: simple1
level1Nested:
  level2simple: simple2
  level2Nested:
    level3simple: simple3
    level3Nested:
      level4simple: simple4
      level4Nested:
        level5simple: simple5
address:
  street: 123 Main St
  city: Metropolis
  geo:
    latitude: 40.7128
    longitude: -74.006
---
[Docs](https://github.com/mnaoumov/obsidian-nested-properties#features)

# Nested objects

A YAML **object** (a mapping of key/value pairs) renders as a collapsible node in the Properties editor, with each nested key on its own indented row.

## Look at the Properties panel

1. Make sure the **Properties** are visible at the top of this note.
2. Find `level1Nested` and `address` - each shows a `{ ... }` summary chip when collapsed.
3. Click the triangle to expand a node, or use the **collapse/expand all** button in the Properties header.
4. `level1Nested` nests five levels deep; `address.geo` holds two numbers.
