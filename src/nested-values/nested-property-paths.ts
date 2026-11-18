import type { GenericObject } from '@mnaoumov/typescript-lib/type-guards';

import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';

// A nested path has at least a parent key and a child key.
const MIN_NESTED_SEGMENT_COUNT = 2;

/**
 * A nested property path (depth of two or more segments) paired with the value found there.
 */
export interface NestedPropertyEntry {
  /**
   * The dotted nested property path (e.g. `a.b.c`).
   */
  readonly path: string;

  /**
   * The value the path resolves to (a scalar, array, or nested object).
   */
  readonly value: unknown;
}

/**
 * A replacement for one top-level frontmatter key that carries a nested property change.
 */
export interface NestedPropertyUpdate {
  /**
   * The top-level frontmatter key to replace, spelled as it already is in the note when it exists.
   */
  readonly key: string;

  /**
   * The new value of that key: a copy of its current object with the nested property set.
   */
  readonly value: GenericObject;
}

/**
 * Parameters for {@link buildNestedPropertyUpdate}.
 */
interface BuildNestedPropertyUpdateParams {
  /**
   * The note's current frontmatter. It is not mutated.
   */
  readonly frontmatter: GenericObject;

  /**
   * The dotted nested property path to set (e.g. `book.author`). Segments match keys case-insensitively, as
   * Obsidian matches top-level property names.
   */
  readonly path: string;

  /**
   * The value to store at the path.
   */
  readonly value: unknown;
}

/**
 * Parameters for {@link didDeleteNestedProperty}.
 */
interface DidDeleteNestedPropertyParams {
  /**
   * The frontmatter object to mutate in place.
   */
  readonly frontmatter: GenericObject;

  /**
   * The dotted path of the nested property to delete (e.g. `a.b.c`).
   */
  readonly path: string;
}

/**
 * Parameters for {@link didRenameNestedProperty}.
 */
interface DidRenameNestedPropertyParams {
  /**
   * The dotted path of the nested property as it exists now (e.g. `a.b.c`).
   */
  readonly fromPath: string;

  /**
   * The frontmatter object to mutate in place.
   */
  readonly frontmatter: GenericObject;

  /**
   * The dotted path the nested property should have after the rename (e.g. `a.b.d`). Intermediate
   * objects are created as needed.
   */
  readonly toPath: string;
}

interface ResolvedNestedProperty {
  readonly keys: string[];
  readonly value: unknown;
}

/**
 * Builds the top-level key replacement that sets a nested property, so a writer that can only replace one
 * top-level key (Bases' cell editor) can store a nested value.
 *
 * Intermediate objects that do not exist yet are created, using the path's own spelling.
 *
 * @param params - The parameters.
 * @returns The update, or `null` when the path is not nested, when the note has a top-level key spelled as the
 *   whole dotted path, or when the path passes through a value that is not an object.
 */
export function buildNestedPropertyUpdate(params: BuildNestedPropertyUpdateParams): NestedPropertyUpdate | null {
  const { frontmatter, path, value } = params;
  const segments = splitPath(path);
  if (segments.length < MIN_NESTED_SEGMENT_COUNT || findKey(frontmatter, path) !== null) {
    return null;
  }

  const [firstSegment = '', ...restSegments] = segments;
  const topKey = findKey(frontmatter, firstSegment) ?? firstSegment;
  const topValue = frontmatter[topKey] ?? {};
  if (!isPlainObject(topValue)) {
    return null;
  }

  // Copy-on-write along the path only: every object on it is a fresh shallow copy, and the siblings off it are
  // shared, so the note's cached frontmatter is never mutated.
  const copy = { ...topValue };
  let current = copy;
  for (const segment of restSegments.slice(0, -1)) {
    const key = findKey(current, segment) ?? segment;
    const next = current[key] ?? {};
    if (!isPlainObject(next)) {
      return null;
    }
    const nextCopy = { ...next };
    current[key] = nextCopy;
    current = nextCopy;
  }
  const leaf = lastSegment(restSegments);
  current[findKey(current, leaf) ?? leaf] = value;
  return { key: topKey, value: copy };
}

