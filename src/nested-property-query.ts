import type { GenericObject } from 'obsidian-dev-utils/type-guards';

/**
 * A parsed nested-property search query.
 */
export interface NestedPropertyQuery {
  /**
   * The value the leaf property must equal (case-insensitive, and array membership for list values), or
   * `null` to match on the mere existence of the nested path.
   */
  readonly expectedValue: null | string;

  /**
   * The dotted nested property path to look up (e.g. `parent.child`).
   */
  readonly path: string;
}

interface ResolvedNestedValue {
  readonly found: boolean;
  readonly value: unknown;
}

/**
 * Tests whether the given frontmatter satisfies a parsed nested-property query.
 *
 * @param frontmatter - The frontmatter object to test.
 * @param query - The parsed query.
 * @returns `true` when the nested path exists and (if a value was given) matches.
 */
export function matchesNestedPropertyQuery(frontmatter: GenericObject, query: NestedPropertyQuery): boolean {
  const resolved = resolveNestedValue(frontmatter, query.path.split('.'));
  if (!resolved.found) {
    return false;
  }
  const { expectedValue } = query;
  if (expectedValue === null) {
    return true;
  }
  if (Array.isArray(resolved.value)) {
    return resolved.value.some((item) => scalarEquals(item, expectedValue));
  }
  return scalarEquals(resolved.value, expectedValue);
}

/**
 * Parses a nested-property search query.
 *
 * Two equivalent syntaxes are accepted (mirroring the shapes suggested in issue #1):
 *
 * - Bracket chain: `[parent][child]` (existence) or `[parent][child: value]` (value). A value may only
 *   appear in the final bracket.
 * - Dotted path: `parent.child` (existence) or `parent.child: value` (value).
 *
 * @param query - The raw query string.
 * @returns The parsed query, or `null` when the query is empty or malformed.
 */
export function parseNestedPropertyQuery(query: string): NestedPropertyQuery | null {
  const trimmed = query.trim();
  if (trimmed === '') {
    return null;
  }
  return trimmed.includes('[') ? parseBracketQuery(trimmed) : parseDottedQuery(trimmed);
}

function normalizeExpectedValue(value: string): null | string {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parseBracketQuery(query: string): NestedPropertyQuery | null {
  const groups: string[] = [];
  const groupRegExp = /\[[^\]]*\]/g;
  let match: null | RegExpExecArray;
  let consumed = '';
  while ((match = groupRegExp.exec(query)) !== null) {
    const fullMatch = match[0];
    // Strip the surrounding square brackets to get the group contents.
    groups.push(fullMatch.slice(1, -1));
    consumed += fullMatch;
  }
  if (groups.length === 0) {
    return null;
  }
  // Every non-whitespace character must belong to a bracket group.
  if (query.replace(/\s/g, '') !== consumed.replace(/\s/g, '')) {
    return null;
  }

  const keys: string[] = [];
  let expectedValue: null | string = null;
  for (const [index, group] of groups.entries()) {
    const colonIndex = group.indexOf(':');
    if (colonIndex === -1) {
      const key = group.trim();
      if (key === '') {
        return null;
      }
      keys.push(key);
      continue;
    }
    // A value is only allowed in the final bracket.
    if (index !== groups.length - 1) {
      return null;
    }
    const key = group.slice(0, colonIndex).trim();
    if (key === '') {
      return null;
    }
    keys.push(key);
    expectedValue = normalizeExpectedValue(group.slice(colonIndex + 1));
  }

  return { expectedValue, path: keys.join('.') };
}

function parseDottedQuery(query: string): NestedPropertyQuery | null {
  const colonIndex = query.indexOf(':');
  const pathPart = colonIndex === -1 ? query : query.slice(0, colonIndex);
  const expectedValue = colonIndex === -1 ? null : normalizeExpectedValue(query.slice(colonIndex + 1));
  const segments = pathPart.split('.').map((segment) => segment.trim());
  if (segments.some((segment) => segment === '')) {
    return null;
  }
  return { expectedValue, path: segments.join('.') };
}

function resolveNestedValue(frontmatter: GenericObject, segments: string[]): ResolvedNestedValue {
  let current: unknown = frontmatter;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      return { found: false, value: undefined };
    }
    const container = current as GenericObject;
    if (!Object.hasOwn(container, segment)) {
      return { found: false, value: undefined };
    }
    current = container[segment];
  }
  return { found: true, value: current };
}

function scalarEquals(value: unknown, expectedValue: string): boolean {
  return String(value).toLowerCase() === expectedValue.toLowerCase();
}
