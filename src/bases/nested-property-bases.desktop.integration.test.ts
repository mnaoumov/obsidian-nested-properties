/**
 * @file
 *
 * Nested properties in Bases (issue #17), against a real Obsidian. Bases reads `note.book.author` as one top-level
 * key spelled `book.author`, so without `NestedPropertyBasesPatchComponent` the column is empty, the picker never
 * offers it and sorting on it does nothing. This drives a real table view the way a user does and checks all four
 * effects: the Properties picker offers a nested path that is not a column yet, the cell shows the nested value,
 * sorting orders by it, and typing into the cell writes the nested key back into the note.
 *
 * Desktop-only: the file name alone picks the project. Android is deferred for the same reason as the other
 * desktop suites here: no emulator is provisioned, so an Android entry could not be verified green.
 */

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

interface BasesResult {
  readonly cellTexts: string[];
  readonly editedContent: string;
  readonly pickerNames: string[];
  readonly rowPaths: string[];
}

async function runBasesScenario(): Promise<BasesResult> {
  return await evalInObsidian({
    async callback({ app, lib: { clickElement, pressKey, waitUntil } }) {
      const FOLDER = 'np-bases';
      const URSULA_PATH = `${FOLDER}/a-ursula.md`;
      const HERBERT_PATH = `${FOLDER}/b-herbert.md`;
      const NONE_PATH = `${FOLDER}/c-none.md`;
      const BASE_PATH = 'np-bases.base';
      const NEW_AUTHOR = 'Le Guin';

      async function cleanup(): Promise<void> {
        for (const path of [URSULA_PATH, HERBERT_PATH, NONE_PATH, FOLDER, BASE_PATH]) {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) {
            await app.fileManager.trashFile(existing);
          }
        }
      }

      await cleanup();
      await app.vault.createFolder(FOLDER);
      const ursulaFile = await app.vault.create(URSULA_PATH, '---\nbook:\n  author: Ursula\n  year: 1969\n---\n');
      const herbertFile = await app.vault.create(HERBERT_PATH, '---\nbook:\n  author: Herbert\n  year: 1970\n---\n');
      await app.vault.create(NONE_PATH, '---\ntitle: none\n---\n');
      const baseFile = await app.vault.create(
        BASE_PATH,
        [
          'filters:',
          '  and:',
          `    - file.inFolder("${FOLDER}")`,
          'views:',
          '  - type: table',
          '    name: Table',
          '    order:',
          '      - file.name',
          '      - note.book.author',
          '    sort:',
          '      - property: note.book.author',
          '        direction: ASC',
          ''
        ].join('\n')
      );

      const leaf = app.workspace.getLeaf('tab');
      try {
        await waitUntil({
          message: 'the seeded notes did not reach the metadata cache',
          predicate: () =>
            Boolean(app.metadataCache.getFileCache(ursulaFile)?.frontmatter?.['book'])
            && Boolean(app.metadataCache.getFileCache(herbertFile)?.frontmatter?.['book'])
        });
        await leaf.openFile(baseFile);
        const { containerEl } = leaf.view;

        function getRowPaths(): string[] {
          return [...containerEl.querySelectorAll<HTMLElement>(':scope .bases-tbody .bases-tr')]
            .map((rowEl) => rowEl.querySelector<HTMLElement>(':scope [data-property="file.name"] [data-href]')?.dataset['href'] ?? '');
        }

        function getAuthorCellEl(path: string): HTMLElement | null {
          const rowEl = [...containerEl.querySelectorAll<HTMLElement>(':scope .bases-tbody .bases-tr')]
            .find((el) => el.querySelector(`:scope [data-property="file.name"] [data-href="${CSS.escape(path)}"]`) !== null);
          return rowEl?.querySelector<HTMLElement>(':scope [data-property="note.book.author"]') ?? null;
        }

        await waitUntil({
          message: 'the table rows did not render',
          predicate: () => getRowPaths().length === 3 && getAuthorCellEl(URSULA_PATH)?.textContent === 'Ursula'
        });
        const rowPaths = getRowPaths();
        const cellTexts = rowPaths.map((path) => getAuthorCellEl(path)?.textContent ?? '');

        // The Properties picker lists `book.year` although no column shows it yet.
        const menuItemSelector = '.menu.bases-toolbar-properties-menu .bases-toolbar-menu-item-name';
        // On a loaded machine a click can land while Bases is still laying out its toolbar and open nothing, so a
        // poll that finds no menu clicks the freshly queried button again. The interval leaves each click time to open it.
        await waitUntil({
          intervalInMilliseconds: 1000,
          message: 'the Properties menu did not open',
          async predicate() {
            if (activeDocument.querySelector(menuItemSelector) !== null) {
              return true;
            }
            const propertiesButtonEl = containerEl.querySelector<HTMLElement>(':scope .bases-toolbar-properties-menu .text-icon-button');
            if (propertiesButtonEl) {
              await clickElement({ element: propertiesButtonEl });
            }
            return false;
          },
          timeoutInMilliseconds: 9000
        });
        const pickerNames = [...activeDocument.querySelectorAll(menuItemSelector)].map((el) => el.textContent);
        await pressKey({ key: 'Escape' });

        // Typed with real key presses over the selected old value, exactly as a user replaces it.
        const inputEl = getAuthorCellEl(URSULA_PATH)?.querySelector<HTMLElement>(':scope .metadata-input-longtext');
        if (!inputEl) {
          throw new Error('the author cell editor did not render');
        }
        await clickElement({ element: inputEl });
        await waitUntil({ message: 'the author cell editor did not take focus', predicate: () => activeDocument.activeElement === inputEl });
        activeWindow.getSelection()?.selectAllChildren(inputEl);
        for (const character of NEW_AUTHOR) {
          await pressKey({ key: character });
        }
        await pressKey({ key: 'Enter' });

        function getUrsulaAuthor(): unknown {
          const book: unknown = app.metadataCache.getFileCache(ursulaFile)?.frontmatter?.['book'];
          return (book as Record<string, unknown> | undefined)?.['author'];
        }

        await waitUntil({
          message: 'the edited author did not reach the note',
          predicate: () => getUrsulaAuthor() === NEW_AUTHOR
        });
        const editedContent = await app.vault.read(ursulaFile);

        return { cellTexts, editedContent, pickerNames, rowPaths };
      } finally {
        leaf.detach();
        await cleanup();
      }
    },
    vaultPath: getTemporaryVault().path
  });
}

describe('Bases understands nested properties', () => {
  let result: BasesResult;

  beforeAll(async () => {
    result = await runBasesScenario();
  });

  it('should show the nested value in a note.book.author column', () => {
    expect(result.cellTexts).toEqual(['Herbert', 'Ursula', '']);
  });

  it('should sort by the nested value', () => {
    expect(result.rowPaths).toEqual(['np-bases/b-herbert.md', 'np-bases/a-ursula.md', 'np-bases/c-none.md']);
  });

  it('should offer nested paths in the Properties picker', () => {
    expect(result.pickerNames).toContain('book.year');
  });

  it('should write an in-place edit back into the nested key', () => {
    expect(result.editedContent).toBe('---\nbook:\n  author: Le Guin\n  year: 1969\n---\n');
  });
});