/**
 * Collects every nested property path (depth of two or more segments) reachable by descending through
 * plain objects in the given frontmatter, paired with the value found at each path.
 *
 * This is the value-carrying companion of {@link collectNestedPropertyPaths}: it drives the native-search
 * patch, which must match both the nested key path and its value. The same rationale applies — top-level
 * keys (depth one) are excluded because Obsidian's own search already matches them, and arrays are not
 * descended into (array indices are not stable property names), though the array-valued path itself is
 * recorded so a list-member value query can match against it.
 *
 * @param frontmatter - The frontmatter object to scan.
 * @returns The nested property entries in document order.
 */
export function collectNestedPropertyEntries(frontmatter: GenericObject): NestedPropertyEntry[] {
  const entries: NestedPropertyEntry[] = [];
  collectEntriesInto(frontmatter, '', entries);
  return entries;
}

/**
 * Collects every nested property path (depth of two or more segments) reachable by descending through
 * plain objects in the given frontmatter.
 *
 * Top-level keys (depth one) are intentionally excluded because Obsidian's own "All properties" view
 * already manages them; this plugin only surfaces the nested paths Obsidian cannot. Arrays are not
 * descended into: array indices are not stable property names.
 *
 * @param frontmatter - The frontmatter object to scan.
 * @returns A sorted, de-duplicated list of dotted nested property paths.
 */
export function collectNestedPropertyPaths(frontmatter: GenericObject): string[] {
  const paths = new Set(collectNestedPropertyEntries(frontmatter).map((entry) => entry.path));
  return [...paths].sort((a, b) => a.localeCompare(b));
}

/**
 * Deletes a nested property from the given frontmatter in place.
 *
 * Empty parent objects left behind are intentionally preserved (deleting them could remove unrelated
 * siblings a caller still relies on).
 *
 * @param params - The parameters.
 * @returns `true` when the property existed and was removed, otherwise `false`.
 */
