import type {
  App,
  PluginManifest
} from 'obsidian';

import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

const mockAddChild = vi.fn();

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin', () => {
  class MockPluginBase {
    public addChild = mockAddChild;
  }
  return { PluginBase: MockPluginBase };
});

vi.mock('./nested-property-renderer.ts', () => ({
  NestedPropertyRenderer: vi.fn()
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { NestedPropertyRenderer } from './nested-property-renderer.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { Plugin } from './plugin.ts';

describe('Plugin', () => {
  it('should add NestedPropertyRenderer as a child', () => {
    const app = {} as App;
    const manifest = {} as PluginManifest;

    new Plugin(app, manifest);

    expect(NestedPropertyRenderer).toHaveBeenCalledWith(app);
    expect(mockAddChild).toHaveBeenCalledWith(expect.any(NestedPropertyRenderer));
  });
});
