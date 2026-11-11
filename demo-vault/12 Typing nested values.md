---
book: Click here and type a nested value
chapters: Click here and type a list of objects
template: "{{date}}"
---
# Typing nested values

You can create a nested property from the keyboard alone, without opening the **Property type** menu or switching to Source mode: type the value the way YAML writes it on one line, and press **Enter** (or leave the field). The text becomes the nested value it describes and opens up, so you can read and keep editing it.

| You type | You get |
| --- | --- |
| `{ author: Jane, year: 2024 }` | an object with `author` and `year` |
| `[{ title: Intro }, { title: Outro }]` | a list of two objects |
| `{}` | an empty object, ready for **Add property** |
| `{author:Jane}` | the same as `{ author: Jane }` - the space after the colon is optional |

It works on a nested text entry too: type `{ first: Jane, last: Doe }` into a text value inside an object, and that entry becomes an object of its own.

## What stays text

Only a value that looks like a nested value is converted, so ordinary text is never touched:

- a wikilink to another note;
- a template placeholder such as `{{date}}` (like `template` above);
- a plain list such as `[a, b]` - use Obsidian's own **List** type for those;
- anything that is not valid YAML.

To keep a value like `{ a: 1 }` as literal text, turn the conversion off in **Settings → `Nested Properties` → Should convert flow collections** (the `shouldConvertFlowCollections` setting, on by default).

<!-- obsidian-dev-toolkit-disable-next-line demo-vault-validation/try-it-code-button -- the feature is typing a value by hand, so a button would skip the very thing this note shows -->
## Try it

**Step 1.** In the Properties panel above, click the value of `book`, replace it with `{ author: Jane, year: 2024 }`, and press **Enter**. `book` turns into an object and opens, showing `author` and `year`.

**Step 2.** Click the value of `chapters`, replace it with `[{ title: Intro }, { title: Outro }]`, and press **Enter**. `chapters` becomes a list of two objects.

**Step 3.** In `book` (expand it if it is collapsed), click the value of `author`, type `{ first: Jane, last: Doe }`, and press **Enter**. `book.author` becomes an object inside `book`.

**Start over.** Switch to Source mode and put the frontmatter back as it is shown at the top of this note's source, or re-download the demo vault.
