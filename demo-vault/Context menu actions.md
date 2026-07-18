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
[Docs](https://github.com/mnaoumov/obsidian-nested-properties#features)

# Context menu actions

Right-click any nested key for a context menu: **Cut**, **Copy**, **Paste**, and **Remove**. You can also add new properties at any level. Cut, copy, and paste move JSON between nodes, so you can restructure frontmatter without touching the raw YAML.

## Try it

1. Right-click `project.tags`, choose **Copy**, then right-click `project` and choose **Paste** to duplicate it.
2. Use the **Add property** input inside `project.owner` to add a new key.
3. Right-click a key and choose **Remove** to delete it (there is a danger-styled Remove at the bottom of the menu).
