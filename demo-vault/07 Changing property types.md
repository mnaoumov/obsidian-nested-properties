---
countAsText: "42"
enabledAsText: "true"
dueDate: 2026-07-18
apiConfig:
  retries: 3
  verbose: false
  labels:
    - urgent
    - backend
releases:
  - version: "1.0.0"
    released: "2026-03-06"
  - version: "1.1.0"
    released: "2026-03-21"
---
[Docs](https://github.com/mnaoumov/obsidian-nested-properties#nested-property-types)

# Changing property types

Right-click any nested key and open the **Property type** submenu to convert a value to another type - text, number, checkbox, date, list, object, and even **Tags**. Converting a rich value to a simpler one can lose data, so Nested Properties shows a confirmation dialog first. The chosen type is **saved** to the vault's `.obsidian/types.json` under the property's dotted path, so it survives a reload.

## Try it

1. Right-click `countAsText`, choose **Property type -> Number**; the string `"42"` becomes the number `42`.
2. Right-click `enabledAsText`, choose **Property type -> Checkbox**; `"true"` becomes a real boolean.
3. Right-click `apiConfig` (an object), choose **Property type -> Text**. Because that would flatten an object into a string, a **Display as text?** confirmation appears - confirm or cancel.
4. Expand `apiConfig`, right-click `labels`, and choose **Property type -> Tags** - a type Obsidian's own UI won't let you assign. Reload the vault and the choice sticks.
5. Expand a `releases` item and right-click `released`. Use **Property type (all items) -> Date** to type that field for every release at once, or **Property type (this item only)** to override a single one.
