import type {
  App,
  TFile
} from 'obsidian';

import { Notice } from 'obsidian';

const FULL_KEY_DISPLAY_COMMAND_ID = 'nested-properties:toggle-full-key-display';
const VAULT_WIDE_DEMO_FOLDER = 'Vault-wide demo';
const SEARCH_DEMO_FOLDER = 'Search demo';

const FULL_KEY_DISPLAY_BODY_CLASS = 'nested-properties-full-key-display';
const CONTEXT_MENU_NOTE_PATH = '06 Context menu actions.md';
const INITIAL_EXPAND_LEVEL_NOTE_PATH = '11 Initial expand level.md';
const SHIPPED_INITIAL_EXPAND_LEVEL = 2;

// Full key display is toggled by a command that flips a body class across all windows with no reload. So
// the demo just runs that command (the same thing the command palette and the Properties-header button
// do); there is no data.json patch + reload to perform. It throws when the class did not flip, so a click
// that changed nothing is reported rather than shown as a success.
export function toggleFullKeyDisplay(app: App): void {
  const wasEnabled = activeDocument.body.hasClass(FULL_KEY_DISPLAY_BODY_CLASS);
  app.commands.executeCommandById(FULL_KEY_DISPLAY_COMMAND_ID);
  const isEnabled = activeDocument.body.hasClass(FULL_KEY_DISPLAY_BODY_CLASS);
  if (isEnabled === wasEnabled) {
    throw new Error('Full key display did not toggle. Is the Nested Properties plugin enabled?');
  }
  new Notice(isEnabled ? 'Full key display is on: keys show their full text.' : 'Full key display is off: long keys are truncated again.');
}

// The context-menu walkthrough copies, pastes and removes keys in its own note, so after one pass there is
// nothing left to try it on. This puts that note's frontmatter back to how it shipped.
export async function resetContextMenuDemo(app: App): Promise<void> {
  await replaceFrontmatter(app, CONTEXT_MENU_NOTE_PATH, [
    'project:',
    '  name: Demo',
    '  tags:',
    '    - alpha',
    '    - beta',
    '  owner:',
    '    name: Ada',
    '    email: ada@example.com'
  ].join('\n'));
  new Notice('Context-menu demo reset: project is back to how it shipped.');
}

// Opens Obsidian's own search pane with a query typed in - the same as opening the pane and typing it.
// It throws when the pane does not end up holding the query, so a search pane that never opened is
// reported rather than shown as a success.
export async function searchFor(app: App, query: string): Promise<void> {
  const existingSearchLeaf = app.workspace.getLeavesOfType('search')[0];
  const searchLeaf = existingSearchLeaf ?? app.workspace.getLeftLeaf(false);
  if (!searchLeaf) {
    throw new Error('Could not open the search pane.');
  }
  if (!existingSearchLeaf) {
    await searchLeaf.setViewState({ active: true, type: 'search' });
  }
  await app.workspace.revealLeaf(searchLeaf);

  const searchView = searchLeaf.view as unknown as Partial<{ getQuery(): string; setQuery(value: string): void }>;
  if (typeof searchView.setQuery !== 'function' || typeof searchView.getQuery !== 'function') {
    throw new Error('The search pane did not open. Is the core Search plugin enabled?');
  }
  searchView.setQuery(query);
  if (searchView.getQuery() !== query) {
    throw new Error(`The search pane did not take the query ${query}.`);
  }
}

// Sets `nestedProperties.initialExpandLevel` in the expand-level note, or removes the override when given
// `null`, then shows the note in a second tab rendered at the new level. The level applies when a note is
// opened, and the tab holding the button is left alone: rebuilding it would redraw the button mid-click.
// A second press reuses that tab rather than opening another.
export async function setNoteInitialExpandLevel(app: App, level: null | number): Promise<void> {
  const note = getNote(app, INITIAL_EXPAND_LEVEL_NOTE_PATH);
  await app.fileManager.processFrontMatter(note, (frontmatter: Record<string, unknown>) => {
    if (level === null) {
      delete frontmatter['nestedProperties'];
    } else {
      frontmatter['nestedProperties'] = { initialExpandLevel: level };
    }
  });

  await reopenExpandLevelNote(app, level ?? undefined);
  new Notice(
    level === null
      ? 'Removed the per-note override: the note now uses the plugin setting. It is reopened in the next tab.'
      : `Set this note's initial expand level to ${String(level)}. It is reopened in the next tab.`
  );
}

