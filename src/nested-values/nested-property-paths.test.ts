import type { GenericObject } from '@mnaoumov/typescript-lib/type-guards';

import {
  describe,
  expect,
  it
} from 'vitest';

import {
  buildNestedPropertyUpdate,
  collectNestedPropertyEntries,
  collectNestedPropertyPaths,
  didDeleteNestedProperty,
  didRenameNestedProperty,
  getNestedPropertyValue,
  resolveNestedPropertyKeys
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

describe('didDeleteNestedProperty', () => {
  it('returns false for an empty path', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(didDeleteNestedProperty({ frontmatter, path: '' })).toBe(false);
    expect(frontmatter).toEqual({ a: { b: 1 } });
  });

  it('returns false when an intermediate segment is not an object', () => {
    const frontmatter: GenericObject = { a: 5 };
    expect(didDeleteNestedProperty({ frontmatter, path: 'a.b' })).toBe(false);
    expect(frontmatter).toEqual({ a: 5 });
  });

  it('returns false when the leaf key is missing', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(didDeleteNestedProperty({ frontmatter, path: 'a.c' })).toBe(false);
    expect(frontmatter).toEqual({ a: { b: 1 } });
  });

  it('deletes the leaf and preserves the (now empty) parent', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(didDeleteNestedProperty({ frontmatter, path: 'a.b' })).toBe(true);
    expect(frontmatter).toEqual({ a: {} });
  });
});

describe('didRenameNestedProperty', () => {
  it('returns false when either path is empty', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(didRenameNestedProperty({ fromPath: '', frontmatter, toPath: 'a.c' })).toBe(false);
    expect(didRenameNestedProperty({ fromPath: 'a.b', frontmatter, toPath: '' })).toBe(false);
  });

  it('returns false when the paths are equal', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(didRenameNestedProperty({ fromPath: 'a.b', frontmatter, toPath: 'a.b' })).toBe(false);
  });

  it('returns false when the target is a descendant of the source', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(didRenameNestedProperty({ fromPath: 'a', frontmatter, toPath: 'a.b' })).toBe(false);
  });

  it('returns false when the source is a descendant of the target', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(didRenameNestedProperty({ fromPath: 'a.b', frontmatter, toPath: 'a' })).toBe(false);
  });

  it('returns false when the source does not exist', () => {
    const frontmatter: GenericObject = { a: 5 };
    expect(didRenameNestedProperty({ fromPath: 'a.b', frontmatter, toPath: 'x.y' })).toBe(false);
  });

  it('returns false when the source leaf is missing', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(didRenameNestedProperty({ fromPath: 'a.c', frontmatter, toPath: 'a.d' })).toBe(false);
  });

  it('returns false when the target parent chain passes through a non-object', () => {
    const frontmatter: GenericObject = { a: { b: 1 }, c: 5 };
    expect(didRenameNestedProperty({ fromPath: 'a.b', frontmatter, toPath: 'c.d' })).toBe(false);
    expect(frontmatter).toEqual({ a: { b: 1 }, c: 5 });
  });

  it('returns false when the target already exists', () => {
    const frontmatter: GenericObject = { a: { b: 1, c: 2 } };
    expect(didRenameNestedProperty({ fromPath: 'a.b', frontmatter, toPath: 'a.c' })).toBe(false);
    expect(frontmatter).toEqual({ a: { b: 1, c: 2 } });
  });

  it('renames a leaf within the same parent', () => {
    const frontmatter: GenericObject = { a: { b: 1 } };
    expect(didRenameNestedProperty({ fromPath: 'a.b', frontmatter, toPath: 'a.c' })).toBe(true);
    expect(frontmatter).toEqual({ a: { c: 1 } });
  });

  it('moves to a new path, creating intermediate objects', () => {
    const frontmatter: GenericObject = { a: { b: { value: 1 } } };
    expect(didRenameNestedProperty({ fromPath: 'a.b', frontmatter, toPath: 'x.y.z' })).toBe(true);
    expect(frontmatter).toEqual({ a: {}, x: { y: { z: { value: 1 } } } });
  });
});

