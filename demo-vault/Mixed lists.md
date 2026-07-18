---
simpleList:
  - apple
  - banana
  - cherry
mixedList:
  - hello
  - 42
  - true
  - nested: value
  - [a, b, c]
---
[Docs](https://github.com/mnaoumov/obsidian-nested-properties#features)

# Mixed lists

When every item in an array is the same simple type, Nested Properties shows it as a normal **list**. When the items are of **mixed** types (text, number, boolean, nested object, nested array), it shows a **Mixed list** widget instead, so each item keeps its own type and stays editable.

## Look at the Properties panel

1. `simpleList` is all strings - a plain list.
2. `mixedList` mixes a string, a number, a boolean, an object, and an array - a **Mixed list**, with a type icon per item.
