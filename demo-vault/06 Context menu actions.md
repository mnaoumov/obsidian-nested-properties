---
project:
  name: Demo
  tags:
    - alpha
    - beta
  owner:
    name: Ada
    email: ada@example.com
---
# Context menu actions

Right-click any nested key for a context menu: **Cut**, **Copy**, **Paste**, and **Remove**. You can also add new properties at any level. Cut, copy, and paste move JSON between nodes, so you can restructure frontmatter without touching the raw YAML.

## Try it

1. Right-click `project.tags`, choose **Copy**, then right-click `project` and choose **Paste** to duplicate it.
2. Use the **Add property** input inside `project.owner` to add a new key.
3. Right-click a key and choose **Remove** to delete it (there is a danger-styled Remove at the bottom of the menu).

The steps themselves are right-clicks in the Properties panel, so they stay yours. They rewrite this note's own frontmatter, though, so after one pass there is nothing left to try them on. The button below puts `project` back to how it shipped:

```code-button
---
caption: Reset this note's properties
---
await require('/demoSetup.ts').resetContextMenuDemo(app);
```

Manual equivalent: restore the frontmatter at the top of this note by hand, or in source mode.
