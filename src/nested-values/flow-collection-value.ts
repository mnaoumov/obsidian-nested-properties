import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { parseYaml } from 'obsidian';

import { isComplexValue } from './value-utils.ts';

/**
 * Reads a text property value typed as a YAML flow collection - `{ key: value, other: value }` or
 * `[{ key: value }]` - as the nested value it describes, so a nested property can be entered from the
 * keyboard alone (issue #15).
 *
 * Deliberately narrow, so ordinary text never changes:
 *
 * - the text must be wrapped in `{ }` or `[ ]` after trimming;
 * - `[[wikilink]]` and `{{template}}` are left alone, although YAML would read both as nested collections;
 * - a `[ ... ]` converts only when it holds an object, because a plain `[a, b]` is a list, which Obsidian's
 *   own List type already covers, and an array of arrays is what a wikilink parses to;
 * - anything YAML refuses to parse is left as typed.
 *
 * @param text - The text as the property widget committed it.
 * @returns The nested value, or `null` when the text should stay text.
 */
export function parseFlowCollectionValue(text: string): unknown {
  const trimmedText = text.trim();
  const isObjectShape = trimmedText.startsWith('{') && trimmedText.endsWith('}');
  const isArrayShape = trimmedText.startsWith('[') && trimmedText.endsWith(']');
  if (!isObjectShape && !isArrayShape) {
    return null;
  }

  if (trimmedText.startsWith('{{') || trimmedText.startsWith('[[')) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(addSpaceAfterKeyColons(trimmedText));
  } catch {
    return null;
  }

  // A text that opens and closes with braces only ever parses to a mapping, and one with brackets only to a
  // sequence, so the shape decides which test applies.
  const isConvertible = isObjectShape ? isPlainObject(parsed) : castTo<unknown[]>(parsed).some((item) => isPlainObject(item));
  return isConvertible ? parsed : null;
}

/**
 * YAML reads `{key:value}` as the single key `key:value`, because a colon separates a key only when a space
 * follows it. People type it without the space all the same - the issue's own example does - so the colon
 * right after an unquoted key that opens a flow entry gets its space. A colon inside a value, as in
 * `{ url: https://example.com }` or `{ time: 12:30 }`, is not after an entry's opening key, so it is untouched.
 *
 * @param text - The flow collection as typed.
 * @returns The text with a space after each key colon that lacked one.
 */
function addSpaceAfterKeyColons(text: string): string {
  return text.replaceAll(/(?<prefix>[{,]\s*[^\s"',:[\]{}]+):(?=\S)/g, '$<prefix>: ');
}

function isPlainObject(value: unknown): boolean {
  return isComplexValue(value) && !Array.isArray(value);
}
