import type { App } from 'obsidian';

import { Notice } from 'obsidian';

const FULL_KEY_DISPLAY_COMMAND_ID = 'nested-properties:toggle-full-key-display';
const VAULT_WIDE_DEMO_FOLDER = 'Vault-wide demo';
const SEARCH_DEMO_FOLDER = 'Search demo';

// Nested Properties has a single live setting - full key display - toggled by a command that flips a
// body class across all windows with no reload. So the demo just runs that command (the same thing the
// command palette and the Properties-header button do); there is no data.json patch + reload to perform.
export function toggleFullKeyDisplay(app: App): void {
  app.commands.executeCommandById(FULL_KEY_DISPLAY_COMMAND_ID);
  new Notice('Toggled full key display.');
}

// Vault-wide rename/delete only makes sense across MANY notes, which a single demo note cannot show. This
// seeds a folder of notes that all share `project.meta.owner` and `project.release.channel`, so running
// the rename/delete command lists the shared nested path with a note count and changes every note at once.
export async function seedVaultWideDemoNotes(app: App): Promise<void> {
  const notes: Record<string, string> = {
    [`${VAULT_WIDE_DEMO_FOLDER}/Project Alpha.md`]:
      `---\nproject:\n  meta:\n    owner: alice\n    status: active\n  release:\n    channel: beta\n---\n`,
    [`${VAULT_WIDE_DEMO_FOLDER}/Project Bravo.md`]:
      `---\nproject:\n  meta:\n    owner: bob\n    status: paused\n  release:\n    channel: stable\n---\n`,
    [`${VAULT_WIDE_DEMO_FOLDER}/Project Charlie.md`]:
      `---\nproject:\n  meta:\n    owner: carol\n    status: active\n  release:\n    channel: beta\n---\n`
  };
  await writeDemoNotes(app, VAULT_WIDE_DEMO_FOLDER, notes);
  new Notice(`Seeded ${String(Object.keys(notes).length)} notes sharing project.meta.owner. Now run the rename or delete command.`);
}

// The search command finds notes by a nested property across the whole vault. This seeds a folder of
// notes with varying `book.author` / `book.genres` so a query like `book.genres: fantasy` returns more
// than one match and the picker is meaningful.
export async function seedSearchDemoNotes(app: App): Promise<void> {
  const notes: Record<string, string> = {
    [`${SEARCH_DEMO_FOLDER}/A Wizard of Earthsea.md`]:
      `---\nbook:\n  author: Ursula K. Le Guin\n  genres:\n    - fantasy\n    - sci-fi\n---\n`,
    [`${SEARCH_DEMO_FOLDER}/The Hobbit.md`]:
      `---\nbook:\n  author: J.R.R. Tolkien\n  genres:\n    - fantasy\n---\n`,
    [`${SEARCH_DEMO_FOLDER}/Dune.md`]:
      `---\nbook:\n  author: Frank Herbert\n  genres:\n    - sci-fi\n---\n`
  };
  await writeDemoNotes(app, SEARCH_DEMO_FOLDER, notes);
  new Notice(`Seeded ${String(Object.keys(notes).length)} books. Now run "Find notes by nested property" and try book.genres: fantasy.`);
}

// Both seeders above are idempotent - pressing one again rewrites its notes - so re-seeding IS the
// reset after a vault-wide rename or delete. What re-seeding cannot do is get rid of the folders, so
// this removes them once you are done.
export async function removeDemoFolders(app: App): Promise<void> {
  let removedCount = 0;
  for (const folder of [VAULT_WIDE_DEMO_FOLDER, SEARCH_DEMO_FOLDER]) {
    const abstractFile = app.vault.getFolderByPath(folder);
    if (abstractFile) {
      await app.fileManager.trashFile(abstractFile);
      removedCount++;
    }
  }
  new Notice(removedCount > 0 ? `Removed ${String(removedCount)} demo folder(s).` : 'No demo folders to remove.');
}

// Runs one of the plugin's vault-wide commands. Both open a picker, so the choosing stays yours - this
// only saves hunting through the command palette while reading about them.
export function runCommand(app: App, commandId: string): void {
  app.commands.executeCommandById(`nested-properties:${commandId}`);
}

// `07 Changing property types` is the one cumulative walkthrough here: each conversion rewrites this
// note's own frontmatter AND records the chosen type in `.obsidian/types.json`, which the note points
// out survives a reload. Without this, trying step 3 twice is impossible - the second run starts from
// the converted value rather than the original.
export async function resetPropertyTypesDemo(app: App): Promise<void> {
  const NOTE_PATH = '07 Changing property types.md';
  const ORIGINAL_FRONTMATTER = [
    'countAsText: "42"',
    'enabledAsText: "true"',
    'dueDate: 2026-07-18',
    'apiConfig:',
    '  retries: 3',
    '  verbose: false',
    '  labels:',
    '    - urgent',
    '    - backend',
    'releases:',
    '  - version: "1.0.0"',
    '    released: "2026-03-06"',
    '  - version: "1.1.0"',
    '    released: "2026-03-21"'
  ].join('\n');

  const note = app.vault.getFileByPath(NOTE_PATH);
  if (!note) {
    new Notice(`${NOTE_PATH} is not in this vault.`);
    return;
  }

  await app.vault.process(note, (content) => {
    const match = /^---\n[\s\S]*?\n---\n/.exec(content);
    const body = match ? content.slice(match[0].length) : content;
    return `---\n${ORIGINAL_FRONTMATTER}\n---\n${body}`;
  });

  await forgetDemoPropertyTypes(app);
  new Notice('Property-type demo reset — frontmatter and saved types are back to how they shipped.');
}

// Unset through `metadataTypeManager.unsetType`, the same API the plugin itself writes with
// (`nested-property-renderer.ts`), rather than editing `.obsidian/types.json` behind Obsidian's back —
// The manager holds the map in memory and would overwrite a hand-edited file on its next save.
// The chosen type is stored under the property's DOTTED path, so the demo's entries are the ones whose
// Key is or starts with one of these. Anything you typed yourself is left alone.
async function forgetDemoPropertyTypes(app: App): Promise<void> {
  const DEMO_TYPE_KEYS = ['countAsText', 'enabledAsText', 'dueDate', 'apiConfig', 'releases'];
  // `assignedWidgets` is the map of keys with an EXPLICITLY assigned type — the ones `unsetType`
  // Clears. Not `properties`, which also lists every property merely seen in the vault.
  const typeKeys = Object.keys(app.metadataTypeManager.assignedWidgets ?? {});

  for (const typeKey of typeKeys) {
    if (DEMO_TYPE_KEYS.some((demoKey) => typeKey === demoKey || typeKey.startsWith(`${demoKey}.`))) {
      await app.metadataTypeManager.unsetType(typeKey);
    }
  }
}

async function writeDemoNotes(app: App, folder: string, notes: Record<string, string>): Promise<void> {
  if (!app.vault.getAbstractFileByPath(folder)) {
    await app.vault.createFolder(folder);
  }
  for (const [path, content] of Object.entries(notes)) {
    const existing = app.vault.getFileByPath(path);
    if (existing) {
      await app.vault.modify(existing, content);
    } else {
      await app.vault.create(path, content);
    }
  }
}
