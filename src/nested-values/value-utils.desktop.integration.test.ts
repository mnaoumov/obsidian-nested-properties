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
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

const vault = getTemporaryVault();

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
---
`
  });
});

beforeAll(async () => {
  vault.populate({
    'test.md': ''
  });
  await evalInObsidian({
    callback: async ({ app, context }) => {
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
    contextId,
    vaultPath: vault.path
  });
});

describe('type conversion integration', () => {
  describe('list -> mixed list', () => {
    it('should keep array as-is', async () => {
      const isValid = await evalInObsidian({
        callback: ({ context: { mixedListWidget } }) => {
          return mixedListWidget.validate([1, 2, 3]);
        },
        contextId,
        vaultPath: vault.path
      });

      expect(isValid).toBe(true);
    });
  });

  describe('list -> object', () => {
    it('should warn and convert to empty object', async () => {
      const isValid = await evalInObsidian({
        callback: ({ context: { objectWidget } }) => {
          return objectWidget.validate([1, 2, 3]);
        },
        contextId,
        vaultPath: vault.path
      });

      expect(isValid).toBe(false);
    });
  });

  describe('mixed list -> list (simple)', () => {
    it('should not warn for simple string array', async () => {
      const isValid = await evalInObsidian({
        callback: ({ context: { simpleListWidget } }) => {
          return simpleListWidget.validate(['a', 'b', 'c']);
        },
        contextId,
        vaultPath: vault.path
      });

      expect(isValid).toBe(true);
    });

    it('should filter complex items from mixed array', async () => {
      const isValid = await evalInObsidian({
        callback: ({ context: { simpleListWidget } }) => {
          return simpleListWidget.validate(['a', { a: 2 }, 'b', [4]]);
        },
        contextId,
        vaultPath: vault.path
      });

      expect(isValid).toBe(false);
    });
  });

  describe('mixed list -> object', () => {
    it('should warn and convert to empty object', async () => {
      const isValid = await evalInObsidian({
        callback: ({ app, value }) => {
          const widget = app.metadataTypeManager.registeredTypeWidgets['object'];
          if (!widget) {
            throw new Error('Widget is not registered');
          }
          return widget.validate(value);
        },
        input: { value: [1, { a: 2 }, 3] },
        vaultPath: vault.path
      });
      expect(isValid).toBe(false);
    });
  });

  describe('object -> list (simple)', () => {
    it('should warn and convert to empty array', async () => {
      const isValid = await evalInObsidian({
        callback: ({ context: { simpleListWidget } }) => {
          return simpleListWidget.validate({ a: 1, b: 2 });
        },
        contextId,
        vaultPath: vault.path
      });

      expect(isValid).toBe(false);
    });
  });

  describe('object -> mixed list', () => {
    it('should warn and wrap object in array', async () => {
      const isValid = await evalInObsidian({
        callback: ({ context: { mixedListWidget } }) => {
          return mixedListWidget.validate({ a: 1, b: 2 });
        },
        contextId,
        vaultPath: vault.path
      });

      expect(isValid).toBe(false);
    });
  });

  describe('primitive -> mixed list', () => {
    it('should warn and wrap string in array', async () => {
      const isValid = await evalInObsidian({
        callback: ({ context: { mixedListWidget } }) => {
          return mixedListWidget.validate('hello');
        },
        contextId,
        vaultPath: vault.path
      });

      expect(isValid).toBe(false);
    });

    it('should warn and wrap number in array', async () => {
      const isValid = await evalInObsidian({
        callback: ({ context: { mixedListWidget } }) => {
          return mixedListWidget.validate(42);
        },
        contextId,
        vaultPath: vault.path
      });

      expect(isValid).toBe(false);
    });
  });
});
