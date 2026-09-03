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
    'expand-level-default.md': `---
generated:
  by: human
  nested:
    deep: 1
---
`,
    'expand-level-override.md': `---
nestedProperties:
  initialExpandLevel: 0
generated:
  by: human
---
`
  });
});

interface ExpandLevelMeasurement {
  readonly isNestedCollapsed: boolean;
  readonly isRootCollapsed: boolean;
  readonly nestedSummaryText: string;
  readonly rootSummaryText: string;
}

describe('initial expand level', () => {
  it('expands one level by default and gives the collapsed level below it a readable summary', async () => {
    const result = await measure('expand-level-default.md');

    expect(result.isRootCollapsed).toBe(false);
    expect(result.isNestedCollapsed).toBe(true);
    expect(result.nestedSummaryText).toBe('{ deep: 1 }');
  });

  it('lets a note collapse everything with its own nestedProperties.initialExpandLevel', async () => {
    const result = await measure('expand-level-override.md');

    expect(result.isRootCollapsed).toBe(true);
    expect(result.rootSummaryText).toBe('{ by: human }');
  });
});

/**
 * Opens the note and reports how its `generated` nested property rendered: whether the property itself and
 * the level below it came out collapsed, and what each collapsed row reads as.
 *
 * @param path - The note to open.
 */
async function measure(path: string): Promise<ExpandLevelMeasurement> {
  return await evalInObsidian({
    callback: async ({ app, lib, obsidianModule, path: notePath }) => {
      const { waitUntil } = lib;

      const file = app.vault.getFileByPath(notePath);
      if (!file) {
        throw new Error(`${notePath} not found`);
      }
      await app.workspace.getLeaf(true).openFile(file);

      const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
      const containerEl = view?.contentEl ?? activeDocument.body;
      // The path is escaped once and reused: it carries a dot, which is meaningful in a CSS selector.
      const escapedNotePath = CSS.escape(notePath);
      const rootSelector = `.nested-properties-collapsible[data-path="${escapedNotePath}:generated"]`;
      const nestedSelector = `:scope .nested-properties-collapsible[data-path="${escapedNotePath}:generated.nested"]`;

      await waitUntil({
        message: 'the generated nested property to render',
        predicate: () => containerEl.querySelector(rootSelector) !== null
      });

      const rootEl = containerEl.querySelector(rootSelector);
      if (!(rootEl instanceof HTMLElement)) {
        throw new TypeError('the generated nested property did not render');
      }

      const nestedEl = rootEl.querySelector(nestedSelector);
      const nestedSummaryEl = nestedEl?.querySelector(':scope > .metadata-property-value > .nested-properties-summary');
      const rootSummaryEl = rootEl.querySelector(':scope > .metadata-property-value > .nested-properties-summary');

      return {
        isNestedCollapsed: nestedEl instanceof HTMLElement && nestedEl.hasClass('is-collapsed'),
        isRootCollapsed: rootEl.hasClass('is-collapsed'),
        nestedSummaryText: nestedSummaryEl?.textContent ?? '',
        rootSummaryText: rootSummaryEl?.textContent ?? ''
      };
    },
    input: { path },
    vaultPath: vault.path
  });
}
