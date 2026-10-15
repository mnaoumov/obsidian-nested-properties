import type { App } from 'obsidian';
import type { GenericObject } from 'obsidian-dev-utils/type-guards';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import { collectNestedPropertyEntries } from '../nested-property-paths.ts';
import {
  formatValueSummary,
  isComplexValue
} from '../value-utils.ts';

/**
 * A search result's per-file entry. `renderContentMatches` builds its match rows into `vChildren`.
 */
interface FileResultDom {
  renderContentMatches: () => void;
  vChildren: FileResultDomChildren;
}

/**
 * The child list of a {@link FileResultDom}: one row per content match or per matched property.
 */
interface FileResultDomChildren {
  readonly children: unknown[];
}

/**
 * The metadata-cache slice a match context carries for a note.
 */
interface FrontmatterCache {
  frontmatter?: GenericObject | undefined;
}

// Minimal structural types for Obsidian's (untyped) internal global-search matcher tree, reverse-engineered
// from the 1.13.3 build. Obsidian exposes no public API for search operators, so these are best-effort
// internal types reported upstream in `obsidian-typings` (see this plugin's AGENTS.md). The patch
// feature-detects the shape at runtime and no-ops if it ever changes, so a wrong guess degrades to native
// behavior rather than crashing.

/**
 * Parameters for constructing a {@link NestedPropertySearchPatchComponent}.
 */
interface NestedPropertySearchPatchComponentConstructorParams {
  readonly app: App;
}

/**
 * A single property match contributed to a {@link PropertyMatchResult}.
 */
interface PropertyMatch {
  key: string;
  pos?: unknown;
  subkey?: number[];
}

/**
 * The search-result row that shows one matched property as `key: value`. Its `render` reads the value as
 * `cache.frontmatter[matches[0].key]`, which is undefined for a dotted nested path.
 */
interface PropertyMatchDom {
  cache: FrontmatterCache;
  readonly matches: PropertyMatch[];
  render: () => void;
}

/**
 * The `[key: value]` property matcher node whose `match` this component patches to be nested-aware.
 */
interface PropertyMatcher {
  key: SubMatcher;
  match: (context: SearchMatchContext) => null | PropertyMatchResult | undefined;
  value: null | SubMatcher;
}

/**
 * The result of the property matcher: one entry per matched property occurrence.
 */
interface PropertyMatchResult {
  readonly properties: PropertyMatch[];
}

/**
 * The per-file context a matcher node evaluates against.
 */
interface SearchMatchContext {
  cache?: FrontmatterCache | undefined;
  clone: () => SearchMatchContext;
  cloneForPropertyContent: (value: unknown) => SearchMatchContext;
  keys: string[];
  strings: Record<string, unknown>;
}

type SearchQueryConstructor = new (app: App, query: string, isMatchingCase: boolean) => SearchQueryInstance;

/**
 * A compiled search query. Its `matcher` is the root of the matcher tree; for a bare property query it is
 * the {@link PropertyMatcher} itself.
 */
interface SearchQueryInstance {
  constructor: SearchQueryConstructor;
  matcher?: PropertyMatcher | undefined;
}

/**
 * The result list of a search view. `addResult` creates the {@link FileResultDom} for one note.
 */
interface SearchResultDom {
  addResult: (...arguments_: unknown[]) => unknown;
}

/**
 * The global-search view. `startSearch` compiles `searchComponent.getValue()` into `searchQuery`.
 */
interface SearchView {
  dom?: SearchResultDom | undefined;
  searchQuery?: SearchQueryInstance | undefined;
  startSearch: () => void;
}

/**
 * A single property-name / property-value sub-matcher.
 */
interface SubMatcher {
  match: (context: SearchMatchContext) => null | SubMatcherResult;
}

/**
 * The result of a value sub-matcher: the list of match positions in `content`.
 */
interface SubMatcherResult {
  readonly content?: undefined | unknown[];
}

// A bare property query whose compiled `matcher` is guaranteed to be a `PropertyMatcher`, used to reach the
// shared property-matcher prototype so it can be patched once for every search.
const PROBE_QUERY = '["a"]';