describe('resolveNestedPropertyKeys', () => {
  it('returns the actual keys, matching each segment case-insensitively', () => {
    expect(resolveNestedPropertyKeys({ Book: { Author: 'x' } }, 'book.author')).toEqual(['Book', 'Author']);
  });

  it('prefers an exact spelling over a case-insensitive one', () => {
    expect(resolveNestedPropertyKeys({ book: { a: 1, A: 2 } }, 'book.A')).toEqual(['book', 'A']);
  });

  it('returns null for a top-level path', () => {
    expect(resolveNestedPropertyKeys({ book: 1 }, 'book')).toBeNull();
  });

  it('returns null when a top-level key is spelled as the whole dotted path', () => {
    expect(resolveNestedPropertyKeys({ 'book': { author: 'nested' }, 'book.author': 'flat' }, 'book.author')).toBeNull();
  });

  it('returns null for a missing segment', () => {
    expect(resolveNestedPropertyKeys({ book: { title: 'x' } }, 'book.author')).toBeNull();
  });

  it('returns null when the path passes through a non-object', () => {
    expect(resolveNestedPropertyKeys({ book: ['a'] }, 'book.0')).toBeNull();
  });
});

describe('getNestedPropertyValue', () => {
  it('returns the value at the path', () => {
    expect(getNestedPropertyValue({ book: { meta: { year: 1969 } } }, 'book.meta.year')).toBe(1969);
  });

  it('returns null when the path does not resolve', () => {
    expect(getNestedPropertyValue({ book: {} }, 'book.author')).toBeNull();
  });
});

describe('buildNestedPropertyUpdate', () => {
  it('returns a copy of the top-level object with the nested value set, leaving the input untouched', () => {
    const frontmatter: GenericObject = { book: { author: 'Ursula', year: 1969 } };
    expect(buildNestedPropertyUpdate({ frontmatter, path: 'book.author', value: 'Le Guin' })).toEqual({
      key: 'book',
      value: { author: 'Le Guin', year: 1969 }
    });
    expect(frontmatter).toEqual({ book: { author: 'Ursula', year: 1969 } });
  });

  it('keeps the existing spelling of every key', () => {
    expect(buildNestedPropertyUpdate({ frontmatter: { Book: { Author: 'x' } }, path: 'book.author', value: 'y' })).toEqual({
      key: 'Book',
      value: { Author: 'y' }
    });
  });

  it('creates the missing objects along the path', () => {
    expect(buildNestedPropertyUpdate({ frontmatter: {}, path: 'book.meta.year', value: 1969 })).toEqual({
      key: 'book',
      value: { meta: { year: 1969 } }
    });
  });

  it('treats a null top-level value as an empty object', () => {
    expect(buildNestedPropertyUpdate({ frontmatter: { book: null }, path: 'book.author', value: 'x' })).toEqual({
      key: 'book',
      value: { author: 'x' }
    });
  });

  it('returns null for a top-level path', () => {
    expect(buildNestedPropertyUpdate({ frontmatter: {}, path: 'book', value: 'x' })).toBeNull();
  });

  it('returns null when a top-level key is spelled as the whole dotted path', () => {
    expect(buildNestedPropertyUpdate({ frontmatter: { 'book.author': 'flat' }, path: 'book.author', value: 'x' })).toBeNull();
  });

  it('returns null when the top-level value is not an object', () => {
    expect(buildNestedPropertyUpdate({ frontmatter: { book: 'scalar' }, path: 'book.author', value: 'x' })).toBeNull();
  });

  it('returns null when an intermediate value is not an object', () => {
    expect(buildNestedPropertyUpdate({ frontmatter: { book: { meta: 'scalar' } }, path: 'book.meta.year', value: 1 })).toBeNull();
  });
});
