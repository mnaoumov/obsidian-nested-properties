---
book: Click here and type a nested value
chapters: Click here and type a list of objects
tags-to-add: Click here and type a list
template: "{{date}}"
---
# Typing nested values

You can create a nested property or a list from the keyboard alone, without opening the **Property type** menu or switching to Source mode: type the value the way YAML writes it on one line, and press **Enter** (or leave the field). The text becomes the value it describes and opens up, so you can read and keep editing it.

| You type | You get |
| --- | --- |
| `{ author: Jane, year: 2024 }` | an object with `author` and `year` |
| `[a, b]` | a list of two items, with the cursor ready for a third |
| `[]` | an empty list, with the cursor ready for its first item |
| `[{ title: Intro }, { title: Outro }]` | a list of two objects |
| `{}` | an empty object, ready for **Add property** |
| `{author:Jane}` | the same as `{ author: Jane }` - the space after the colon is optional |

It works on a nested text entry too: type `{ first: Jane, last: Doe }` into a text value inside an object, and that entry becomes an object of its own.

A list typed into a top-level property changes that note only. The property's type stays as it is for the rest of the vault, so if the property is set to **Text** everywhere, Obsidian shows its usual type-mismatch warning beside the list.

## What stays text

Only a value that looks like a nested value or a list is converted, so ordinary text is never touched:

- a whole value that is one wikilink, such as `[[Some note]]`;
- a template placeholder such as `{{date}}` (like `template` above);
- anything that is not valid YAML.

Inside a list, YAML's own rules apply: write a link in quotes, as in `["[[a]]", "[[b]]"]`. Unquoted, `[[a], [b]]` is a list of two lists.

To keep a value like `{ a: 1 }` as literal text, turn the conversion off in **Settings → `Nested Properties` → Should convert flow collections** (the `shouldConvertFlowCollections` setting, on by default).

<!-- obsidian-dev-toolkit-disable-next-line demo-vault-validation/try-it-code-button -- the feature is typing a value by hand, so a button would skip the very thing this note shows -->
## Try it

**Step 1.** In the Properties panel above, click the value of `book`, replace it with `{ author: Jane, year: 2024 }`, and press **Enter**. `book` turns into an object and opens, showing `author` and `year`.

**Step 2.** Click the value of `chapters`, replace it with `[{ title: Intro }, { title: Outro }]`, and press **Enter**. `chapters` becomes a list of two objects.

**Step 3.** In `book` (expand it if it is collapsed), click the value of `author`, type `{ first: Jane, last: Doe }`, and press **Enter**. `book.author` becomes an object inside `book`.

**Step 4.** Click the value of `tags-to-add`, replace it with `[]`, and press **Enter**. `tags-to-add` becomes an empty list with the cursor in it: type `first`, press **Enter**, type `second`, press **Enter**. The list now holds both, and your hands never left the keyboard.

**Start over.** Switch to Source mode and put the frontmatter back as it is shown at the top of this note's source, or re-download the demo vault.
