import { parseYaml } from 'obsidian';

/**
 * A whole value that is one wikilink, `[[note]]`, `[[note|alias]]` or `[[note#heading]]`. Obsidian's link
 * suggester inserts a link that way into a text property and Obsidian stores it as the quoted string, so it stays
 * text, although YAML would read it as a list holding a list.
 */
const WIKILINK_REGEXP = /^\[\[[^[\]]*\]\]$/;

/**
 * Reads a text property value typed as a YAML flow collection - `{ key: value }`, `[a, b]`, `[]` or
 * `[{ key: value }]` - as the value it describes, so a nested property or a list can be entered from the
 * keyboard alone (issue #15).
 *
 * Deliberately narrow, so ordinary text never changes:
 *
 * - the text must be wrapped in `{ }` or `[ ]` after trimming;
 * - a whole value that is one `[[wikilink]]`, and a `{{template}}`, are left alone, although YAML would read both
 *   as nested collections. Inside a list YAML rules apply, so a link there is written quoted: `["[[a]]", "[[b]]"]`;
 * - anything YAML refuses to parse is left as typed.
 *
 * @param text - The text as the property widget committed it.
 * @returns The value, or `null` when the text should stay text.
 */
export function parseFlowCollectionValue(text: string): unknown {
  const trimmedText = text.trim();
  const isObjectShape = trimmedText.startsWith('{') && trimmedText.endsWith('}');
  const isArrayShape = trimmedText.startsWith('[') && trimmedText.endsWith(']');
  if (!isObjectShape && !isArrayShape) {
    return null;
  }

  if (trimmedText.startsWith('{{') || WIKILINK_REGEXP.test(trimmedText)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(addSpaceAfterKeyColons(trimmedText));
  } catch {
    return null;
  }

  // A text in brackets is a sequence and one in braces a mapping - unless the first bracket opens a complex key,
  // as in `[a]: b]`, which YAML reads as a mapping. That one stays text.
  return Array.isArray(parsed) === isArrayShape ? parsed : null;
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
