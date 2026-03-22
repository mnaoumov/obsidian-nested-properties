import type { MarkdownView } from 'obsidian';

import { evalObsidianCli } from 'obsidian-dev-utils/script-utils/obsidian-cli';
import {
  describe,
  expect,
  it
} from 'vitest';

import { getTempVaultPath } from './test-helpers/integration-test-context.ts';

const vaultPath = getTempVaultPath();

describe('widget rendering integration', () => {
  it('should not loop when mixed list widget receives null value', async () => {
    const result = await evalObsidianCli({
      fn: (app) => {
        const widget = app.metadataTypeManager.registeredTypeWidgets['list'];
        if (!widget) {
          throw new Error('Widget is not registered');
        }

        let onChangeCallCount = 0;
        const el = createDiv();
        const ctx = {
          app,
          blur: (): void => {/* Noop */},
          key: 'testList',
          onChange: (): void => {
            onChangeCallCount++;
          },
          sourcePath: 'test.md'
        };

        widget.render(el, null, ctx);

        return { onChangeCallCount };
      },
      vaultPath
    });

    expect(result.onChangeCallCount).toBe(0);
  });

  it('should not loop when object widget receives null value', async () => {
    const result = await evalObsidianCli({
      fn: (app) => {
        const widget = app.metadataTypeManager.registeredTypeWidgets['object'];
        if (!widget) {
          throw new Error('Widget is not registered');
        }

        let onChangeCallCount = 0;
        const el = document.createElement('div');
        const ctx = {
          app,
          blur: (): void => {/* Noop */},
          key: 'testObj',
          onChange: (): void => {
            onChangeCallCount++;
          },
          sourcePath: 'test.md'
        };

        widget.render(el, null, ctx);

        return { onChangeCallCount };
      },
      vaultPath
    });

    expect(result.onChangeCallCount).toBe(0);
  });
});

describe('frontmatter editing integration', () => {
  it('should not break when typing a new property name', { retry: 3 }, async () => {
    const result = await evalObsidianCli({
      fn: async (app) => {
        const file = app.vault.getFileByPath('_test-typing-renderer.md')
          ?? await app.vault.create('_test-typing-renderer.md', '---\n---\n');

        const leaf = app.workspace.getLeaf(true);
        await leaf.openFile(file);

        await new Promise<void>((resolve) => {
          setTimeout(resolve, 500);
        });

        const view = leaf.view as MarkdownView;
        const editor = view.editor;

        editor.setCursor({ ch: 0, line: 1 });
        editor.replaceRange('list:\n', { ch: 0, line: 1 });

        await new Promise<void>((resolve) => {
          setTimeout(resolve, 500);
        });

        const contentAfterWait = editor.getValue();

        await app.fileManager.trashFile(file);

        return { contentAfterWait };
      },
      vaultPath: getTempVaultPath()
    });

    expect(result.contentAfterWait).toContain('list:');
  });
});

describe('type inference integration', () => {
  it('should infer simple array as list, not mixed list', async () => {
    const result = await evalObsidianCli({
      fn: async (app) => {
        const file = app.vault.getFileByPath('_test-infer-renderer.md')
          ?? await app.vault.create('_test-infer-renderer.md', '---\nlist:\n  - 1\n  - 2\n  - 3\n---\n');

        const leaf = app.workspace.getLeaf(true);
        await leaf.openFile(file);

        await new Promise<void>((resolve) => {
          setTimeout(resolve, 500);
        });

        const view = leaf.view as MarkdownView;
        const listEntry = view.metadataEditor.rendered.find(
          (r) => r.entry.key === 'list'
        );

        await app.fileManager.trashFile(file);

        return {
          expectedType: listEntry?.typeInfo.expected.type,
          inferredType: listEntry?.typeInfo.inferred.type
        };
      },
      vaultPath
    });

    expect(result.inferredType).toBe('multitext');
    expect(result.expectedType).toBe('multitext');
  });
});

describe('multitext validate patch integration', () => {
  it('should accept simple non-string primitive array', async () => {
    const result = await evalObsidianCli({
      args: [[1, 2, 3]],
      fn: (app, value) => {
        const widget = app.metadataTypeManager.registeredTypeWidgets.multitext;
        return { validates: widget.validate(value) };
      },
      vaultPath
    });

    expect(result.validates).toBe(true);
  });
});
