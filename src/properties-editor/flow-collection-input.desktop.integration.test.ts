import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

const vault = getTemporaryVault();

beforeEach(() => {
  vault.populate({
    'flow-collection-input.md': `---
title: plain
book:
  author: someone
link: plain
---
`
  });
});

interface CommitParams {
  readonly propertyPath: string;
  readonly text: string;
}

interface CommitResult {
  readonly frontmatterValue: unknown;
  readonly isCollapsed: boolean | null;
}

// Issue #15: a nested value can be entered from the keyboard alone, by typing it in YAML flow style and
// pressing Enter, which is how Obsidian's text widget commits a value.
describe('typing a flow collection into a text property', () => {
  it('turns a top-level text property into an expanded object', async () => {
    const result = await commit({ propertyPath: 'title', text: '{ author: Jane, year: 2024 }' });

    expect(result.frontmatterValue).toEqual({ author: 'Jane', year: 2024 });
    expect(result.isCollapsed).toBe(false);
  });

  it('turns a top-level text property into a list of objects, typed with no spaces', async () => {
    const result = await commit({ propertyPath: 'title', text: '[{key:value}]' });

    expect(result.frontmatterValue).toEqual([{ key: 'value' }]);
    expect(result.isCollapsed).toBe(false);
  });

  it('turns a nested text entry into an expanded object', async () => {
    const result = await commit({ propertyPath: 'book.author', text: '{ first: Jane, last: Doe }' });

    expect(result.frontmatterValue).toEqual({ first: 'Jane', last: 'Doe' });
    expect(result.isCollapsed).toBe(false);
  });

  it('leaves a wikilink as text', async () => {
    const result = await commit({ propertyPath: 'link', text: '[[Some note]]' });

    expect(result.frontmatterValue).toBe('[[Some note]]');
    expect(result.isCollapsed).toBeNull();
  });
});

/**
 * Opens the note, types `text` into the text widget of the property at `propertyPath` and presses Enter,
 * then reports the value saved to the frontmatter and whether the property now renders as a collapsed or
 * expanded nested property (`null` when it does not render as one).
 *
 * @param params - The property and the text to type.
 */
async function commit(params: CommitParams): Promise<CommitResult> {
  return await evalInObsidian({
    callback: async ({ app, lib, obsidianModule, propertyPath, text }) => {
      const { pressKey, waitUntil } = lib;
      const notePath = 'flow-collection-input.md';

      const foundFile = app.vault.getFileByPath(notePath);
      if (!foundFile) {
        throw new Error(`${notePath} not found`);
      }
      const file = foundFile;
      // A leaf a previous test left on this note keeps its own copy of the properties and can write it back
      // over this test's edit, so the note is open in exactly one leaf.
      for (const leaf of app.workspace.getLeavesOfType('markdown')) {
        await leaf.setViewState({ type: 'empty' });
      }
      await app.workspace.getLeaf(true).openFile(file);

      // The note was just rewritten for this test. Until the metadata cache has read it, the Properties editor
      // can redraw the rows under the test's hands, and an edit typed into a replaced row is lost.
      await waitUntil({
        message: 'the metadata cache to read the rewritten note',
        predicate: () => app.metadataCache.getFileCache(file)?.frontmatter?.['title'] === 'plain'
      });

      const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
      const containerEl = view?.contentEl ?? activeDocument.body;
      const segments = propertyPath.split('.');
      const topLevelKey = segments[0] ?? '';
      const topLevelSelector = `.metadata-property[data-property-key="${CSS.escape(topLevelKey)}"]`;

      function getFrontmatterValue(): unknown {
        let value: unknown = app.metadataCache.getFileCache(file)?.frontmatter;
        for (const segment of segments) {
          value = (value as Record<string, unknown> | undefined)?.[segment];
        }
        return value;
      }

      function findInputEl(): HTMLElement | null {
        const topLevelEl = containerEl.querySelector(topLevelSelector);
        if (!topLevelEl) {
          return null;
        }
        if (segments.length === 1) {
          return topLevelEl.querySelector<HTMLElement>(':scope > .metadata-property-value .metadata-input-longtext');
        }
        for (const keyInputEl of topLevelEl.querySelectorAll<HTMLInputElement>(':scope .nested-properties-container .metadata-property-key-input')) {
          if (keyInputEl.value === segments.at(-1)) {
            return keyInputEl.closest('.metadata-property')?.querySelector<HTMLElement>(':scope > .metadata-property-value .metadata-input-longtext') ?? null;
          }
        }
        return null;
      }

      await waitUntil({
        message: `the text widget of ${propertyPath} to render`,
        predicate: () => findInputEl() !== null
      });

      const inputEl = findInputEl();
      if (!inputEl) {
        throw new Error(`the text widget of ${propertyPath} did not render`);
      }

      const valueBefore = getFrontmatterValue();
      // As a user would: a field inside a collapsed row cannot take focus, and an Enter sent to an unfocused
      // field never reaches it.
      inputEl.closest<HTMLElement>(topLevelSelector)?.removeClass('is-collapsed');
      inputEl.focus();
      // Typed with real key presses over the selected old value, exactly as a user replaces it.
      activeWindow.getSelection()?.selectAllChildren(inputEl);
      for (const character of text) {
        await pressKey({ key: character });
      }
      await waitUntil({
        message: `the typed text to reach the text widget of ${propertyPath}`,
        predicate: () => inputEl.textContent === text
      });
      await pressKey({ key: 'Enter' });

      await waitUntil({
        message: `the frontmatter of ${propertyPath} to change`,
        predicate: () => JSON.stringify(getFrontmatterValue()) !== JSON.stringify(valueBefore)
      });

      const collapsibleSelector = `.nested-properties-collapsible[data-path="${CSS.escape(`${notePath}:${propertyPath}`)}"]`;
      const frontmatterValue = getFrontmatterValue();
      const isNested = frontmatterValue !== null && typeof frontmatterValue === 'object';
      if (isNested) {
        // Obsidian saves the converted value but does not redraw the row by itself, so this is also what
        // proves the plugin's own re-render: without it the row keeps showing the typed text.
        await waitUntil({
          message: `${propertyPath} to render as a nested property`,
          predicate: () => containerEl.querySelector(collapsibleSelector) !== null
        });
      }

      const collapsibleEl = containerEl.querySelector(collapsibleSelector);
      return {
        frontmatterValue,
        isCollapsed: collapsibleEl ? collapsibleEl.hasClass('is-collapsed') : null
      };
    },
    input: { propertyPath: params.propertyPath, text: params.text },
    vaultPath: vault.path
  });
}
