import type { Modifier } from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

const vault = getTemporaryVault();

const NOTE_PATH = 'keyboard-navigation.md';

beforeEach(() => {
  vault.populate({
    [NOTE_PATH]: `---
title: plain
book:
  author: someone
  meta:
    year: 2024
list:
  - name: first
link: plain
---
`
  });
});

interface DriveParams {
  // The top-level property whose row takes the focus first.
  readonly startKey: string;
  readonly steps: readonly Step[];
}

interface DriveResult {
  readonly ariaExpanded: Record<string, null | string>;
  readonly frontmatter: unknown;
  readonly isMenuOpen: boolean;
}

/**
 * One trusted key press, and where the focus must land after it: `row:<path>` for a row (with ` (expanded)` or ` (collapsed)` on an object or list), `value:<path>` for a
 * row's value, `add-property:<path>` / `add-item:<path>` for the nested buttons of the object or list at
 * `<path>`, and `add-button` for Obsidian's own **Add property** button.
 */
interface Step {
  readonly expectedFocus: string;
  readonly key: string;
  readonly modifiers?: readonly Modifier[];
}

// Issue #15: the nested tree is driven from the keyboard with the keys Obsidian's own Properties editor uses.
describe('keyboard navigation of the nested tree', () => {
  it('opens an object with Enter and walks its visible rows with the arrow keys and Tab', async () => {
    const result = await drive({
      startKey: 'book',
      steps: [
        { expectedFocus: 'row:book.author', key: 'Enter' },
        { expectedFocus: 'row:book.meta (collapsed)', key: 'Down' },
        // `book.meta` is collapsed, so its own rows are skipped.
        { expectedFocus: 'add-property:book', key: 'Down' },
        { expectedFocus: 'row:list (collapsed)', key: 'Tab' },
        { expectedFocus: 'add-property:book', key: 'Up' },
        { expectedFocus: 'row:book.meta (collapsed)', key: 'Tab', modifiers: ['Shift'] },
        { expectedFocus: 'row:book.author', key: 'Up' },
        { expectedFocus: 'row:book (expanded)', key: 'Up' }
      ]
    });

    expect(result.ariaExpanded['book']).toBe('true');
  });

  it('expands with ArrowRight, and with ArrowLeft goes to the parent and then collapses it', async () => {
    const result = await drive({
      startKey: 'book',
      steps: [
        { expectedFocus: 'row:book.author', key: 'Right' },
        { expectedFocus: 'row:book.meta (collapsed)', key: 'Down' },
        { expectedFocus: 'row:book.meta.year', key: 'Right' },
        { expectedFocus: 'row:book.meta (expanded)', key: 'Left' },
        { expectedFocus: 'row:book.meta (collapsed)', key: 'Left' },
        { expectedFocus: 'row:book (expanded)', key: 'Left' },
        { expectedFocus: 'row:book (collapsed)', key: 'Left' }
      ]
    });

    expect(result.ariaExpanded['book.meta']).toBe('false');
    expect(result.ariaExpanded['book']).toBe('false');
  });

  it('enters a value with Enter, and returns to its row when the value is committed', async () => {
    await drive({
      startKey: 'book',
      steps: [
        { expectedFocus: 'row:book.author', key: 'Enter' },
        { expectedFocus: 'value:book.author', key: 'Enter' },
        { expectedFocus: 'row:book.author', key: 'Enter' }
      ]
    });
  });

  it('removes a nested entry with Delete and puts the focus on its parent', async () => {
    const result = await drive({
      startKey: 'book',
      steps: [
        { expectedFocus: 'row:book.author', key: 'Enter' },
        { expectedFocus: 'row:book (expanded)', key: 'Delete' }
      ]
    });

    expect(result.frontmatter).toMatchObject({ book: { meta: { year: 2024 } } });
    expect((result.frontmatter as Record<string, Record<string, unknown>>)['book']).not.toHaveProperty('author');
  });

  it('adds a list item from the keyboard and focuses its value', async () => {
    const result = await drive({
      startKey: 'list',
      steps: [
        { expectedFocus: 'row:list.0 (collapsed)', key: 'Enter' },
        { expectedFocus: 'add-item:list', key: 'Down' },
        { expectedFocus: 'value:list.1', key: 'Enter' }
      ]
    });

    expect((result.frontmatter as Record<string, unknown[]>)['list']).toHaveLength(2);
  });

  it('opens the row menu with the context-menu key', async () => {
    const result = await drive({
      startKey: 'book',
      steps: [
        { expectedFocus: 'row:book.author', key: 'Enter' },
        { expectedFocus: 'menu', key: 'F10', modifiers: ['Shift'] }
      ]
    });

    expect(result.isMenuOpen).toBe(true);
  });
});

