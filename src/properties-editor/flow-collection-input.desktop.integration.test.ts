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

interface TypeNextItemParams {
  readonly propertyPath: string;
  readonly text: string;
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

  it('turns a top-level text property into a list, focused for its next item', async () => {
    const result = await commit({ propertyPath: 'title', text: '[a, b]' });

    expect(result.frontmatterValue).toEqual(['a', 'b']);
    expect(await typeNextItem({ propertyPath: 'title', text: 'c' })).toEqual(['a', 'b', 'c']);
  });

  it('turns a top-level [] into an empty list, focused for its first item', async () => {
    const result = await commit({ propertyPath: 'title', text: '[]' });

    // Obsidian stores an empty List property as an empty value.
    expect(result.frontmatterValue).toBeNull();
    expect(await typeNextItem({ propertyPath: 'title', text: 'first' })).toEqual(['first']);
  });

  it('turns a nested [] into an empty nested list, focused for its first item', async () => {
    const result = await commit({ propertyPath: 'book.author', text: '[]' });

    expect(result.frontmatterValue).toEqual([]);
    expect(await typeNextItem({ propertyPath: 'book.author', text: 'first' })).toEqual(['first']);
  });

  it('turns a list of lists into a nested list, as YAML reads it', async () => {
    const result = await commit({ propertyPath: 'title', text: '[[a], [b]]' });

    expect(result.frontmatterValue).toEqual([['a'], ['b']]);
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
      // As a user would, with the row's own expand button: a field inside a collapsed row cannot take focus, and an
      // Enter sent to an unfocused field never reaches it. The button also records the choice, so the redraw a
      // conversion makes keeps the row open, as it does for a user.
      const topLevelRowEl = inputEl.closest<HTMLElement>(topLevelSelector);
      if (topLevelRowEl?.hasClass('is-collapsed')) {
        topLevelRowEl.querySelector<HTMLElement>('.nested-properties-collapse-btn')?.click();
      }
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
      // A plain list renders as a list widget rather than as a collapsible nested property.
      const isPlainList = Array.isArray(frontmatterValue) && frontmatterValue.every((item) => item === null || typeof item !== 'object');
      const isNested = frontmatterValue !== null && typeof frontmatterValue === 'object' && !isPlainList;
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

/**
 * Types `text` wherever the focus is and presses Enter, after checking that the focus is already inside the value of
 * the list at `propertyPath` - put there by the conversion, with no click - and reports the value saved afterwards.
 * It proves a list is filled from the keyboard alone.
 *
 * @param params - The list property and the item to type.
 */
async function typeNextItem(params: TypeNextItemParams): Promise<unknown> {
  return await evalInObsidian({
    callback: async ({ app, lib, obsidianModule, propertyPath, text }) => {
      const { pressKey, waitUntil } = lib;
      const notePath = 'flow-collection-input.md';
      const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
      const containerEl = view?.contentEl ?? activeDocument.body;
      const segments = propertyPath.split('.');
      const topLevelSelector = `.metadata-property[data-property-key="${CSS.escape(segments[0] ?? '')}"]`;

      function getFrontmatterValue(): unknown {
        let value: unknown = view?.file ? app.metadataCache.getFileCache(view.file)?.frontmatter : null;
        for (const segment of segments) {
          value = (value as Record<string, unknown> | undefined)?.[segment];
        }
        return value;
      }

      // The top-level row's own value, or the nested row's.
      function findValueEl(): Element | null {
        const topLevelEl = containerEl.querySelector(topLevelSelector);
        const valueSelector = segments.length === 1
          ? ':scope > .metadata-property-value'
          : `.metadata-property[data-path="${CSS.escape(`${notePath}:${propertyPath}`)}"] > .metadata-property-value`;
        return topLevelEl?.querySelector(valueSelector) ?? null;
      }

      await waitUntil({
        message: `the focus to move into the list of ${propertyPath}`,
        predicate: () => findValueEl()?.contains(activeDocument.activeElement) ?? false
      });

      const valueBefore = JSON.stringify(getFrontmatterValue());
      for (const character of text) {
        await pressKey({ key: character });
      }
      await pressKey({ key: 'Enter' });
      await waitUntil({
        message: `the next item to reach the frontmatter of ${propertyPath}`,
        predicate: () => JSON.stringify(getFrontmatterValue()) !== valueBefore
      });

      return getFrontmatterValue();
    },
    input: { propertyPath: params.propertyPath, text: params.text },
    vaultPath: vault.path
  });
}
