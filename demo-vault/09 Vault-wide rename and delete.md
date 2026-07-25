---
project:
  meta:
    owner: alice
    status: active
  release:
    channel: beta
---
[Docs](https://github.com/mnaoumov/obsidian-nested-properties#commands)

# Vault-wide rename and delete

Obsidian's built-in **Properties view: Show all properties** lists only *top-level* property names, so nested keys like `project.meta.owner` cannot be renamed or removed across the whole vault from there. This plugin adds two commands that operate on nested properties across **every** note that contains them:

- **Rename a nested property in all notes** - pick a nested path (shown with the number of notes that use it), then type the new dotted path.
- **Delete a nested property from all notes** - pick a nested path and confirm; it is removed from every note that has it.

## Try it

1. Note the nested frontmatter above (`project.meta.owner`, `project.meta.status`, `project.release.channel`).
2. Run the **Rename a nested property in all notes** command, choose `project.meta.owner`, and enter `project.meta.maintainer` - every note that had `project.meta.owner` now uses the new key.
3. Run the **Delete a nested property from all notes** command, choose `project.release.channel`, and confirm - it is removed everywhere.

Only nested paths (two or more segments) are offered; plain top-level keys are still managed by Obsidian's own "All properties" view. When renaming, notes where the target path already exists are skipped so nothing is overwritten.
