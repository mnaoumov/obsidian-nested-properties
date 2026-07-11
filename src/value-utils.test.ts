import {
  describe,
  expect,
  it
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
      expect(convertValue({ targetType: 'multitext', value: arr })).toBe(arr);
    });

    it('should filter out complex items from array', () => {
      expect(convertValue({ targetType: 'multitext', value: [1, { a: 2 }, 3, [4]] })).toEqual([1, 3]);
    });

    it('should wrap string in array', () => {
      expect(convertValue({ targetType: 'multitext', value: 'hello' })).toEqual(['hello']);
    });

    it('should return empty array for empty string', () => {
      expect(convertValue({ targetType: 'multitext', value: '' })).toEqual([]);
    });

    it('should return empty array for null', () => {
      expect(convertValue({ targetType: 'multitext', value: null })).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      expect(convertValue({ targetType: 'multitext', value: undefined })).toEqual([]);
    });

    it('should wrap number as string in array', () => {
      expect(convertValue({ targetType: 'aliases', value: 42 })).toEqual(['42']);
    });

    it('should work for tags type', () => {
      expect(convertValue({ targetType: 'tags', value: 'tag' })).toEqual(['tag']);
    });

    it('should return empty array for objects', () => {
      expect(convertValue({ targetType: 'multitext', value: { a: 1, b: 2 } })).toEqual([]);
    });
  });

  describe('to mixed list', () => {
    it('should return array as-is', () => {
      const arr = [1, { a: 2 }];
      expect(convertValue({ targetType: 'list', value: arr })).toBe(arr);
    });

    it('should wrap object in array', () => {
      const obj = { a: 1 };
      expect(convertValue({ targetType: 'list', value: obj })).toEqual([obj]);
    });

    it('should wrap primitive in array', () => {
      expect(convertValue({ targetType: 'list', value: 'hello' })).toEqual(['hello']);
      expect(convertValue({ targetType: 'list', value: 42 })).toEqual([42]);
      expect(convertValue({ targetType: 'list', value: true })).toEqual([true]);
    });

    it('should return empty array for null', () => {
      expect(convertValue({ targetType: 'list', value: null })).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      expect(convertValue({ targetType: 'list', value: undefined })).toEqual([]);
    });
  });

  describe('to checkbox', () => {
    it('should convert truthy values to true', () => {
      expect(convertValue({ targetType: 'checkbox', value: 'yes' })).toBe(true);
      expect(convertValue({ targetType: 'checkbox', value: 1 })).toBe(true);
      expect(convertValue({ targetType: 'checkbox', value: {} })).toBe(true);
    });

    it('should convert falsy values to false', () => {
      expect(convertValue({ targetType: 'checkbox', value: '' })).toBe(false);
      expect(convertValue({ targetType: 'checkbox', value: 0 })).toBe(false);
      expect(convertValue({ targetType: 'checkbox', value: null })).toBe(false);
    });
  });

  describe('to date/datetime', () => {
    it('should return valid date string as-is', () => {
      expect(convertValue({ targetType: 'date', value: '2024-01-15' })).toBe('2024-01-15');
    });

    it('should return null for invalid date', () => {
      expect(convertValue({ targetType: 'date', value: 'not-a-date' })).toBeNull();
    });

    it('should return null for non-string values', () => {
      expect(convertValue({ targetType: 'datetime', value: 42 })).toBeNull();
      expect(convertValue({ targetType: 'datetime', value: null })).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(convertValue({ targetType: 'datetime', value: '' })).toBeNull();
    });
  });

  describe('to number', () => {
    it('should convert numeric string', () => {
      expect(convertValue({ targetType: 'number', value: '42' })).toBe(42);
    });

    it('should return 0 for non-numeric string', () => {
      expect(convertValue({ targetType: 'number', value: 'hello' })).toBe(0);
    });

    it('should return 0 for null', () => {
      expect(convertValue({ targetType: 'number', value: null })).toBe(0);
    });

    it('should pass through numbers', () => {
      expect(convertValue({ targetType: 'number', value: 42 })).toBe(42);
    });
  });

  describe('to object', () => {
    it('should return objects as-is', () => {
      const obj = { a: 1 };
      expect(convertValue({ targetType: 'object', value: obj })).toBe(obj);
    });

    it('should convert arrays to empty objects', () => {
      expect(convertValue({ targetType: 'object', value: [1, 2] })).toEqual({});
    });

    it('should return empty object for primitives', () => {
      expect(convertValue({ targetType: 'object', value: 'hello' })).toEqual({});
      expect(convertValue({ targetType: 'object', value: 42 })).toEqual({});
      expect(convertValue({ targetType: 'object', value: null })).toEqual({});
    });
  });

  describe('to text (default)', () => {
    it('should convert to string', () => {
      expect(convertValue({ targetType: 'text', value: 42 })).toBe('42');
      expect(convertValue({ targetType: 'text', value: true })).toBe('true');
    });

    it('should return empty string for null', () => {
      expect(convertValue({ targetType: 'text', value: null })).toBe('');
    });

    it('should use text as default for unknown types', () => {
      expect(convertValue({ targetType: 'unknown-type', value: 42 })).toBe('42');
    });
  });
});

describe('isLossyConversion', () => {
  it('should not be lossy for simple primitive array to multitext', () => {
    expect(isLossyConversion({ targetType: 'multitext', value: [1, 2, 3] })).toBe(false);
  });

  it('should not be lossy for simple string array to aliases', () => {
    expect(isLossyConversion({ targetType: 'aliases', value: ['a', 'b'] })).toBe(false);
  });

  it('should not be lossy for simple string array to tags', () => {
    expect(isLossyConversion({ targetType: 'tags', value: ['a', 'b'] })).toBe(false);
  });

  it('should not be lossy for simple string array to multitext', () => {
    expect(isLossyConversion({ targetType: 'multitext', value: ['a', 'b'] })).toBe(false);
  });

  it('should be lossy for mixed array to multitext', () => {
    expect(isLossyConversion({ targetType: 'multitext', value: [1, { a: 2 }, 3] })).toBe(true);
  });

  it('should be lossy for object to multitext', () => {
    expect(isLossyConversion({ targetType: 'multitext', value: { a: 1 } })).toBe(true);
  });

  it('should be lossy for array to object', () => {
    expect(isLossyConversion({ targetType: 'object', value: [1, 2] })).toBe(true);
  });

  it('should not be lossy for object to object', () => {
    expect(isLossyConversion({ targetType: 'object', value: { a: 1 } })).toBe(false);
  });

  it('should not be lossy for array to list', () => {
    expect(isLossyConversion({ targetType: 'list', value: [1, 2] })).toBe(false);
  });

  it('should be lossy for object to list', () => {
    expect(isLossyConversion({ targetType: 'list', value: { a: 1 } })).toBe(true);
  });

  it('should be lossy for primitive to list', () => {
    expect(isLossyConversion({ targetType: 'list', value: 'hello' })).toBe(true);
  });

  it('should not be lossy for other target types', () => {
    expect(isLossyConversion({ targetType: 'text', value: 'hello' })).toBe(false);
    expect(isLossyConversion({ targetType: 'number', value: 42 })).toBe(false);
    expect(isLossyConversion({ targetType: 'checkbox', value: true })).toBe(false);
  });
});
