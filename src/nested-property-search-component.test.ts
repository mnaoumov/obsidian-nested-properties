import type {
  App as AppOriginal,
  TFile,
  WorkspaceLeaf
} from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { prompt } from 'obsidian-dev-utils/obsidian/modals/prompt';
import { selectItem } from 'obsidian-dev-utils/obsidian/modals/select-item';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { NestedPropertySearchComponent } from './nested-property-search-component.ts';

vi.mock('obsidian-dev-utils/obsidian/modals/select-item', () => ({ selectItem: vi.fn() }));
vi.mock('obsidian-dev-utils/obsidian/modals/prompt', () => ({ prompt: vi.fn() }));

const mockSelectItem = vi.mocked(selectItem);
const mockPrompt = vi.mocked(prompt);

interface TestComponent {
  readonly component: NestedPropertySearchComponent;
  readonly showNotice: ReturnType<typeof vi.fn>;
}

const FM_ALPHA = '---\nparent:\n  child: alpha\n---\n';
const FM_BETA = '---\nparent:\n  child: beta\n---\n';
const NO_FRONTMATTER = 'Just body text.\n';

function fileOf(app: AppOriginal, path: string): TFile {
  const file = app.vault.getFileByPath(path);
  if (!file) {
    throw new Error(`Missing file ${path}`);
  }
  return file;
}

function makeComponent(app: AppOriginal): TestComponent {
  const showNotice = vi.fn();
  const pluginNoticeComponent = castTo<PluginNoticeComponent>({ showNotice });
  const component = new NestedPropertySearchComponent({ app, pluginNoticeComponent });
  return { component, showNotice };
}

function seededApp(): AppOriginal {
  return App.createConfigured__({
    files: { 'a.md': FM_ALPHA, 'b.md': FM_BETA, 'plain.md': NO_FRONTMATTER }
  }).asOriginalType__();
}

describe('NestedPropertySearchComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when the query prompt is cancelled', async () => {
    const app = seededApp();
    const { component, showNotice } = makeComponent(app);
    mockPrompt.mockResolvedValue(null);

    await component.findNotesByNestedProperty();

    expect(mockSelectItem).not.toHaveBeenCalled();
    expect(showNotice).not.toHaveBeenCalled();
  });

  it('shows a notice for a malformed query', async () => {
    const app = seededApp();
    const { component, showNotice } = makeComponent(app);
    mockPrompt.mockResolvedValue('[a]x[b]');

    await component.findNotesByNestedProperty();

    expect(showNotice).toHaveBeenCalledWith('Invalid nested property query. Use [parent][child: value] or parent.child: value.');
    expect(mockSelectItem).not.toHaveBeenCalled();
  });

  it('shows a notice when no notes match', async () => {
    const app = seededApp();
    const { component, showNotice } = makeComponent(app);
    mockPrompt.mockResolvedValue('parent.child: zzz');

    await component.findNotesByNestedProperty();

    expect(showNotice).toHaveBeenCalledWith('No notes match the nested property "parent.child".');
    expect(mockSelectItem).not.toHaveBeenCalled();
  });

  it('offers the matching notes and does nothing when the selection is cancelled', async () => {
    const app = seededApp();
    const { component } = makeComponent(app);
    mockPrompt.mockResolvedValue('parent.child');
    mockSelectItem.mockResolvedValue(null);
    const getLeafSpy = vi.spyOn(app.workspace, 'getLeaf');

    await component.findNotesByNestedProperty();

    const call = mockSelectItem.mock.calls[0]?.[0];
    const items = call?.items as TFile[];
    expect(items.map((file) => file.path)).toEqual(['a.md', 'b.md']);
    expect(call?.itemTextFunc(fileOf(app, 'a.md'))).toBe('a.md');
    expect(getLeafSpy).not.toHaveBeenCalled();
  });

  it('opens the selected matching note', async () => {
    const app = seededApp();
    const { component } = makeComponent(app);
    mockPrompt.mockResolvedValue('parent.child: alpha');
    const target = fileOf(app, 'a.md');
    mockSelectItem.mockResolvedValue(target);
    const openFile = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(app.workspace, 'getLeaf').mockReturnValue(castTo<WorkspaceLeaf>({ openFile }));

    await component.findNotesByNestedProperty();

    const items = mockSelectItem.mock.calls[0]?.[0].items as TFile[];
    expect(items.map((file) => file.path)).toEqual(['a.md']);
    expect(openFile).toHaveBeenCalledWith(target);
  });
});
