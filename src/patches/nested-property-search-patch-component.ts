import type {
  ExtractConstructor,
  ObsidianSearchQuery,
  ResultDom,
  ResultDomItem,
  ResultDomItemPropertyChild,
  ResultProperty,
  SearchMatchContext,
  SearchMatcher,
  SearchMatchResult,
  SearchPropertyMatcher,
  SearchView
} from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';
import type { GenericObject } from 'obsidian-dev-utils/type-guards';

import {
  castTo,
  getPrototypeOf
} from 'obsidian-dev-utils/object-utils';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import { collectNestedPropertyEntries } from '../nested-property-paths.ts';
import {
  formatValueSummary,
  isComplexValue
} from '../value-utils.ts';

// Obsidian exposes no public API for search operators, so the global-search internals come from
// `obsidian-typings`. The patch still feature-detects every shape at runtime and no-ops if one ever changes,
// so a moved internal degrades to native behavior rather than crashing.

/**
 * Parameters for constructing a {@link NestedPropertySearchPatchComponent}.
 */
interface NestedPropertySearchPatchComponentConstructorParams {
  readonly app: App;
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
    if (this.isFileResultPatched || !isResultDomItem(fileResult)) {
      return;
    }
    this.isFileResultPatched = true;
    this.registerMethodPatch({
      $object: getPrototypeOf(fileResult),
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

  private ensurePropertyMatchDomPatched(fileResult: ResultDomItem): void {
    if (this.isPropertyMatchDomPatched) {
      return;
    }
    const propertyMatchDoms = fileResult.vChildren.children.filter(isResultDomItemPropertyChild);
    const [firstPropertyMatchDom] = propertyMatchDoms;
    if (!firstPropertyMatchDom) {
      return;
    }
    this.isPropertyMatchDomPatched = true;
    this.registerMethodPatch({
      $object: getPrototypeOf(firstPropertyMatchDom),
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
    const searchQuery = view.searchQuery;
    if (!searchQuery) {
      return;
    }
    // TypeScript types every instance's own `constructor` as a bare `Function`.
    const searchQueryConstructor = castTo<ExtractConstructor<ObsidianSearchQuery>>(searchQuery.constructor);

    let propertyMatcherPrototype: SearchPropertyMatcher;
    try {
      const probeMatcher = new searchQueryConstructor(this.app, PROBE_QUERY, false).matcher;
      if (!probeMatcher || !isSearchPropertyMatcher(probeMatcher)) {
        return;
      }
      propertyMatcherPrototype = getPrototypeOf(probeMatcher);
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
    const searchResultDom: unknown = view.dom;
    if (this.isSearchResultDomPatched || !isResultDom(searchResultDom)) {
      return;
    }
    this.isSearchResultDomPatched = true;
    this.registerMethodPatch({
      $object: getPrototypeOf(searchResultDom),
      methodName: 'addResult',
      patchHandler: ({ fallback }) => {
        const fileResult = fallback();
        this.ensureFileResultPatched(fileResult);
        return fileResult;
      }
    });
  }

  private installBootstrapPatch(): void {
    const searchView: unknown = this.app.workspace.getLeavesOfType('search')[0]?.view;
    if (!isSearchView(searchView)) {
      return;
    }
    this.registerMethodPatch({
      $object: getPrototypeOf(searchView),
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

function addValueMatches(target: ResultProperty[], valueMatcher: SearchMatcher, context: SearchMatchContext, path: string, value: unknown): void {
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

function hasMethod(candidate: object, methodName: string): boolean {
  return typeof Reflect.get(candidate, methodName) === 'function';
}

function isObject(candidate: unknown): candidate is object {
  return candidate !== null && typeof candidate === 'object';
}

function isResultDom(candidate: unknown): candidate is ResultDom {
  return isObject(candidate) && hasMethod(candidate, 'addResult');
}

function isResultDomItem(candidate: unknown): candidate is ResultDomItem {
  if (!isObject(candidate) || !hasMethod(candidate, 'renderContentMatches')) {
    return false;
  }
  const vChildren: unknown = Reflect.get(candidate, 'vChildren');
  return isObject(vChildren) && Array.isArray(Reflect.get(vChildren, 'children'));
}

function isResultDomItemPropertyChild(candidate: unknown): candidate is ResultDomItemPropertyChild {
  // A content-match row carries `cache` and `matches` too, but also the `content` it excerpts.
  return isObject(candidate) && hasMethod(candidate, 'render') && 'cache' in candidate && Array.isArray(Reflect.get(candidate, 'matches'))
    && !('content' in candidate);
}

function isSearchPropertyMatcher(candidate: SearchMatcher): candidate is SearchPropertyMatcher {
  // Structurally feature-detect the property matcher: a `match` method plus the `key`/`value` sub-matchers it
  // reads. If Obsidian ever restructures search internals this guard fails and the patch is skipped, leaving
  // native behavior untouched rather than crashing.
  return hasMethod(candidate, 'match') && 'key' in candidate && 'value' in candidate;
}

function isSearchView(candidate: unknown): candidate is SearchView {
  return isObject(candidate) && hasMethod(candidate, 'startSearch');
}

function matchNestedProperties(
  fallback: () => null | SearchMatchResult | undefined,
  context: SearchMatchContext,
  matcher: SearchPropertyMatcher
): null | SearchMatchResult | undefined {
  const nativeResult = fallback();
  // The property matcher only runs against note content; mirror the native guard.
  if (!Object.hasOwn(context.strings, 'content')) {
    return nativeResult;
  }
  const frontmatter = context.cache?.frontmatter as GenericObject | undefined;
  if (!frontmatter) {
    return nativeResult;
  }

  const nestedMatches: ResultProperty[] = [];
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
  return { properties: nativeResult?.properties ? [...nativeResult.properties, ...nestedMatches] : nestedMatches };
}

function renderPropertyMatch(fallback: () => void, row: ResultDomItemPropertyChild): void {
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
