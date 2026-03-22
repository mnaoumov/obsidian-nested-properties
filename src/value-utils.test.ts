import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  convertValue,
  isComplexValue,
  isLossyConversion,
  isSimpleArray
} from './value-utils.ts';

describe('isComplexValue', () => {
  it('should return true for plain objects', () => {
    expect(isComplexValue({ a: 1 })).toBe(true);
  });

  it('should return true for arrays', () => {
    expect(isComplexValue([1, 2, 3])).toBe(true);
  });

  it('should return true for empty objects', () => {
    expect(isComplexValue({})).toBe(true);
  });

  it('should return true for empty arrays', () => {
    expect(isComplexValue([])).toBe(true);
  });

  it('should return false for null', () => {
    expect(isComplexValue(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isComplexValue(undefined)).toBe(false);
  });

  it('should return false for strings', () => {
    expect(isComplexValue('hello')).toBe(false);
  });

  it('should return false for numbers', () => {
    expect(isComplexValue(42)).toBe(false);
  });

  it('should return false for booleans', () => {
    expect(isComplexValue(true)).toBe(false);
  });
});

describe('isSimpleArray', () => {
  it('should return true for array of strings', () => {
    expect(isSimpleArray(['a', 'b', 'c'])).toBe(true);
  });

  it('should return true for array of numbers', () => {
    expect(isSimpleArray([1, 2, 3])).toBe(true);
  });

  it('should return true for array of mixed primitives', () => {
    expect(isSimpleArray([1, 'a', true, null])).toBe(true);
  });

  it('should return true for empty array', () => {
    expect(isSimpleArray([])).toBe(true);
  });

  it('should return false for array containing objects', () => {
    expect(isSimpleArray([{ a: 1 }])).toBe(false);
  });

  it('should return false for array containing arrays', () => {
    expect(isSimpleArray([[1, 2]])).toBe(false);
  });

  it('should return false for array with mixed complex and primitive', () => {
    expect(isSimpleArray([1, { a: 1 }])).toBe(false);
  });

  it('should return false for non-arrays', () => {
    expect(isSimpleArray({ a: 1 })).toBe(false);
    expect(isSimpleArray('hello')).toBe(false);
    expect(isSimpleArray(42)).toBe(false);
    expect(isSimpleArray(null)).toBe(false);
  });
});

describe('convertValue', () => {
  describe('to simple list types (aliases/multitext/tags)', () => {
    it('should return simple array as-is', () => {
      const arr = [1, 2, 3];
      expect(convertValue(arr, 'multitext')).toBe(arr);
    });

    it('should filter out complex items from array', () => {
      expect(convertValue([1, { a: 2 }, 3, [4]], 'multitext')).toEqual([1, 3]);
    });

    it('should wrap string in array', () => {
      expect(convertValue('hello', 'multitext')).toEqual(['hello']);
    });

    it('should return empty array for empty string', () => {
      expect(convertValue('', 'multitext')).toEqual([]);
    });

    it('should return empty array for null', () => {
      expect(convertValue(null, 'multitext')).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      expect(convertValue(undefined, 'multitext')).toEqual([]);
    });

    it('should wrap number as string in array', () => {
      expect(convertValue(42, 'aliases')).toEqual(['42']);
    });

    it('should work for tags type', () => {
      expect(convertValue('tag', 'tags')).toEqual(['tag']);
    });

    it('should return empty array for objects', () => {
      expect(convertValue({ a: 1, b: 2 }, 'multitext')).toEqual([]);
    });
  });

  describe('to mixed list', () => {
    it('should return array as-is', () => {
      const arr = [1, { a: 2 }];
      expect(convertValue(arr, 'list')).toBe(arr);
    });

    it('should wrap object in array', () => {
      const obj = { a: 1 };
      expect(convertValue(obj, 'list')).toEqual([obj]);
    });

    it('should wrap primitive in array', () => {
      expect(convertValue('hello', 'list')).toEqual(['hello']);
      expect(convertValue(42, 'list')).toEqual([42]);
      expect(convertValue(true, 'list')).toEqual([true]);
    });

    it('should return empty array for null', () => {
      expect(convertValue(null, 'list')).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      expect(convertValue(undefined, 'list')).toEqual([]);
    });
  });

  describe('to checkbox', () => {
    it('should convert truthy values to true', () => {
      expect(convertValue('yes', 'checkbox')).toBe(true);
      expect(convertValue(1, 'checkbox')).toBe(true);
      expect(convertValue({}, 'checkbox')).toBe(true);
    });

    it('should convert falsy values to false', () => {
      expect(convertValue('', 'checkbox')).toBe(false);
      expect(convertValue(0, 'checkbox')).toBe(false);
      expect(convertValue(null, 'checkbox')).toBe(false);
    });
  });

  describe('to date/datetime', () => {
    it('should return valid date string as-is', () => {
      vi.stubGlobal('window', { moment: (v: string) => ({ isValid: (): boolean => !isNaN(Date.parse(v)) }) });
      expect(convertValue('2024-01-15', 'date')).toBe('2024-01-15');
    });

    it('should return null for invalid date', () => {
      vi.stubGlobal('window', { moment: () => ({ isValid: (): boolean => false }) });
      expect(convertValue('not-a-date', 'date')).toBeNull();
    });

    it('should return null for non-string values', () => {
      expect(convertValue(42, 'datetime')).toBeNull();
      expect(convertValue(null, 'datetime')).toBeNull();
    });
  });

  describe('to number', () => {
    it('should convert numeric string', () => {
      expect(convertValue('42', 'number')).toBe(42);
    });

    it('should return 0 for non-numeric string', () => {
      expect(convertValue('hello', 'number')).toBe(0);
    });

    it('should return 0 for null', () => {
      expect(convertValue(null, 'number')).toBe(0);
    });

    it('should pass through numbers', () => {
      expect(convertValue(42, 'number')).toBe(42);
    });
  });

  describe('to object', () => {
    it('should return objects as-is', () => {
      const obj = { a: 1 };
      expect(convertValue(obj, 'object')).toBe(obj);
    });

    it('should convert arrays to empty objects', () => {
      expect(convertValue([1, 2], 'object')).toEqual({});
    });

    it('should return empty object for primitives', () => {
      expect(convertValue('hello', 'object')).toEqual({});
      expect(convertValue(42, 'object')).toEqual({});
      expect(convertValue(null, 'object')).toEqual({});
    });
  });

  describe('to text (default)', () => {
    it('should convert to string', () => {
      expect(convertValue(42, 'text')).toBe('42');
      expect(convertValue(true, 'text')).toBe('true');
    });

    it('should return empty string for null', () => {
      expect(convertValue(null, 'text')).toBe('');
    });

    it('should use text as default for unknown types', () => {
      expect(convertValue(42, 'unknown-type')).toBe('42');
    });
  });
});

describe('isLossyConversion', () => {
  it('should not be lossy for simple primitive array to multitext', () => {
    expect(isLossyConversion([1, 2, 3], 'multitext')).toBe(false);
  });

  it('should not be lossy for simple string array to multitext', () => {
    expect(isLossyConversion(['a', 'b'], 'multitext')).toBe(false);
  });

  it('should be lossy for mixed array to multitext', () => {
    expect(isLossyConversion([1, { a: 2 }, 3], 'multitext')).toBe(true);
  });

  it('should be lossy for object to multitext', () => {
    expect(isLossyConversion({ a: 1 }, 'multitext')).toBe(true);
  });

  it('should be lossy for array to object', () => {
    expect(isLossyConversion([1, 2], 'object')).toBe(true);
  });

  it('should not be lossy for object to object', () => {
    expect(isLossyConversion({ a: 1 }, 'object')).toBe(false);
  });

  it('should not be lossy for array to list', () => {
    expect(isLossyConversion([1, 2], 'list')).toBe(false);
  });

  it('should be lossy for object to list', () => {
    expect(isLossyConversion({ a: 1 }, 'list')).toBe(true);
  });

  it('should be lossy for primitive to list', () => {
    expect(isLossyConversion('hello', 'list')).toBe(true);
  });
});