// Puts the expand-level note's frontmatter back to how it shipped, override and all.
export async function resetInitialExpandLevelDemo(app: App): Promise<void> {
  await replaceFrontmatter(app, INITIAL_EXPAND_LEVEL_NOTE_PATH, [
    'nestedProperties:',
    `  initialExpandLevel: ${String(SHIPPED_INITIAL_EXPAND_LEVEL)}`,
    'generated:',
    '  by: human',
    '  at: 2026-02-09',
    '  foo:',
    '    - bar: 1',
    '    - baz: 2'
  ].join('\n'));
  await reopenExpandLevelNote(app, SHIPPED_INITIAL_EXPAND_LEVEL);
  new Notice(`Expand-level demo reset: the note is back to level ${String(SHIPPED_INITIAL_EXPAND_LEVEL)}. It is reopened in the next tab.`);
}

// Waits until the metadata cache holds the expected override, so the reopened note renders at that level
// rather than the previous one, then shows the note in the tab next to the one holding the button.
async function reopenExpandLevelNote(app: App, expectedLevel: number | undefined): Promise<void> {
  const note = getNote(app, INITIAL_EXPAND_LEVEL_NOTE_PATH);
  await waitFor(() => {
    const nestedProperties = app.metadataCache.getFileCache(note)?.frontmatter?.['nestedProperties'] as undefined | { initialExpandLevel?: unknown };
    return nestedProperties?.initialExpandLevel === expectedLevel;
  }, `${INITIAL_EXPAND_LEVEL_NOTE_PATH} did not pick up the new level.`);

  const activeLeaf = app.workspace.getMostRecentLeaf();
  const otherLeaf = app.workspace.getLeavesOfType('markdown').find((leaf) =>
    leaf !== activeLeaf && (leaf.view as { file?: { path: string } }).file?.path === note.path
  );
  let reopenedLeaf = otherLeaf;
  if (reopenedLeaf) {
    await reopenedLeaf.rebuildView();
  } else {
    reopenedLeaf = app.workspace.getLeaf('tab');
    await reopenedLeaf.openFile(note, { active: false });
  }

  // With no override the level is the plugin setting, which this note cannot know, so only an explicit
  // level is checked against what the reopened note actually drew.
  if (expectedLevel === undefined) {
    return;
  }
  const containerEl = reopenedLeaf.view.containerEl;
  const generatedSelector = `.nested-properties-collapsible[data-path="${CSS.escape(note.path)}:generated"]`;
  await waitFor(() => {
    const generatedEl = containerEl.querySelector(generatedSelector);
    return generatedEl !== null && generatedEl.hasClass('is-collapsed') === (expectedLevel === 0);
  }, `The reopened note did not render generated ${expectedLevel === 0 ? 'collapsed' : 'expanded'}.`);
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

  await replaceFrontmatter(app, NOTE_PATH, ORIGINAL_FRONTMATTER);
  await forgetDemoPropertyTypes(app);
  new Notice('Property-type demo reset — frontmatter and saved types are back to how they shipped.');
}

// Unset through `metadataTypeManager.unsetType`, the same API the plugin itself writes with
// (`nested-property-renderer.ts`), rather than editing `.obsidian/types.json` behind Obsidian's back —
// the manager holds the map in memory and would overwrite a hand-edited file on its next save.
// The chosen type is stored under the property's DOTTED path, so the demo's entries are the ones whose
// key is or starts with one of these. Anything you typed yourself is left alone.
async function forgetDemoPropertyTypes(app: App): Promise<void> {
  const DEMO_TYPE_KEYS = ['countAsText', 'enabledAsText', 'dueDate', 'apiConfig', 'releases'];
  // `assignedWidgets` is the map of keys with an EXPLICITLY assigned type — the ones `unsetType`
  // clears. Not `properties`, which also lists every property merely seen in the vault.
  const typeKeys = Object.keys(app.metadataTypeManager.assignedWidgets ?? {});

  for (const typeKey of typeKeys) {
    if (DEMO_TYPE_KEYS.some((demoKey) => typeKey === demoKey || typeKey.startsWith(`${demoKey}.`))) {
      await app.metadataTypeManager.unsetType(typeKey);
    }
  }
}

function getNote(app: App, path: string): TFile {
  const note = app.vault.getFileByPath(path);
  if (!note) {
    throw new Error(`${path} is not in this vault.`);
  }
  return note;
}

// Rewrites a note's whole frontmatter block as text, keeping its body. Text rather than
// `processFrontMatter`, so the keys come back in the order the note shipped with.
async function replaceFrontmatter(app: App, path: string, frontmatter: string): Promise<void> {
  await app.vault.process(getNote(app, path), (content) => {
    const match = /^---\n[\s\S]*?\n---\n/.exec(content);
    const body = match ? content.slice(match[0].length) : content;
    return `---\n${frontmatter}\n---\n${body}`;
  });
}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  const TIMEOUT_IN_MILLISECONDS = 5000;
  const POLL_INTERVAL_IN_MILLISECONDS = 50;
  const deadline = Date.now() + TIMEOUT_IN_MILLISECONDS;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(message);
    }
    await sleep(POLL_INTERVAL_IN_MILLISECONDS);
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
