import type {
  MultitextPropertyWidgetComponent,
  PropertyWidget
} from '@obsidian-typings/obsidian-public-latest';
import type {
  MarkdownView,
  TFile
} from 'obsidian';

import {
  ContextId,
  evalInObsidian
} from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

const vault = getTempVault();

interface Context {
  file: TFile;
  markdownView: MarkdownView;
  mixedListWidget: PropertyWidget;
  objectWidget: PropertyWidget;
  simpleListWidget: PropertyWidget<MultitextPropertyWidgetComponent>;
}

const contextId = new ContextId<Context>();

beforeEach(() => {
  vault.populate({
    'test.md': `---
simpleList:
  - a
  - b
  - c
object:
  d: e
  f: g
mixedList:
  - h
  - i
  - j: 1
    k: 2
versions:
  - name: v1
    released: "2020"
  - name: v2
    released: "2021"
---
`
  });
});

beforeAll(async () => {
  vault.populate({
    'test.md': ''
  });
  await evalInObsidian({
    contextId,
    fn: async ({ app, context }) => {
      const listWidget = app.metadataTypeManager.registeredTypeWidgets['list'];
      if (!listWidget) {
        throw new Error('Mixed list widget is not registered');
      }
      const objectWidget = app.metadataTypeManager.registeredTypeWidgets['object'];
      if (!objectWidget) {
        throw new Error('Object widget is not registered');
      }
      const file = app.vault.getFileByPath('test.md');
      if (!file) {
        throw new Error('File is not found');
      }
      context.simpleListWidget = app.metadataTypeManager.registeredTypeWidgets.multitext;
      context.mixedListWidget = listWidget;
      context.objectWidget = objectWidget;
      context.file = file;
      await app.workspace.getLeaf(true).openFile(file);
      context.markdownView = app.workspace.getActiveFileView() as MarkdownView;
    },
    vaultPath: vault.path
  });
});

afterAll(async () => {
  await contextId.dispose();
});

describe('widget rendering integration', () => {
  it('should not loop when mixed list widget receives null value', async () => {
    const onChangeCallCount = await evalInObsidian({
      contextId,
      fn: ({ app, context: { mixedListWidget } }) => {
        // eslint-disable-next-line no-shadow -- Executed in different processes.
        let onChangeCallCount = 0;
        const el = createDiv();
        function noop(): void {
          /* No-op */
        }
        const ctx = {
          app,
          blur: noop,
          key: 'testList',
          onChange: (): void => {
            onChangeCallCount++;
          },
          sourcePath: 'test.md'
        };

        mixedListWidget.render(el, null, ctx);

        return onChangeCallCount;
      },
      vaultPath: vault.path
    });

    expect(onChangeCallCount).toBe(0);
  });

  it('should not loop when object widget receives null value', async () => {
    const onChangeCallCount = await evalInObsidian({
      contextId,
      fn: ({ app, context: { mixedListWidget } }) => {
        function noop(): void {
          /* No-op */
        }
        // eslint-disable-next-line no-shadow -- Executed in different processes.
        let onChangeCallCount = 0;
        const el = createDiv();
        const ctx = {
          app,
          blur: noop,
          key: 'testObj',
          onChange: (): void => {
            onChangeCallCount++;
          },
          sourcePath: 'test.md'
        };

        mixedListWidget.render(el, null, ctx);

        return onChangeCallCount;
      },
      vaultPath: vault.path
    });

    expect(onChangeCallCount).toBe(0);
  });
});

describe('frontmatter editing integration', () => {
  it('should not break when typing a new property name', { retry: 3 }, async () => {
    const contentAfterWait = await evalInObsidian({
      contextId,
      fn: async ({ context: { markdownView } }) => {
        const editor = markdownView.editor;

        editor.setCursor({ ch: 0, line: 1 });
        editor.replaceRange('newList:\n', { ch: 0, line: 1 });

        await sleep(500);

        return editor.getValue();
      },
      vaultPath: vault.path
    });

    expect(contentAfterWait).toContain('newList:');
  });
});

