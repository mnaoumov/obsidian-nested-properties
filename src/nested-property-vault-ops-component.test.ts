import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type { GenericObject } from '@mnaoumov/typescript-lib/type-guards';
import type { App as AppOriginal } from 'obsidian';
import type { MockInstance } from 'vitest';

import { confirm } from '@mnaoumov/obsidian-lib/modals/confirm';
import { prompt } from '@mnaoumov/obsidian-lib/modals/prompt';
import { selectItem } from '@mnaoumov/obsidian-lib/modals/select-item';
import { ResourceLockComponent } from '@mnaoumov/obsidian-lib/resource-lock';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { NestedPropertyVaultOpsComponent } from './nested-property-vault-ops-component.ts';

vi.mock('@mnaoumov/obsidian-lib/modals/select-item', () => ({ selectItem: vi.fn() }));
vi.mock('@mnaoumov/obsidian-lib/modals/prompt', () => ({ prompt: vi.fn() }));
vi.mock('@mnaoumov/obsidian-lib/modals/confirm', () => ({ confirm: vi.fn() }));

const mockSelectItem = vi.mocked(selectItem);
const mockPrompt = vi.mocked(prompt);
const mockConfirm = vi.mocked(confirm);

type LockForPathSpy = MockInstance<ResourceLockComponent['lockForPath']>;

interface NestedPropertyPathCount {
  readonly count: number;
  readonly path: string;
}

interface TestComponent {
  readonly component: NestedPropertyVaultOpsComponent;
  readonly lockForPath: LockForPathSpy;
  readonly showNotice: ReturnType<typeof vi.fn>;
}

const NESTED_A = [
  '---',
  'top:',
  '  level1:',
  '    level2: x',
  '  other: 1',
  '---',
  ''
].join('\n');

const NESTED_B = [
  '---',
  'top:',
  '  level1:',
  '    level2: y',
  '---',
  ''
].join('\n');

const NO_FRONTMATTER = 'Just body text.\n';

