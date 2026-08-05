import type { GenericObject } from 'obsidian-dev-utils/type-guards';

import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

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
  if (fromSegments.length === 0 || toSegments.length === 0) {
    return false;
  }
  if (fromPath === toPath || isAncestorOrSame(fromPath, toPath) || isAncestorOrSame(toPath, fromPath)) {
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

function collectEntriesInto(object: GenericObject, prefix: string, entries: NestedPropertyEntry[]): void {
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (prefix) {
      entries.push({ path, value });
    }
    if (isPlainObject(value)) {
      collectEntriesInto(value, path, entries);
    }
  }
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
  if (path === '') {
    return [];
  }
  return path.split('.');
}
