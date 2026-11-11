---
book:
  author: Jane
  details:
    year: 2024
    publisher: Acme
chapters:
  - title: Intro
  - title: Outro
status: draft
---
# Keyboard navigation

You can move through nested properties, open and close them, edit them and remove them with the keyboard alone. The keys are the ones Obsidian already uses for its own properties, so nothing new needs learning. A nested property works like a list of rows, and an object or list row opens onto its children.

Focus a row first: click a property's name and press **Escape**, which leaves the name as it is and puts the focus on the whole row.

| Key | On a row |
| --- | --- |
| **↓** or **j**, **Tab** | Next row, skipping the rows inside anything collapsed |
| **↑** or **k**, **Shift+Tab** | Previous row |
| **Enter**, **Space** or **→** | Edit a value; on an object or list, open it and go to its first row |
| **A** / **i** | Edit a value with the cursor at its end / start |
| **←** | Close an open object or list; otherwise go to the row it sits in |
| **Delete** (**Cmd+Backspace** on macOS) | Remove the entry |
| **o** | Add a property (or an item) next to this one |
| **Shift+F10** or the **Menu** key | Open the row's menu: type, cut, copy, paste, remove |

**Add property** and **Add item** are rows too: **Enter** or **Space** presses them. When you finish editing a value with **Enter**, the focus goes back to its row, so you can keep moving.

<!-- obsidian-dev-toolkit-disable-next-line demo-vault-validation/try-it-code-button -- the feature is pressing keys by hand, so a button would skip the very thing this note shows -->
## Try it

**Step 1.** Click the name `book` in the Properties panel above and press **Escape**, then press **Enter**. `book` opens and its first row, `author`, has the focus.

**Step 2.** Press **↓** to reach `details`, then **→** to open it. Press **↓** to go through `year` and `publisher`, and on to **Add property**.

**Step 3.** Press **↑** back to `publisher` and **Enter** to edit it. Type a new name and press **Enter**. The focus returns to the `publisher` row.

**Step 4.** Press **←** to go to `details`, then **←** again to close it.

**Step 5.** Go down to `chapters`, open it, and on its **Add item** press **Enter**. A new item appears with its value ready to type into.

**Step 6.** On any nested row, press **Delete** to remove it.

**Start over.** Switch to Source mode and put the frontmatter back as it is shown at the top of this note's source, or re-download the demo vault.