/**
 * Opens the note, focuses the top-level row of `startKey`, then presses each step's key and waits for the
 * focus to land where the step expects it.
 *
 * @param params - The starting row and the steps.
 * @returns The note's frontmatter and the `aria-expanded` of every collapsible row afterwards.
 */
async function drive(params: DriveParams): Promise<DriveResult> {
  return await evalInObsidian({
    callback: async ({ app, lib, notePath, obsidianModule, startKey, steps }) => {
      const { pressKey, waitUntil } = lib;

      const foundFile = app.vault.getFileByPath(notePath);
      if (!foundFile) {
        throw new Error(`${notePath} not found`);
      }
      const file = foundFile;
      for (const leaf of app.workspace.getLeavesOfType('markdown')) {
        await leaf.setViewState({ type: 'empty' });
      }
      await app.workspace.getLeaf(true).openFile(file);
      await waitUntil({
        message: 'the metadata cache to read the rewritten note',
        predicate: () => app.metadataCache.getFileCache(file)?.frontmatter?.['title'] === 'plain'
      });

      const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
      const containerEl = view?.contentEl ?? activeDocument.body;
      const pathPrefix = `${notePath}:`;

      function stripPrefix(path = ''): string {
        return path.startsWith(pathPrefix) ? path.slice(pathPrefix.length) : path;
      }

      function getRowPath(rowEl: Element | null): string {
        return (rowEl instanceof HTMLElement) ? stripPrefix(rowEl.dataset['path']) || (rowEl.dataset['propertyKey'] ?? '') : '';
      }

      function describeFocus(): string {
        if (activeDocument.querySelector('.menu')) {
          return 'menu';
        }
        const el = activeDocument.activeElement;
        if (!(el instanceof HTMLElement)) {
          return 'none';
        }
        if (el.matches('.metadata-property')) {
          const ariaExpanded = el.getAttribute('aria-expanded');
          const state = ariaExpanded === null ? '' : (ariaExpanded === 'true' ? ' (expanded)' : ' (collapsed)');
          return `row:${getRowPath(el)}${state}`;
        }
        if (el.matches('.nested-properties-add-property, .nested-properties-add-item')) {
          const kind = el.hasClass('nested-properties-add-item') ? 'add-item' : 'add-property';
          return `${kind}:${getRowPath(el.closest('.metadata-property'))}`;
        }
        if (el.matches('.metadata-add-button')) {
          return 'add-button';
        }
        const valueRowEl = el.closest('.metadata-property-value')?.closest('.metadata-property') ?? null;
        return valueRowEl ? `value:${getRowPath(valueRowEl)}` : `other:${el.tagName.toLowerCase()}.${el.className}`;
      }

      const startSelector = `.metadata-property[data-property-key="${CSS.escape(startKey)}"]`;
      await waitUntil({
        message: `the ${startKey} row to render as a nested property`,
        predicate: () => containerEl.querySelector(`${startSelector}.nested-properties-collapsible`) !== null
      });
      containerEl.querySelector<HTMLElement>(startSelector)?.focus();

      for (const step of steps) {
        await pressKey({ key: step.key, modifiers: step.modifiers ?? [] });
        await waitUntil({
          message: `the focus to land on ${step.expectedFocus} after ${step.key}; it is on ${describeFocus()}`,
          predicate: () => describeFocus() === step.expectedFocus
        });
      }

      const isMenuOpen = activeDocument.querySelector('.menu') !== null;
      if (isMenuOpen) {
        await pressKey({ key: 'Escape' });
      }

      // A removed or added entry is written to the note after the editor shows it.
      await waitUntil({
        message: 'the note to hold what the Properties editor shows',
        predicate: () => JSON.stringify(app.metadataCache.getFileCache(file)?.frontmatter ?? {}) === JSON.stringify(view?.metadataEditor.serialize() ?? {})
      });

      const ariaExpanded: Record<string, null | string> = {};
      for (const rowEl of containerEl.querySelectorAll<HTMLElement>('.nested-properties-collapsible')) {
        ariaExpanded[getRowPath(rowEl)] = rowEl.getAttribute('aria-expanded');
      }

      return {
        ariaExpanded,
        frontmatter: app.metadataCache.getFileCache(file)?.frontmatter ?? null,
        isMenuOpen
      };
    },
    input: { notePath: NOTE_PATH, startKey: params.startKey, steps: params.steps },
    vaultPath: vault.path
  });
}
