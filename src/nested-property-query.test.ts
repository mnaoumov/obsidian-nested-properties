import type { GenericObject } from 'obsidian-dev-utils/type-guards';

import {
  describe,
  expect,
  it
} from 'vitest';

import {
  matchesNestedPropertyQuery,
  parseNestedPropertyQuery
} from './nested-property-query.ts';

describe('parseNestedPropertyQuery', () => {
  it('returns null for an empty query', () => {
    expect(parseNestedPropertyQuery('   ')).toBeNull();
  });

  describe('bracket syntax', () => {
    it('parses an existence chain', () => {
      expect(parseNestedPropertyQuery('[parent][child]')).toEqual({ expectedValue: null, path: 'parent.child' });
    });

    it('parses a value in the final bracket', () => {
      expect(parseNestedPropertyQuery('[parent][child: value]')).toEqual({ expectedValue: 'value', path: 'parent.child' });
    });

    it('treats an empty value as existence', () => {
      expect(parseNestedPropertyQuery('[parent][child: ]')).toEqual({ expectedValue: null, path: 'parent.child' });
    });

    it('returns null when there are no bracket groups', () => {
      expect(parseNestedPropertyQuery('[unclosed')).toBeNull();
    });

    it('returns null when there is text outside the bracket groups', () => {
      expect(parseNestedPropertyQuery('[a]x[b]')).toBeNull();
    });

    it('returns null for an empty bracket key', () => {
      expect(parseNestedPropertyQuery('[a][]')).toBeNull();
    });

    it('returns null when a value appears in a non-final bracket', () => {
      expect(parseNestedPropertyQuery('[a: 1][b]')).toBeNull();
    });

    it('returns null when the final valued bracket has an empty key', () => {
      expect(parseNestedPropertyQuery('[a][: value]')).toBeNull();
    });
  });

  describe('dotted syntax', () => {
    it('parses an existence path', () => {
      expect(parseNestedPropertyQuery('parent.child')).toEqual({ expectedValue: null, path: 'parent.child' });
    });

    it('parses a value path', () => {
      expect(parseNestedPropertyQuery('parent.child: value')).toEqual({ expectedValue: 'value', path: 'parent.child' });
    });

    it('treats an empty value as existence', () => {
      expect(parseNestedPropertyQuery('parent.child:')).toEqual({ expectedValue: null, path: 'parent.child' });
    });

    it('returns null for an empty path segment', () => {
      expect(parseNestedPropertyQuery('parent..child')).toBeNull();
    });
  });
});

describe('matchesNestedPropertyQuery', () => {
  const frontmatter: GenericObject = {
    parent: {
      child: 'Value',
      list: ['one', 'two'],
      nested: {
        leaf: 1
      }
    }
  };

  it('matches on existence when no value is given', () => {
    expect(matchesNestedPropertyQuery(frontmatter, { expectedValue: null, path: 'parent.nested.leaf' })).toBe(true);
  });

  it('returns false when the path does not exist', () => {
    expect(matchesNestedPropertyQuery(frontmatter, { expectedValue: null, path: 'parent.missing' })).toBe(false);
  });

  it('returns false when an intermediate segment is not an object', () => {
    expect(matchesNestedPropertyQuery(frontmatter, { expectedValue: null, path: 'parent.child.deeper' })).toBe(false);
  });

  it('returns false when an intermediate segment is an array', () => {
    expect(matchesNestedPropertyQuery(frontmatter, { expectedValue: null, path: 'parent.list.item' })).toBe(false);
  });

  it('matches a scalar value case-insensitively', () => {
    expect(matchesNestedPropertyQuery(frontmatter, { expectedValue: 'value', path: 'parent.child' })).toBe(true);
  });

  it('does not match a different scalar value', () => {
    expect(matchesNestedPropertyQuery(frontmatter, { expectedValue: 'other', path: 'parent.child' })).toBe(false);
  });

  it('matches when the value is a member of a list', () => {
    expect(matchesNestedPropertyQuery(frontmatter, { expectedValue: 'two', path: 'parent.list' })).toBe(true);
  });

  it('does not match when the value is absent from a list', () => {
    expect(matchesNestedPropertyQuery(frontmatter, { expectedValue: 'three', path: 'parent.list' })).toBe(false);
  });
});
