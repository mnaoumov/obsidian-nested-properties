import {
  describe,
  expect,
  it
} from 'vitest';

import { parseFlowCollectionValue } from './flow-collection-value.ts';

describe('parseFlowCollectionValue', () => {
  it('should read a flow mapping as an object', () => {
    expect(parseFlowCollectionValue('{ key: value, otherKey: other value }')).toEqual({ key: 'value', otherKey: 'other value' });
  });

  it('should read a flow mapping with no spaces, as the issue types it', () => {
    expect(parseFlowCollectionValue('{key:value}')).toEqual({ key: 'value' });
  });

  it('should read a list of objects typed with no spaces', () => {
    expect(parseFlowCollectionValue('[{key:value,other:1}]')).toEqual([{ key: 'value', other: 1 }]);
  });

  it('should keep a colon inside a value', () => {
    expect(parseFlowCollectionValue('{url:https://example.com, time: 12:30}')).toEqual({ time: '12:30', url: 'https://example.com' });
  });

  it('should keep a colon inside a quoted key', () => {
    expect(parseFlowCollectionValue('{"a:b": 1}')).toEqual({ 'a:b': 1 });
  });

  it('should ignore surrounding whitespace', () => {
    expect(parseFlowCollectionValue('  { a: 1 }  ')).toEqual({ a: 1 });
  });

  it('should read an empty mapping as an empty object', () => {
    expect(parseFlowCollectionValue('{}')).toEqual({});
  });

  it('should read nested flow collections', () => {
    expect(parseFlowCollectionValue('{ book: { author: Jane, tags: [a, b] } }')).toEqual({ book: { author: 'Jane', tags: ['a', 'b'] } });
  });

  it('should read a list of objects', () => {
    expect(parseFlowCollectionValue('[{key: value}, {key: other}]')).toEqual([{ key: 'value' }, { key: 'other' }]);
  });

  it('should read a list mixing scalars and objects', () => {
    expect(parseFlowCollectionValue('[a, { b: 1 }]')).toEqual(['a', { b: 1 }]);
  });

  it('should leave a plain list as text', () => {
    expect(parseFlowCollectionValue('[a, b]')).toBeNull();
  });

  it('should leave an empty list as text', () => {
    expect(parseFlowCollectionValue('[]')).toBeNull();
  });

  it('should leave a list of lists as text', () => {
    expect(parseFlowCollectionValue('[[a], [b]]')).toBeNull();
  });

  it('should leave a wikilink as text', () => {
    expect(parseFlowCollectionValue('[[Some note]]')).toBeNull();
  });

  it('should leave a template placeholder as text', () => {
    expect(parseFlowCollectionValue('{{date}}')).toBeNull();
  });

  it('should leave plain text as text', () => {
    expect(parseFlowCollectionValue('just text')).toBeNull();
  });

  it('should leave text that only starts with a brace as text', () => {
    expect(parseFlowCollectionValue('{a: 1} and more')).toBeNull();
  });

  it('should leave an unparsable collection as text', () => {
    expect(parseFlowCollectionValue('{ a: [ }')).toBeNull();
  });

  it('should leave an empty string as text', () => {
    expect(parseFlowCollectionValue('')).toBeNull();
  });
});