/**
 * Teaches Obsidian's native search to understand nested frontmatter properties (issue #1).
 *
 * Obsidian's built-in `[key]` / `[key: value]` property operators enumerate only *top-level* frontmatter
 * keys, even though the full nested object is present in the metadata cache. Rather than bolt on a separate
 * command with its own query dialect, this patches the internal property-matcher node so a dotted key such
 * as `[book.author: value]` matches nested paths too — directly in the real search bar, composable with
 * every other operator, and available inside embedded ` ```query ` blocks.
 *
 * The native matcher's top-level behavior is left entirely intact: the patch calls the original matcher
 * first, then *adds* matches for the nested (depth two or more) paths the original cannot see.
 *
 * The internal `SearchQuery` constructor is only reachable from a compiled query instance, so this bootstraps
 * off the search view's first `startSearch`: it compiles a throwaway probe query to obtain the shared
 * property-matcher prototype, then installs the nested-aware `match` patch on it.
 *
 * Matching is only half of it: the result row that shows a matched property reads its value as
 * `frontmatter[key]`, which for a dotted nested path is `undefined` (issue #14). That row's class is
 * module-private too, so it is reached the same way, one instance at a time: the search view's result list
 * (`view.dom`) creates the per-file results, a per-file result builds the property rows, and the first property
 * row found has its `render` patched and is drawn again. Every patch is owned by this component and removed on
 * unload.
 */
export class NestedPropertySearchPatchComponent extends MonkeyAroundComponent {
  private readonly app: App;
  private isFileResultPatched = false;
  private isPropertyMatchDomPatched = false;
  private isPropertyMatcherPatched = false;
  private isSearchResultDomPatched = false;

  public constructor(params: NestedPropertySearchPatchComponentConstructorParams) {
    super();
    this.app = params.app;
  }

  public override onload(): void {
    this.app.workspace.onLayoutReady(() => {
      this.installBootstrapPatch();
    });
  }

  private ensureFileResultPatched(fileResult: unknown): void {
    if (this.isFileResultPatched || !isFileResultDom(fileResult)) {
      return;
    }
    this.isFileResultPatched = true;
    this.registerMethodPatch({
      $object: castTo<FileResultDom>(Object.getPrototypeOf(fileResult)),
      methodName: 'renderContentMatches',
      patchHandler: ({
        fallback,
        originalThis
      }) => {
        fallback();
        this.ensurePropertyMatchDomPatched(originalThis);
      }
    });
  }

  private ensurePropertyMatchDomPatched(fileResult: FileResultDom): void {
    if (this.isPropertyMatchDomPatched) {
      return;
    }
    const propertyMatchDoms = fileResult.vChildren.children.filter(isPropertyMatchDom);
    const [firstPropertyMatchDom] = propertyMatchDoms;
    if (!firstPropertyMatchDom) {
      return;
    }
    this.isPropertyMatchDomPatched = true;
    this.registerMethodPatch({
      $object: castTo<PropertyMatchDom>(Object.getPrototypeOf(firstPropertyMatchDom)),
      methodName: 'render',
      patchHandler: ({
        fallback,
        originalThis
      }) => {
        renderPropertyMatch(fallback, originalThis);
      }
    });
    // These rows were drawn by the unpatched `render` a moment ago; every later row is drawn patched.
    for (const propertyMatchDom of propertyMatchDoms) {
      propertyMatchDom.render();
    }
  }

  private ensurePropertyMatcherPatched(view: SearchView): void {
    if (this.isPropertyMatcherPatched) {
      return;
    }
    const searchQueryConstructor = view.searchQuery?.constructor;
    if (!searchQueryConstructor) {
      return;
    }

    let propertyMatcherPrototype: PropertyMatcher;
    try {
      const probeMatcher = new searchQueryConstructor(this.app, PROBE_QUERY, false).matcher;
      if (!probeMatcher || !isPropertyMatcher(probeMatcher)) {
        return;
      }
      propertyMatcherPrototype = castTo<PropertyMatcher>(Object.getPrototypeOf(probeMatcher));
    } catch {
      return;
    }

    this.isPropertyMatcherPatched = true;
    this.registerMethodPatch({
      $object: propertyMatcherPrototype,
      methodName: 'match',
      patchHandler: ({
        fallback,
        originalArguments: [context],
        originalThis
      }) => matchNestedProperties(fallback, context, originalThis)
    });
  }

  private ensureSearchResultDomPatched(view: SearchView): void {
    if (this.isSearchResultDomPatched || !view.dom || typeof view.dom.addResult !== 'function') {
      return;
    }
    this.isSearchResultDomPatched = true;
    this.registerMethodPatch({
      $object: castTo<SearchResultDom>(Object.getPrototypeOf(view.dom)),
      methodName: 'addResult',
      patchHandler: ({ fallback }) => {
        const fileResult = fallback();
        this.ensureFileResultPatched(fileResult);
        return fileResult;
      }
    });
  }

  private installBootstrapPatch(): void {
    const searchLeaf = this.app.workspace.getLeavesOfType('search')[0];
    if (!searchLeaf) {
      return;
    }
    const searchViewPrototype = castTo<SearchView>(Object.getPrototypeOf(searchLeaf.view));
    this.registerMethodPatch({
      $object: searchViewPrototype,
      methodName: 'startSearch',
      patchHandler: ({
        fallback,
        originalThis
      }) => {
        fallback();
        this.ensurePropertyMatcherPatched(originalThis);
        this.ensureSearchResultDomPatched(originalThis);
      }
    });
  }
}