function frontmatterOf(app: AppOriginal, path: string): GenericObject {
  const file = app.vault.getFileByPath(path);
  if (!file) {
    throw new Error(`Missing file ${path}`);
  }
  return (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as GenericObject;
}

function lockedPaths(lockForPath: LockForPathSpy): string[] {
  return lockForPath.mock.calls.map(([{ pathOrFile }]) => (typeof pathOrFile === 'string' ? pathOrFile : pathOrFile.path));
}

function makeComponent(app: AppOriginal): TestComponent {
  const showNotice = vi.fn();
  const pluginNoticeComponent = castTo<PluginNoticeComponent>({ showNotice });
  // The real lock component, spied rather than replaced, so the assertions below observe the locking that
  // `@mnaoumov/obsidian-lib`'s `process()` primitive actually performs on each written note.
  const resourceLockComponent = new ResourceLockComponent(app, 'nested-properties');
  const lockForPath = vi.spyOn(resourceLockComponent, 'lockForPath');
  const component = new NestedPropertyVaultOpsComponent({ app, pluginNoticeComponent, resourceLockComponent });
  return { component, lockForPath, showNotice };
}

describe('NestedPropertyVaultOpsComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('renameNestedPropertyAcrossVault', () => {
    it('shows a notice when there are no nested properties', async () => {
      const app = App.createConfigured__({ files: { 'flat.md': '---\ntop: 1\n---\n' } }).asOriginalType__();
      const { component, showNotice } = makeComponent(app);

      await component.renameNestedPropertyAcrossVault();

      expect(showNotice).toHaveBeenCalledWith('No nested properties found in the vault.');
      expect(mockSelectItem).not.toHaveBeenCalled();
    });

    it('offers the aggregated, sorted nested paths with per-note counts', async () => {
      const app = App.createConfigured__({
        files: { 'a.md': NESTED_A, 'b.md': NESTED_B, 'plain.md': NO_FRONTMATTER }
      }).asOriginalType__();
      const { component } = makeComponent(app);
      mockSelectItem.mockResolvedValue(null);

      await component.renameNestedPropertyAcrossVault();

      const call = mockSelectItem.mock.calls[0]?.[0];
      const items = call?.items as NestedPropertyPathCount[];
      expect(items).toEqual([
        { count: 2, path: 'top.level1' },
        { count: 2, path: 'top.level1.level2' },
        { count: 1, path: 'top.other' }
      ]);
      expect(call?.itemTextFunction({ count: 2, path: 'top.level1' })).toBe('top.level1 (2)');
    });

    it('does nothing when the property selection is cancelled', async () => {
      const app = App.createConfigured__({ files: { 'a.md': NESTED_A } }).asOriginalType__();
      const { component, showNotice } = makeComponent(app);
      mockSelectItem.mockResolvedValue(null);

      await component.renameNestedPropertyAcrossVault();

      expect(mockPrompt).not.toHaveBeenCalled();
      expect(showNotice).not.toHaveBeenCalled();
    });

    it('does nothing when the rename prompt is cancelled', async () => {
      const app = App.createConfigured__({ files: { 'a.md': NESTED_A } }).asOriginalType__();
      const { component, showNotice } = makeComponent(app);
      mockSelectItem.mockResolvedValue({ count: 1, path: 'top.other' });
      mockPrompt.mockResolvedValue(null);

      await component.renameNestedPropertyAcrossVault();

      expect(showNotice).not.toHaveBeenCalled();
      expect(frontmatterOf(app, 'a.md')).toEqual({ top: { level1: { level2: 'x' }, other: 1 } });
    });

    it('does nothing when the new path is blank or unchanged', async () => {
      const app = App.createConfigured__({ files: { 'a.md': NESTED_A } }).asOriginalType__();
      const { component, showNotice } = makeComponent(app);
      mockSelectItem.mockResolvedValue({ count: 1, path: 'top.other' });

      mockPrompt.mockResolvedValueOnce(' '.repeat(3));
      await component.renameNestedPropertyAcrossVault();

      mockPrompt.mockResolvedValueOnce('top.other');
      await component.renameNestedPropertyAcrossVault();

      expect(showNotice).not.toHaveBeenCalled();
    });

    it('renames the nested property across every note that has it', async () => {
      const app = App.createConfigured__({
        files: { 'a.md': NESTED_A, 'b.md': NESTED_B, 'plain.md': NO_FRONTMATTER }
      }).asOriginalType__();
      const { component, showNotice } = makeComponent(app);
      mockSelectItem.mockResolvedValue({ count: 2, path: 'top.level1.level2' });
      mockPrompt.mockResolvedValue('top.level1.renamed');

      await component.renameNestedPropertyAcrossVault();

      expect(frontmatterOf(app, 'a.md')).toEqual({ top: { level1: { renamed: 'x' }, other: 1 } });
      expect(frontmatterOf(app, 'b.md')).toEqual({ top: { level1: { renamed: 'y' } } });
      expect(showNotice).toHaveBeenCalledWith(
        'Renamed the nested property "top.level1.level2" to "top.level1.renamed" in 2 notes.'
      );
    });

    it('skips notes where the target path already exists', async () => {
      const withTarget = [
        '---',
        'top:',
        '  level1:',
        '    level2: y',
        '    renamed: existing',
        '---',
        ''
      ].join('\n');
      const app = App.createConfigured__({ files: { 'a.md': NESTED_A, 'b.md': withTarget } }).asOriginalType__();
      const { component, showNotice } = makeComponent(app);
      mockSelectItem.mockResolvedValue({ count: 2, path: 'top.level1.level2' });
      mockPrompt.mockResolvedValue('top.level1.renamed');

      await component.renameNestedPropertyAcrossVault();

      expect(frontmatterOf(app, 'a.md')).toEqual({ top: { level1: { renamed: 'x' }, other: 1 } });
      expect(frontmatterOf(app, 'b.md')).toEqual({ top: { level1: { level2: 'y', renamed: 'existing' } } });
      expect(showNotice).toHaveBeenCalledWith(
        'Renamed the nested property "top.level1.level2" to "top.level1.renamed" in 1 note.'
      );
    });

    it('writes each renamed note under the shared resource lock, and locks nothing else', async () => {
      const app = App.createConfigured__({
        files: { 'a.md': NESTED_A, 'b.md': NESTED_B, 'plain.md': NO_FRONTMATTER }
      }).asOriginalType__();
      const { component, lockForPath } = makeComponent(app);
      mockSelectItem.mockResolvedValue({ count: 2, path: 'top.level1.level2' });
      mockPrompt.mockResolvedValue('top.level1.renamed');

      await component.renameNestedPropertyAcrossVault();

      expect(lockedPaths(lockForPath)).toEqual(['a.md', 'b.md']);
    });

    it('reports zero notes when the target parent chain is not an object', async () => {
      const app = App.createConfigured__({ files: { 'a.md': NESTED_A } }).asOriginalType__();
      const { component, showNotice } = makeComponent(app);
      mockSelectItem.mockResolvedValue({ count: 1, path: 'top.level1.level2' });
      mockPrompt.mockResolvedValue('top.other.deeper');

      await component.renameNestedPropertyAcrossVault();

      expect(frontmatterOf(app, 'a.md')).toEqual({ top: { level1: { level2: 'x' }, other: 1 } });
      expect(showNotice).toHaveBeenCalledWith(
        'Renamed the nested property "top.level1.level2" to "top.other.deeper" in 0 notes.'
      );
    });
  });

  describe('deleteNestedPropertyAcrossVault', () => {
    it('shows a notice when there are no nested properties', async () => {
      const app = App.createConfigured__({ files: { 'flat.md': '---\ntop: 1\n---\n' } }).asOriginalType__();
      const { component, showNotice } = makeComponent(app);

      await component.deleteNestedPropertyAcrossVault();

      expect(showNotice).toHaveBeenCalledWith('No nested properties found in the vault.');
      expect(mockSelectItem).not.toHaveBeenCalled();
    });

    it('does nothing when the property selection is cancelled', async () => {
      const app = App.createConfigured__({ files: { 'a.md': NESTED_A } }).asOriginalType__();
      const { component, showNotice } = makeComponent(app);
      mockSelectItem.mockResolvedValue(null);

      await component.deleteNestedPropertyAcrossVault();

      expect(mockConfirm).not.toHaveBeenCalled();
      expect(showNotice).not.toHaveBeenCalled();
      expect(mockSelectItem.mock.calls[0]?.[0].itemTextFunction({ count: 1, path: 'top.other' })).toBe('top.other (1)');
    });

    it('does nothing when the confirmation is declined', async () => {
      const app = App.createConfigured__({ files: { 'a.md': NESTED_A } }).asOriginalType__();
      const { component, showNotice } = makeComponent(app);
      mockSelectItem.mockResolvedValue({ count: 1, path: 'top.other' });
      mockConfirm.mockResolvedValue(false);

      await component.deleteNestedPropertyAcrossVault();

      expect(showNotice).not.toHaveBeenCalled();
      expect(frontmatterOf(app, 'a.md')).toEqual({ top: { level1: { level2: 'x' }, other: 1 } });
    });

    it('deletes the nested property across every note that has it', async () => {
      const app = App.createConfigured__({
        files: { 'a.md': NESTED_A, 'b.md': NESTED_B, 'plain.md': NO_FRONTMATTER }
      }).asOriginalType__();
      const { component, showNotice } = makeComponent(app);
      mockSelectItem.mockResolvedValue({ count: 2, path: 'top.level1.level2' });
      mockConfirm.mockResolvedValue(true);

      await component.deleteNestedPropertyAcrossVault();

      expect(frontmatterOf(app, 'a.md')).toEqual({ top: { level1: {}, other: 1 } });
      expect(frontmatterOf(app, 'b.md')).toEqual({ top: { level1: {} } });
      expect(showNotice).toHaveBeenCalledWith('Deleted the nested property "top.level1.level2" from 2 notes.');
    });

    it('writes each deleted-from note under the shared resource lock, and locks nothing else', async () => {
      const app = App.createConfigured__({
        files: { 'a.md': NESTED_A, 'b.md': NESTED_B, 'plain.md': NO_FRONTMATTER }
      }).asOriginalType__();
      const { component, lockForPath } = makeComponent(app);
      mockSelectItem.mockResolvedValue({ count: 1, path: 'top.other' });
      mockConfirm.mockResolvedValue(true);

      await component.deleteNestedPropertyAcrossVault();

      expect(lockedPaths(lockForPath)).toEqual(['a.md']);
    });
  });
});
