import type { App } from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { getInitialExpandLevel } from './nested-properties-note-settings.ts';

const SOURCE_PATH = 'note.md';

interface GetLevelParams {
  // `null` stands for a note the metadata cache knows nothing about.
  readonly cache?: null;
  readonly fallbackLevel: number;
  readonly frontmatter?: unknown;
}

describe('getInitialExpandLevel', () => {
  it('should use the note override when it is a valid level', () => {
    expect(getLevel({ fallbackLevel: 1, frontmatter: { nestedProperties: { initialExpandLevel: 3 } } })).toBe(3);
  });

  it('should accept 0 as a note override, collapsing everything', () => {
    expect(getLevel({ fallbackLevel: 2, frontmatter: { nestedProperties: { initialExpandLevel: 0 } } })).toBe(0);
  });

  it('should fall back to the plugin setting when the note has no override', () => {
    expect(getLevel({ fallbackLevel: 2, frontmatter: { title: 'Note' } })).toBe(2);
  });

  it('should fall back to the plugin setting when the note has no frontmatter at all', () => {
    expect(getLevel({ fallbackLevel: 2, frontmatter: null })).toBe(2);
  });

  it('should fall back to the plugin setting when the note is not cached', () => {
    expect(getLevel({ cache: null, fallbackLevel: 2 })).toBe(2);
  });

  it.each([
    ['a string', '2'],
    ['a negative number', -1],
    ['a fraction', 1.5],
    ['a boolean', true],
    ['null', null],
    ['an object', { level: 2 }]
  ])('should ignore an override that is %s', (_description: string, initialExpandLevel: unknown) => {
    expect(getLevel({ fallbackLevel: 2, frontmatter: { nestedProperties: { initialExpandLevel } } })).toBe(2);
  });

  it('should ignore a plugin setting that is not a valid level, collapsing everything', () => {
    expect(getLevel({ fallbackLevel: -1, frontmatter: null })).toBe(0);
  });

  function getLevel(params: GetLevelParams): number {
    const cache = params.cache === null ? null : { frontmatter: params.frontmatter };
    const app = castTo<App>({
      metadataCache: {
        getCache: vi.fn(() => cache)
      }
    });
    return getInitialExpandLevel({ app, fallbackLevel: params.fallbackLevel, sourcePath: SOURCE_PATH });
  }
});
