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

**Step 1.** Click **Seed vault-wide demo notes** above (or add your own notes with a shared nested key).

**Step 2.** Run the **Rename a nested property in all notes** command. Choose `project.meta.owner` - the picker shows how many notes use it - and enter `project.meta.maintainer`. Every note that had `project.meta.owner` now uses the new key.

```code-button
---
caption: Rename a nested property in all notes
---
require('/demoSetup.ts').runCommand(app, 'rename-nested-property-across-vault');
```

**Step 3.** Run the **Delete a nested property from all notes** command, choose `project.release.channel`, and confirm - it is removed everywhere, while sibling keys like `project.meta.status` are left intact.

```code-button
---
caption: Delete a nested property from all notes
---
require('/demoSetup.ts').runCommand(app, 'delete-nested-property-across-vault');
```

Manual equivalent for both: the Command Palette entries of the same names. Each opens a picker, so the choosing is still yours.

Both operations change the seeded notes, so press **Seed vault-wide demo notes** again to start over - it rewrites them. When you have finished with this note and [10 Search nested properties](<./10 Search nested properties.md>), clear up:

```code-button
---
caption: Remove the seeded demo folders
---
await require('/demoSetup.ts').removeDemoFolders(app);
```

Manual equivalent: delete the `Vault-wide demo` and `Search demo` folders.

Only nested paths (two or more segments) are offered; plain top-level keys are still managed by Obsidian's own "All properties" view. When renaming, notes where the target path already exists are skipped so nothing is overwritten.
