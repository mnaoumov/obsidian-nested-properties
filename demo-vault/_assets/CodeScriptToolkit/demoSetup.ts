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