describe('type inference integration', () => {
  it('should infer simple array as list, not mixed list', async () => {
    const { expectedType, inferredType } = await evalInObsidian({
      contextId,
      fn: ({ context: { markdownView } }) => {
        const listEntry = markdownView.metadataEditor.rendered.find(
          (r) => r.entry.key === 'simpleList'
        );

        return {
          expectedType: listEntry?.typeInfo.expected.type,
          inferredType: listEntry?.typeInfo.inferred.type
        };
      },
      vaultPath: vault.path
    });

    expect(inferredType).toBe('multitext');
    expect(expectedType).toBe('multitext');
  });
});

describe('multitext validate patch integration', () => {
  it('should accept simple non-string primitive array', async () => {
    const isValid = await evalInObsidian({
      contextId,
      fn: ({ context: { simpleListWidget } }) => {
        return simpleListWidget.validate([1, 2, 3]);
      },
      vaultPath: vault.path
    });

    expect(isValid).toBe(true);
  });
});

describe('nested property type persistence integration', () => {
  afterEach(async () => {
    await evalInObsidian({
      contextId,
      fn: async ({ app }) => {
        await app.metadataTypeManager.unsetType('object.d');
        await app.metadataTypeManager.unsetType('versions.released');
      },
      vaultPath: vault.path
    });
  });

  it('persists a nested type (including reserved `tags`) under its dotted key', async () => {
    const assignedType = await evalInObsidian({
      contextId,
      fn: async ({ app }) => {
        await app.metadataTypeManager.setType('object.d', 'tags');
        return app.metadataTypeManager.getAssignedWidget('object.d');
      },
      vaultPath: vault.path
    });

    expect(assignedType).toBe('tags');
  });

  it('renders a nested scalar with its persisted (assigned) type', { retry: 3 }, async () => {
    const propertyType = await evalInObsidian({
      contextId,
      fn: async ({ app, context: { markdownView } }) => {
        await app.metadataTypeManager.setType('object.d', 'number');
        const data = markdownView.metadataEditor.serialize();
        markdownView.metadataEditor.synchronize({});
        markdownView.metadataEditor.synchronize(data);
        await sleep(500);

        for (const valueEl of Array.from(activeDocument.querySelectorAll('.nested-properties-container > .metadata-property > .metadata-property-value'))) {
          const keyInput = valueEl.parentElement?.querySelector('.metadata-property-key > .metadata-property-key-input');
          if (keyInput instanceof HTMLInputElement && keyInput.value === 'd') {
            return valueEl.getAttribute('data-property-type');
          }
        }
        return null;
      },
      vaultPath: vault.path
    });

    expect(propertyType).toBe('number');
  });

  it('applies a collapsed per-field type to every array item', { retry: 3 }, async () => {
    const propertyTypes = await evalInObsidian({
      contextId,
      fn: async ({ app, context: { markdownView } }) => {
        await app.metadataTypeManager.setType('versions.released', 'number');
        const data = markdownView.metadataEditor.serialize();
        markdownView.metadataEditor.synchronize({});
        markdownView.metadataEditor.synchronize(data);
        await sleep(500);

        const types: (null | string)[] = [];
        for (const valueEl of Array.from(activeDocument.querySelectorAll('.nested-properties-container > .metadata-property > .metadata-property-value'))) {
          const keyInput = valueEl.parentElement?.querySelector('.metadata-property-key > .metadata-property-key-input');
          if (keyInput instanceof HTMLInputElement && keyInput.value === 'released') {
            types.push(valueEl.getAttribute('data-property-type'));
          }
        }
        return types;
      },
      vaultPath: vault.path
    });

    expect(propertyTypes).toHaveLength(2);
    expect(propertyTypes.every((propertyType) => propertyType === 'number')).toBe(true);
  });
});