export function didDeleteNestedProperty(params: DidDeleteNestedPropertyParams): boolean {
  const { frontmatter, path } = params;
  const segments = splitPath(path);
  if (segments.length === 0) {
    return false;
  }
  const parent = resolveParent(frontmatter, segments);
  if (parent === null) {
    return false;
  }
  const leaf = lastSegment(segments);
  if (!Object.hasOwn(parent, leaf)) {
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Removing a user-chosen nested key.
  delete parent[leaf];
  return true;
}

/**
 * Renames (or moves) a nested property in the given frontmatter in place.
 *
 * The operation is rejected (returns `false`, leaving the frontmatter untouched) when: the source path
 * does not exist; the source and target paths are equal or one is an ancestor of the other; the target
 * path already exists; or the target's parent chain passes through a non-object value.
 *
 * @param params - The parameters.
 * @returns `true` when the rename was applied, otherwise `false`.
 */
export function didRenameNestedProperty(params: DidRenameNestedPropertyParams): boolean {
  const { fromPath, frontmatter, toPath } = params;
  const fromSegments = splitPath(fromPath);
  const toSegments = splitPath(toPath);
  const isEitherPathEmpty = fromSegments.length === 0 || toSegments.length === 0;
  const isSameOrNested = fromPath === toPath || isAncestorOrSame(fromPath, toPath) || isAncestorOrSame(toPath, fromPath);
  if (isEitherPathEmpty || isSameOrNested) {
    return false;
  }

  const fromParent = resolveParent(frontmatter, fromSegments);
  if (fromParent === null) {
    return false;
  }
  const fromLeaf = lastSegment(fromSegments);
  if (!Object.hasOwn(fromParent, fromLeaf)) {
    return false;
  }

  const toParent = resolveOrCreateParent(frontmatter, toSegments);
  if (toParent === null) {
    return false;
  }
  const toLeaf = lastSegment(toSegments);
  // Read the value (rather than `Object.hasOwn`) so the assignment below is not narrowed to `never`;
  // Parsed YAML frontmatter never yields an explicit `undefined`, so absence is unambiguous here.
  if (toParent[toLeaf] !== undefined) {
    return false;
  }

  toParent[toLeaf] = fromParent[fromLeaf];
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Removing the old nested key after the move.
  delete fromParent[fromLeaf];
  return true;
}

/**
 * Reads the value at a nested property path.
 *
 * @param frontmatter - The frontmatter object to read from.
 * @param path - The dotted path (e.g. `book.author`).
 * @returns The value, or `null` when {@link resolveNestedPropertyKeys} does not resolve the path.
 */
export function getNestedPropertyValue(frontmatter: GenericObject, path: string): unknown {
  const resolved = resolveNestedProperty(frontmatter, path);
  return resolved === null ? null : resolved.value;
}

/**
 * Resolves a dotted nested property path against a note's frontmatter, matching each segment's key
 * case-insensitively (an exact spelling wins), as Obsidian matches top-level property names.
 *
 * @param frontmatter - The frontmatter object to resolve against.
 * @param path - The dotted path (e.g. `book.author`).
 * @returns The actual keys along the path, or `null` when the path is not nested, when the note has a
 *   top-level key spelled as the whole dotted path (Obsidian already reads that one), or when any segment is
 *   missing or passes through a value that is not an object.
 */
export function resolveNestedPropertyKeys(frontmatter: GenericObject, path: string): null | string[] {
  return resolveNestedProperty(frontmatter, path)?.keys ?? null;
}

function collectEntriesInto($object: GenericObject, prefix: string, entries: NestedPropertyEntry[]): void {
  for (const [key, value] of Object.entries($object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (prefix) {
      entries.push({ path, value });
    }
    if (isPlainObject(value)) {
      collectEntriesInto(value, path, entries);
    }
  }
}

function findKey($object: GenericObject, name: string): null | string {
  if (Object.hasOwn($object, name)) {
    return name;
  }
  const lowerName = name.toLowerCase();
  return Object.keys($object).find((key) => key.toLowerCase() === lowerName) ?? null;
}

function isAncestorOrSame(candidateAncestor: string, path: string): boolean {
  return path === candidateAncestor || path.startsWith(`${candidateAncestor}.`);
}

function isPlainObject(value: unknown): value is GenericObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function lastSegment(segments: string[]): string {
  return ensureNonNullable(segments.at(-1));
}

function resolveNestedProperty(frontmatter: GenericObject, path: string): null | ResolvedNestedProperty {
  const segments = splitPath(path);
  if (segments.length < MIN_NESTED_SEGMENT_COUNT || findKey(frontmatter, path) !== null) {
    return null;
  }

  const keys: string[] = [];
  let current: unknown = frontmatter;
  for (const segment of segments) {
    if (!isPlainObject(current)) {
      return null;
    }
    const key = findKey(current, segment);
    if (key === null) {
      return null;
    }
    keys.push(key);
    current = current[key];
  }
  return { keys, value: current };
}

function resolveOrCreateParent(frontmatter: GenericObject, segments: string[]): GenericObject | null {
  let current = frontmatter;
  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];
    if (next === undefined) {
      const created: GenericObject = {};
      current[segment] = created;
      current = created;
    } else if (isPlainObject(next)) {
      current = next;
    } else {
      return null;
    }
  }
  return current;
}

function resolveParent(frontmatter: GenericObject, segments: string[]): GenericObject | null {
  let current = frontmatter;
  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];
    if (!isPlainObject(next)) {
      return null;
    }
    current = next;
  }
  return current;
}

function splitPath(path: string): string[] {
  return path === '' ? [] : path.split('.');
}
