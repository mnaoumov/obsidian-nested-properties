---
countAsText: "42"
enabledAsText: "true"
dueDate: 2026-07-18
apiConfig:
  retries: 3
  verbose: false
---
[Docs](https://github.com/mnaoumov/obsidian-nested-properties#features)

# Changing property types

Right-click any nested key and open the **Property type** submenu to convert a value to another type - text, number, checkbox, date, list, or object. Converting a rich value to a simpler one can lose data, so Nested Properties shows a confirmation dialog first.

## Try it

1. Right-click `countAsText`, choose **Property type -> Number**; the string `"42"` becomes the number `42`.
2. Right-click `enabledAsText`, choose **Property type -> Checkbox**; `"true"` becomes a real boolean.
3. Right-click `apiConfig` (an object), choose **Property type -> Text**. Because that would flatten an object into a string, a **Display as text?** confirmation appears - confirm or cancel.
