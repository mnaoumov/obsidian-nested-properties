import type { GenericObject } from 'obsidian-dev-utils/type-guards';

import {
  describe,
  expect,
  it
} from 'vitest';

import {
  collectNestedPropertyEntries,
  collectNestedPropertyPaths,
  deleteNestedProperty,
  renameNestedProperty
} from './nested-property-paths.ts';

describe('collectNestedPropertyPaths', () => {
  it('returns an empty list for a flat object', () => {
    expect(collectNestedPropertyPaths({ a: 1, b: 'two' })).toEqual([]);
  });

  it('collects every nested path (depth two or more), excluding top-level keys, sorted', () => {
    const frontmatter: GenericObject = {
      top: {
        level1: {
          level2: 'x'
        },
        other: 1
      },
      zzz: 'scalar'
    };
    expect(collectNestedPropertyPaths(frontmatter)).toEqual([
      'top.level1',
      'top.level1.level2',
      'top.other'
    ]);
  });

  it('does not descend into arrays but still records the array-valued key path', () => {
    const frontmatter: GenericObject = {
      parent: {
        items: [{ inner: 1 }, 2]
      }
    };
    expect(collectNestedPropertyPaths(frontmatter)).toEqual(['parent.items']);
  });

  it('treats a null nested value as a leaf', () => {
    const frontmatter: GenericObject = { parent: { child: null } };
    expect(collectNestedPropertyPaths(frontmatter)).toEqual(['parent.child']);
  });
});

describe('collectNestedPropertyEntries', () => {
  it('returns an empty list for a flat object', () => {
    expect(collectNestedPropertyEntries({ a: 1, b: 'two' })).toEqual([]);
  });

  it('pairs every nested path with its value, excluding top-level keys, in document order', () => {
    const frontmatter: GenericObject = {
      top: {
        level1: {
          level2: 'x'
        },
        other: 1
      },
      zzz: 'scalar'
    };
    expect(collectNestedPropertyEntries(frontmatter)).toEqual([
      { path: 'top.level1', value: { level2: 'x' } },
      { path: 'top.level1.level2', value: 'x' },
      { path: 'top.other', value: 1 }
    ]);
  });

  it('records an array-valued path without descending into it', () => {
    const frontmatter: GenericObject = {
      parent: {
        items: ['a', 'b']
      }
    };
    expect(collectNestedPropertyEntries(frontmatter)).toEqual([
      { path: 'parent.items', value: ['a', 'b'] }
    ]);
  });

  it('records a null nested value as a leaf entry', () => {
    const frontmatter: GenericObject = { parent: { child: null } };
    expect(collectNestedPropertyEntries(frontmatter)).toEqual([
      { path: 'parent.child', value: null }
    ]);
  });
});

describe('deleteNestedProperty', () => {
  it('returns false for an empty path', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(deleteNestedProperty({ frontmatter, path: '' })).toBe(false);
    expect(frontmatter).toEqual({ a: { b: 1 } });
  });

  it('returns false when an intermediate segment is not an object', () => {
    const frontmatter: GenericObject = { a: 5 };
    expect(deleteNestedProperty({ frontmatter, path: 'a.b' })).toBe(false);
    expect(frontmatter).toEqual({ a: 5 });
  });

  it('returns false when the leaf key is missing', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(deleteNestedProperty({ frontmatter, path: 'a.c' })).toBe(false);
    expect(frontmatter).toEqual({ a: { b: 1 } });
  });

  it('deletes the leaf and preserves the (now empty) parent', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(deleteNestedProperty({ frontmatter, path: 'a.b' })).toBe(true);
    expect(frontmatter).toEqual({ a: {} });
  });
});

describe('renameNestedProperty', () => {
  it('returns false when either path is empty', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(renameNestedProperty({ fromPath: '', frontmatter, toPath: 'a.c' })).toBe(false);
    expect(renameNestedProperty({ fromPath: 'a.b', frontmatter, toPath: '' })).toBe(false);
  });

  it('returns false when the paths are equal', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(renameNestedProperty({ fromPath: 'a.b', frontmatter, toPath: 'a.b' })).toBe(false);
  });

  it('returns false when the target is a descendant of the source', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(renameNestedProperty({ fromPath: 'a', frontmatter, toPath: 'a.b' })).toBe(false);
  });

  it('returns false when the source is a descendant of the target', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(renameNestedProperty({ fromPath: 'a.b', frontmatter, toPath: 'a' })).toBe(false);
  });

  it('returns false when the source does not exist', () => {
    const frontmatter: GenericObject = { a: 5 };
    expect(renameNestedProperty({ fromPath: 'a.b', frontmatter, toPath: 'x.y' })).toBe(false);
  });

  it('returns false when the source leaf is missing', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(renameNestedProperty({ fromPath: 'a.c', frontmatter, toPath: 'a.d' })).toBe(false);
  });

  it('returns false when the target parent chain passes through a non-object', () => {
    const frontmatter: GenericObject = { a: { b: 1 }, c: 5 };
    expect(renameNestedProperty({ fromPath: 'a.b', frontmatter, toPath: 'c.d' })).toBe(false);
    expect(frontmatter).toEqual({ a: { b: 1 }, c: 5 });
  });

  it('returns false when the target already exists', () => {
    const frontmatter: GenericObject = { a: { b: 1, c: 2 } };
    expect(renameNestedProperty({ fromPath: 'a.b', frontmatter, toPath: 'a.c' })).toBe(false);
    expect(frontmatter).toEqual({ a: { b: 1, c: 2 } });
  });

  it('renames a leaf within the same parent', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(renameNestedProperty({ fromPath: 'a.b', frontmatter, toPath: 'a.c' })).toBe(true);
    expect(frontmatter).toEqual({ a: { c: 1 } });
  });

  it('moves to a new path, creating intermediate objects', () => {
    const frontmatter: GenericObject = { a: { b: { value: 1 } } };
    expect(renameNestedProperty({ fromPath: 'a.b', frontmatter, toPath: 'x.y.z' })).toBe(true);
    expect(frontmatter).toEqual({ a: {}, x: { y: { z: { value: 1 } } } });
  });
});
