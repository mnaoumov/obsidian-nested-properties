---
project:
  meta:
    owner: alice
    status: active
  release:
    channel: beta
---
# Vault-wide rename and delete

Obsidian's built-in **Properties view: Show all properties** lists only *top-level* property names, so nested keys like `project.meta.owner` cannot be renamed or removed across the whole vault from there. This plugin adds two commands that operate on nested properties across **every** note that contains them:

- **Rename a nested property in all notes**
  - pick a nested path (shown with the number of notes that use it), then type the new dotted path.
- **Delete a nested property from all notes**
  - pick a nested path and confirm; it is removed from every note that has it.

## Seed a few notes first

Vault-wide operations only shine across **several** notes. The button below creates a `Vault-wide demo` folder with three project notes that all share `project.meta.owner` and `project.release.channel` (this note shares them too). Manual equivalent: create a couple of notes yourself with the same nested frontmatter.

```code-button
---
caption: Seed vault-wide demo notes
---
await require('/demoSetup.ts').seedVaultWideDemoNotes(app);
```

## Try it

1. Click **Seed vault-wide demo notes** above (or add your own notes with a shared nested key).
2. Run the **Rename a nested property in all notes** command. Choose `project.meta.owner` - the picker shows how many notes use it - and enter `project.meta.maintainer`. Every note that had `project.meta.owner` now uses the new key.
3. Run the **Delete a nested property from all notes** command, choose `project.release.channel`, and confirm - it is removed everywhere, while sibling keys like `project.meta.status` are left intact.

Only nested paths (two or more segments) are offered; plain top-level keys are still managed by Obsidian's own "All properties" view. When renaming, notes where the target path already exists are skipped so nothing is overwritten.