function addValueMatches(target: PropertyMatch[], valueMatcher: SubMatcher, context: SearchMatchContext, path: string, value: unknown): void {
  if (Array.isArray(value)) {
    for (const [index, element] of value.entries()) {
      const itemMatch = valueMatcher.match(context.cloneForPropertyContent(element));
      for (const pos of itemMatch?.content ?? []) {
        target.push({ key: path, pos, subkey: [index] });
      }
    }
    return;
  }
  // An object leaf cannot be scalar-matched against a value query; a value query only makes sense on leaves.
  if (value !== null && typeof value === 'object') {
    return;
  }
  const valueMatch = valueMatcher.match(context.cloneForPropertyContent(value));
  for (const pos of valueMatch?.content ?? []) {
    target.push({ key: path, pos });
  }
}

function isFileResultDom(candidate: unknown): candidate is FileResultDom {
  if (candidate === null || typeof candidate !== 'object') {
    return false;
  }
  const fileResult = castTo<Partial<FileResultDom>>(candidate);
  return typeof fileResult.renderContentMatches === 'function' && Array.isArray(fileResult.vChildren?.children);
}

function isPropertyMatchDom(candidate: unknown): candidate is PropertyMatchDom {
  if (candidate === null || typeof candidate !== 'object') {
    return false;
  }
  // A content-match row carries `cache` and `matches` too, but also the `content` it excerpts.
  const row = castTo<Partial<PropertyMatchDom>>(candidate);
  return typeof row.render === 'function' && 'cache' in row && Array.isArray(row.matches) && !('content' in row);
}

function isPropertyMatcher(candidate: PropertyMatcher): boolean {
  // Structurally feature-detect the property matcher: a `match` method plus the `key`/`value` sub-matchers it
  // reads. If Obsidian ever restructures search internals this guard fails and the patch is skipped, leaving
  // native behavior untouched rather than crashing.
  return typeof candidate.match === 'function' && 'key' in candidate && 'value' in candidate;
}

function matchNestedProperties(
  fallback: () => null | PropertyMatchResult | undefined,
  context: SearchMatchContext,
  matcher: PropertyMatcher
): null | PropertyMatchResult | undefined {
  const nativeResult = fallback();
  // The property matcher only runs against note content; mirror the native guard.
  if (!Object.hasOwn(context.strings, 'content')) {
    return nativeResult;
  }
  const frontmatter = context.cache?.frontmatter;
  if (!frontmatter) {
    return nativeResult;
  }

  const nestedMatches: PropertyMatch[] = [];
  for (const { path, value } of collectNestedPropertyEntries(frontmatter)) {
    const keyContext = context.clone();
    keyContext.keys = ['propertyName'];
    keyContext.strings['propertyName'] = path;
    if (!matcher.key.match(keyContext)) {
      continue;
    }
    if (matcher.value === null) {
      nestedMatches.push({ key: path });
      continue;
    }
    addValueMatches(nestedMatches, matcher.value, context, path, value);
  }

  if (nestedMatches.length === 0) {
    return nativeResult;
  }
  return { properties: nativeResult ? [...nativeResult.properties, ...nestedMatches] : nestedMatches };
}

function renderPropertyMatch(fallback: () => void, row: PropertyMatchDom): void {
  const key = row.matches[0]?.key;
  const frontmatter = row.cache.frontmatter;
  // A top-level key, including one whose name merely contains a dot, is the native row's own business.
  if (key === undefined || !frontmatter || Object.hasOwn(frontmatter, key)) {
    fallback();
    return;
  }
  const entry = collectNestedPropertyEntries(frontmatter).find(({ path }) => path === key);
  if (!entry) {
    fallback();
    return;
  }

  // The native `render` reads `cache.frontmatter[key]` and nothing else, so it is handed a cache in which the
  // dotted key holds the nested value. That keeps its own drawing, list layout and match highlighting.
  const cache = row.cache;
  row.cache = { ...cache, frontmatter: { [key]: toDisplayValue(entry.value) } };
  try {
    fallback();
  } finally {
    row.cache = cache;
  }
}

function toDisplayValue(value: unknown): unknown {
  // The native row draws a value with `String()`, which would show an object as `[object Object]`.
  if (Array.isArray(value)) {
    return value.map((item) => (isComplexValue(item) ? formatValueSummary(item) : item));
  }
  return isComplexValue(value) ? formatValueSummary(value) : value;
}
