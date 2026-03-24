import type {
  MarkdownView,
  TFile
} from 'obsidian';
import type {
  MultitextPropertyWidgetComponent,
  PropertyWidget
} from 'obsidian-typings';

import {
  ContextId,
  evalInObsidian
} from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/obsidian-plugin-vitest-setup';
import {
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

beforeEach(async () => {
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

describe('type conversion integration', () => {
  describe('list -> mixed list', () => {
    it('should keep array as-is', async () => {
      const isValid = await evalInObsidian({
        contextId,
        fn: ({ context: { mixedListWidget } }) => {
          return mixedListWidget.validate([1, 2, 3]);
        },
        vaultPath: vault.path
      });

      expect(isValid).toBe(true);
    });
  });

  describe('list -> object', () => {
    it('should warn and convert to empty object', async () => {
      const isValid = await evalInObsidian({
        contextId,
        fn: ({ context: { objectWidget } }) => {
          return objectWidget.validate([1, 2, 3]);
        },
        vaultPath: vault.path
      });

      expect(isValid).toBe(false);
    });
  });

  describe('mixed list -> list (simple)', () => {
    it('should not warn for simple string array', async () => {
      const isValid = await evalInObsidian({
        contextId,
        fn: ({ context: { simpleListWidget } }) => {
          return simpleListWidget.validate(['a', 'b', 'c']);
        },
        vaultPath: vault.path
      });

      expect(isValid).toBe(true);
    });

    it('should filter complex items from mixed array', async () => {
      const isValid = await evalInObsidian({
        contextId,
        fn: ({ context: { simpleListWidget } }) => {
          return simpleListWidget.validate(['a', { a: 2 }, 'b', [4]]);
        },
        vaultPath: vault.path
      });

      expect(isValid).toBe(false);
    });
  });

  describe('mixed list -> object', () => {
    it('should warn and convert to empty object', async () => {
      const isValid = await evalInObsidian({
        args: { value: [1, { a: 2 }, 3] },
        fn: ({ app, value }) => {
          const widget = app.metadataTypeManager.registeredTypeWidgets['object'];
          if (!widget) {
            throw new Error('Widget is not registered');
          }
          return widget.validate(value);
        },
        vaultPath: vault.path
      });
      expect(isValid).toBe(false);
    });
  });

  describe('object -> list (simple)', () => {
    it('should warn and convert to empty array', async () => {
      const isValid = await evalInObsidian({
        contextId,
        fn: ({ context: { simpleListWidget } }) => {
          return simpleListWidget.validate({ a: 1, b: 2 });
        },
        vaultPath: vault.path
      });

      expect(isValid).toBe(false);
    });
  });

  describe('object -> mixed list', () => {
    it('should warn and wrap object in array', async () => {
      const isValid = await evalInObsidian({
        contextId,
        fn: ({ context: { mixedListWidget } }) => {
          return mixedListWidget.validate({ a: 1, b: 2 });
        },
        vaultPath: vault.path
      });

      expect(isValid).toBe(false);
    });
  });

  describe('primitive -> mixed list', () => {
    it('should warn and wrap string in array', async () => {
      const isValid = await evalInObsidian({
        contextId,
        fn: ({ context: { mixedListWidget } }) => {
          return mixedListWidget.validate('hello');
        },
        vaultPath: vault.path
      });

      expect(isValid).toBe(false);
    });

    it('should warn and wrap number in array', async () => {
      const isValid = await evalInObsidian({
        contextId,
        fn: ({ context: { mixedListWidget } }) => {
          return mixedListWidget.validate(42);
        },
        vaultPath: vault.path
      });

      expect(isValid).toBe(false);
    });
  });
});
