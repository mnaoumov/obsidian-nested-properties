import type { GenericObject } from '@mnaoumov/typescript-lib/type-guards';
import type { App as AppOriginal } from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { NestedPropertySearchPatchComponent } from './nested-property-search-patch-component.ts';

// Obsidian exposes no real mock for its internal global-search matcher tree, so this suite builds minimal
// test doubles for it (a search view, the compiled-query constructor, the property matcher, and the per-file
// match context). They implement only the members the patch touches; the real App still comes from
// `obsidian-test-mocks`, with the two workspace methods the component calls stubbed on it.

interface FakeFileResultInstance {
  readonly renderContentMatches: () => void;
  readonly vChildren: FakeRowList;
}

interface FakeLeaf {
  readonly view: object;
}

interface FakeRow {
  readonly cache: FrontmatterCache;
  readonly render: () => void;
  readonly renderCount: number;
  readonly text: string;
}

interface FakeRowList {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Rendering replaces the child rows with the latest search results.
  children: FakeRow[];
}

interface FakeSearchResultDomInstance {
  readonly addResult: (createRows: () => FakeRow[]) => FakeFileResultInstance;
}

interface FakeSubMatcher {
  readonly match: (context: FakeContext) => MatcherContent | null;
}

interface FrontmatterCache {
  readonly frontmatter?: GenericObject | undefined;
}

interface MatchContextInit {
  readonly cache?: FrontmatterCache | undefined;
  readonly content?: unknown;
  readonly hasContent?: boolean;
}

interface MatcherContent {
  readonly content?: unknown[];
}

interface PropertyMatcherInit {
  readonly key: FakeSubMatcher;
  readonly nativeResult?: unknown;
  readonly value: FakeSubMatcher | null;
}

interface PropertyMatcherPrototype {
  readonly match: (this: PropertyMatcherState, context: FakeContext) => unknown;
}

interface PropertyMatcherState {
  readonly nativeResult?: unknown;
}

interface ResultClasses {
  readonly FakeContentMatchDom: new () => FakeRow;
  readonly FakePropertyMatchDom: new (frontmatter: GenericObject | undefined, matches: RowMatch[]) => FakeRow;
  readonly FakeSearchResultDom: new () => FakeSearchResultDomInstance;
}

interface RowMatch {
  readonly key: string;
  readonly pos?: unknown;
  readonly subkey?: number[];
}

interface SearchViewSetup {
  readonly app: AppOriginal;
  readonly component: NestedPropertySearchPatchComponent;
  readonly prototype: PropertyMatcherPrototype;
  readonly startSearch: () => void;
}

interface SearchViewSetupOptions {
  readonly dom?: unknown;
  readonly hasSearchLeaf?: boolean;
  readonly searchQueryConstructor?: unknown;
}

interface UnknownRowList {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Rendering replaces the child rows with the latest search results.
  children: unknown[];
}

class FakeContext {
  public cache?: FrontmatterCache | undefined;
  public content: unknown;
  public keys: string[] = [];
  public strings: Record<string, unknown> = {};

  public constructor(init: MatchContextInit) {
    this.cache = init.cache;
    this.content = init.content;
    if (init.hasContent ?? true) {
      this.strings['content'] = '';
    }
  }

  public clone(): FakeContext {
    const clone = new FakeContext({ cache: this.cache, hasContent: false });
    clone.strings = { ...this.strings };
    clone.keys = [...this.keys];
    clone.content = this.content;
    return clone;
  }

  public cloneForPropertyContent(value: unknown): FakeContext {
    const clone = new FakeContext({ cache: this.cache, hasContent: false });
    clone.content = value;
    return clone;
  }
}

// The shared property-matcher prototype: `match` just returns whatever native result the instance carries.
function createPropertyMatcherPrototype(): PropertyMatcherPrototype {
  return {
    match(this: PropertyMatcherState): unknown {
      return this.nativeResult ?? null;
    }
  };
}

// Fresh classes per test, so a prototype patch from one test does not leak into the next. They mirror the
// native search result: the result list creates a per-file result, which builds one row per matched property
// in `renderContentMatches`, and a property row draws `key: value` from `cache.frontmatter[key]`.
function createResultClasses(): ResultClasses {
  class FakePropertyMatchDom implements FakeRow {
    public cache: FrontmatterCache;
    public readonly matches: RowMatch[];
    public renderCount = 0;
    public text = '';

    public constructor(frontmatter: GenericObject | undefined, matches: RowMatch[]) {
      this.cache = { frontmatter };
      this.matches = matches;
    }

    public render(): void {
      this.renderCount++;
      const key = this.matches[0]?.key ?? '';
      const value: unknown = this.cache.frontmatter?.[key];
      this.text = `${key}: ${Array.isArray(value) ? value.map(String).join(' ') : String(value)}`;
    }
  }

  class FakeContentMatchDom implements FakeRow {
    public cache: FrontmatterCache = { frontmatter: {} };
    public content = 'note body';
    public matches: RowMatch[] = [{ key: 'missing.path' }];
    public renderCount = 0;
    public text = '';

    public render(): void {
      this.renderCount++;
      this.text = this.content;
    }
  }

  class FakeFileResult implements FakeFileResultInstance {
    public vChildren: FakeRowList = { children: [] };
    private readonly createRows: () => FakeRow[];

    public constructor(createRows: () => FakeRow[]) {
      this.createRows = createRows;
    }

    public renderContentMatches(): void {
      this.vChildren.children = this.createRows();
      for (const row of this.vChildren.children) {
        row.render();
      }
    }
  }

  class FakeSearchResultDom implements FakeSearchResultDomInstance {
    public addResult(createRows: () => FakeRow[]): FakeFileResultInstance {
      return new FakeFileResult(createRows);
    }
  }

  return { FakeContentMatchDom, FakePropertyMatchDom, FakeSearchResultDom };
}

// A property-name matcher that matches a fixed set of dotted paths.
function keyMatcher(...paths: string[]): FakeSubMatcher {
  return {
    match: (context) => (paths.includes(String(context.strings['propertyName'])) ? { content: [0] } : null)
  };
}

function makePropertyMatcher(prototype: PropertyMatcherPrototype, init: PropertyMatcherInit): object {
  return Object.assign(Object.create(prototype), {
    key: init.key,
    nativeResult: init.nativeResult ?? null,
    value: init.value
  });
}

function setup(options: SearchViewSetupOptions = {}): SearchViewSetup {
  const prototype = createPropertyMatcherPrototype();
  const hasSearchLeaf = options.hasSearchLeaf ?? true;

  // The default constructor compiles the probe query into a matcher whose prototype is the shared one.
  class DefaultSearchQuery {
    public matcher = makePropertyMatcher(prototype, { key: keyMatcher(), value: null });
  }
  const searchQueryConstructor = 'searchQueryConstructor' in options ? options.searchQueryConstructor : DefaultSearchQuery;

  // A fresh class per setup so `startSearch` lives on the prototype (as it does on the real `SearchView`) and
  // patches from one test do not leak into the next.
  class FakeSearchView {
    public dom = options.dom;
    public searchQuery = searchQueryConstructor === undefined ? undefined : { constructor: searchQueryConstructor };

    public startSearch(): void {
      // Native no-op; the patch wraps this.
    }
  }
  const searchView = new FakeSearchView();

  const appMock = App.createConfigured__();
  appMock.workspace.onLayoutReady = vi.fn((callback: () => void) => {
    callback();
  });
  const leaves: FakeLeaf[] = hasSearchLeaf ? [{ view: searchView }] : [];
  appMock.workspace.getLeavesOfType = castTo<typeof appMock.workspace.getLeavesOfType>(vi.fn(() => leaves));
  const app = appMock.asOriginalType__();

  const component = new NestedPropertySearchPatchComponent({ app });
  // `load()` sets the loaded state (required by `registerMethodPatch`) and then invokes `onload()`.
  component.load();

  return {
    app,
    component,
    prototype,
    startSearch: (): void => {
      searchView.startSearch();
    }
  };
}

// A value matcher that reports a match when the cloned content equals the expected scalar.
function valueMatcher(expected: unknown): FakeSubMatcher {
  return {
    match: (context) => (context.content === expected ? { content: [1] } : null)
  };
}

describe('NestedPropertySearchPatchComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not install the bootstrap patch when there is no search leaf', () => {
    const { prototype, startSearch } = setup({ hasSearchLeaf: false });
    const original = prototype.match;
    startSearch();
    expect(prototype.match).toBe(original);
  });

  it('patches the property matcher on the first search', () => {
    const { prototype, startSearch } = setup();
    const original = prototype.match;
    startSearch();
    expect(prototype.match).not.toBe(original);
  });

  it('patches the property matcher only once across searches', () => {
    const { prototype, startSearch } = setup();
    startSearch();
    const afterFirst = prototype.match;
    startSearch();
    expect(prototype.match).toBe(afterFirst);
  });

  it('does not patch when the search query constructor is unavailable', () => {
    const { prototype, startSearch } = setup({ searchQueryConstructor: undefined });
    const original = prototype.match;
    startSearch();
    expect(prototype.match).toBe(original);
  });

  it('does not patch when compiling the probe query throws', () => {
    function ThrowingSearchQuery(): never {
      throw new Error('cannot compile');
    }
    const { prototype, startSearch } = setup({ searchQueryConstructor: ThrowingSearchQuery });
    const original = prototype.match;
    startSearch();
    expect(prototype.match).toBe(original);
  });

  it('does not patch when the compiled probe query has no matcher', () => {
    class NoMatcherSearchQuery {
      public matcher = undefined;
    }
    const { prototype, startSearch } = setup({ searchQueryConstructor: NoMatcherSearchQuery });
    const original = prototype.match;
    startSearch();
    expect(prototype.match).toBe(original);
  });

  it('does not patch when the compiled matcher is not a property matcher', () => {
    const unrelatedPrototype = {
      match(): unknown {
        return null;
      }
    };
    class ForeignSearchQuery {
      public matcher = castTo<object>(Object.create(unrelatedPrototype));
    }
    const { prototype, startSearch } = setup({ searchQueryConstructor: ForeignSearchQuery });
    const original = prototype.match;
    startSearch();
    expect(prototype.match).toBe(original);
  });

  describe('patched match', () => {
    function patchedMatch(prototype: PropertyMatcherPrototype): (this: object, context: FakeContext) => unknown {
      return castTo<(this: object, context: FakeContext) => unknown>(prototype.match);
    }

    const frontmatter: GenericObject = {
      book: {
        author: 'Ursula K. Le Guin',
        genres: ['fantasy', 'sci-fi'],
        meta: {
          shelf: 'A1'
        }
      },
      top: 'scalar'
    };

    it('adds a nested existence match to the native result', () => {
      const { prototype, startSearch } = setup();
      startSearch();
      const matcher = makePropertyMatcher(prototype, {
        key: keyMatcher('book.author'),
        nativeResult: { properties: [{ key: 'top' }] },
        value: null
      });
      const result = patchedMatch(prototype).call(matcher, new FakeContext({ cache: { frontmatter } }));
      expect(result).toEqual({ properties: [{ key: 'top' }, { key: 'book.author' }] });
    });

    it('matches a nested scalar value', () => {
      const { prototype, startSearch } = setup();
      startSearch();
      const matcher = makePropertyMatcher(prototype, {
        key: keyMatcher('book.author'),
        value: valueMatcher('Ursula K. Le Guin')
      });
      const result = patchedMatch(prototype).call(matcher, new FakeContext({ cache: { frontmatter } }));
      expect(result).toEqual({ properties: [{ key: 'book.author', pos: 1 }] });
    });

    it('matches a member of a nested list value', () => {
      const { prototype, startSearch } = setup();
      startSearch();
      const matcher = makePropertyMatcher(prototype, {
        key: keyMatcher('book.genres'),
        value: valueMatcher('sci-fi')
      });
      const result = patchedMatch(prototype).call(matcher, new FakeContext({ cache: { frontmatter } }));
      expect(result).toEqual({ properties: [{ key: 'book.genres', pos: 1, subkey: [1] }] });
    });

    it('contributes nothing when the nested key matches but its scalar value does not', () => {
      const { prototype, startSearch } = setup();
      startSearch();
      const matcher = makePropertyMatcher(prototype, {
        key: keyMatcher('book.author'),
        value: valueMatcher('Someone Else')
      });
      const result = patchedMatch(prototype).call(matcher, new FakeContext({ cache: { frontmatter } }));
      expect(result).toBeNull();
    });

    it('does not value-match a nested object leaf', () => {
      const { prototype, startSearch } = setup();
      startSearch();
      const matcher = makePropertyMatcher(prototype, {
        key: keyMatcher('book.meta'),
        value: valueMatcher('A1')
      });
      const result = patchedMatch(prototype).call(matcher, new FakeContext({ cache: { frontmatter } }));
      expect(result).toBeNull();
    });

    it('returns the native result unchanged when no nested path matches', () => {
      const { prototype, startSearch } = setup();
      startSearch();
      const native = { properties: [{ key: 'top' }] };
      const matcher = makePropertyMatcher(prototype, {
        key: keyMatcher('missing.path'),
        nativeResult: native,
        value: null
      });
      const result = patchedMatch(prototype).call(matcher, new FakeContext({ cache: { frontmatter } }));
      expect(result).toBe(native);
    });

    it('returns only the nested matches when the native result is null', () => {
      const { prototype, startSearch } = setup();
      startSearch();
      const matcher = makePropertyMatcher(prototype, {
        key: keyMatcher('book.author'),
        nativeResult: null,
        value: null
      });
      const result = patchedMatch(prototype).call(matcher, new FakeContext({ cache: { frontmatter } }));
      expect(result).toEqual({ properties: [{ key: 'book.author' }] });
    });

    it('returns the native result when the context is not note content', () => {
      const { prototype, startSearch } = setup();
      startSearch();
      const native = { properties: [] };
      const matcher = makePropertyMatcher(prototype, {
        key: keyMatcher('book.author'),
        nativeResult: native,
        value: null
      });
      const result = patchedMatch(prototype).call(matcher, new FakeContext({ cache: { frontmatter }, hasContent: false }));
      expect(result).toBe(native);
    });

    it('returns the native result when the note has no frontmatter', () => {
      const { prototype, startSearch } = setup();
      startSearch();
      const native = { properties: [] };
      const matcher = makePropertyMatcher(prototype, {
        key: keyMatcher('book.author'),
        nativeResult: native,
        value: null
      });
      const result = patchedMatch(prototype).call(matcher, new FakeContext({ cache: {} }));
      expect(result).toBe(native);
    });
  });

  describe('rendered property match', () => {
    const frontmatter: GenericObject = {
      'book': {
        author: 'Ursula K. Le Guin',
        genres: ['fantasy', 'sci-fi'],
        meta: {
          shelf: 'A1'
        },
        shelves: [{ room: 'study' }, 'attic']
      },
      'dotted.key': 'flat',
      'Taxonomy': {
        'Common Name': 'Medlar'
      },
      'top': 'scalar'
    };

    function renderRows(classes: ResultClasses, dom: FakeSearchResultDomInstance, rowFrontmatter: GenericObject | undefined, ...keys: string[]): FakeRow[] {
      const fileResult = dom.addResult(() => keys.map((key) => new classes.FakePropertyMatchDom(rowFrontmatter, [{ key }])));
      fileResult.renderContentMatches();
      return fileResult.vChildren.children;
    }

    function renderText(key: string): string {
      return renderTextAgainst(key, frontmatter);
    }

    function renderTextAgainst(key: string, rowFrontmatter: GenericObject | undefined): string {
      const classes = createResultClasses();
      const dom = new classes.FakeSearchResultDom();
      const { startSearch } = setup({ dom });
      startSearch();
      const [row] = renderRows(classes, dom, rowFrontmatter, key);
      return row?.text ?? '';
    }

    it('shows the value of a nested scalar instead of undefined', () => {
      expect(renderText('Taxonomy.Common Name')).toBe('Taxonomy.Common Name: Medlar');
    });

    it('shows the members of a nested list', () => {
      expect(renderText('book.genres')).toBe('book.genres: fantasy sci-fi');
    });

    it('shows a nested object as its one-line summary', () => {
      expect(renderText('book.meta')).toBe('book.meta: { shelf: A1 }');
    });

    it('shows an object member of a nested list as its one-line summary', () => {
      expect(renderText('book.shelves')).toBe('book.shelves: { room: study } attic');
    });

    it('leaves a top-level key to the native row', () => {
      expect(renderText('top')).toBe('top: scalar');
    });

    it('leaves a top-level key whose name contains a dot to the native row', () => {
      expect(renderText('dotted.key')).toBe('dotted.key: flat');
    });

    it('leaves a key that resolves to no nested path to the native row', () => {
      expect(renderText('book.missing')).toBe('book.missing: undefined');
    });

    it('leaves a row with no frontmatter to the native row', () => {
      expect(renderTextAgainst('book.author', undefined)).toBe('book.author: undefined');
    });

    it('restores the row cache after drawing it', () => {
      const classes = createResultClasses();
      const dom = new classes.FakeSearchResultDom();
      const { startSearch } = setup({ dom });
      startSearch();
      const [row] = renderRows(classes, dom, frontmatter, 'book.author');
      expect(row?.cache.frontmatter).toBe(frontmatter);
    });

    it('redraws the rows that were drawn before the row class was patched, and only those', () => {
      const classes = createResultClasses();
      const dom = new classes.FakeSearchResultDom();
      const { startSearch } = setup({ dom });
      startSearch();
      const firstRows = renderRows(classes, dom, frontmatter, 'book.author', 'top');
      const laterRows = renderRows(classes, dom, frontmatter, 'book.author');
      expect(firstRows.map((row) => row.renderCount)).toEqual([2, 2]);
      expect(firstRows.map((row) => row.text)).toEqual(['book.author: Ursula K. Le Guin', 'top: scalar']);
      expect(laterRows.map((row) => row.renderCount)).toEqual([1]);
    });

    it('does not take a content-match row for a property row', () => {
      const classes = createResultClasses();
      const dom = new classes.FakeSearchResultDom();
      const { startSearch } = setup({ dom });
      startSearch();
      const contentRow = new classes.FakeContentMatchDom();
      const fileResult = dom.addResult(() => [contentRow]);
      fileResult.renderContentMatches();
      const [propertyRow] = renderRows(classes, dom, frontmatter, 'book.author');
      expect(contentRow.renderCount).toBe(1);
      expect(propertyRow?.text).toBe('book.author: Ursula K. Le Guin');
    });

    it('skips a row that is not an object', () => {
      class PrimitiveRowFileResult {
        public vChildren: UnknownRowList = { children: [] };

        public renderContentMatches(): void {
          this.vChildren.children = ['text row'];
        }
      }
      class PrimitiveRowResultDom {
        public addResult(): PrimitiveRowFileResult {
          return new PrimitiveRowFileResult();
        }
      }
      const dom = new PrimitiveRowResultDom();
      const { startSearch } = setup({ dom });
      startSearch();
      const fileResult = dom.addResult();
      fileResult.renderContentMatches();
      expect(fileResult.vChildren.children).toEqual(['text row']);
    });

    it('patches the result list only once across searches', () => {
      const classes = createResultClasses();
      const dom = new classes.FakeSearchResultDom();
      const { startSearch } = setup({ dom });
      startSearch();
      const afterFirst = dom.addResult;
      startSearch();
      expect(dom.addResult).toBe(afterFirst);
    });

    it('does not patch the result list when the search view has none', () => {
      const { startSearch } = setup({ dom: undefined });
      expect(() => {
        startSearch();
      }).not.toThrow();
    });

    it('does not patch the result list when it has no addResult', () => {
      const dom = { addResult: 'not a function' };
      const { startSearch } = setup({ dom });
      startSearch();
      expect(dom.addResult).toBe('not a function');
    });

    it('does not patch a file result of an unknown shape', () => {
      class ForeignResultDom {
        public addResult(): unknown {
          return null;
        }
      }
      const dom = new ForeignResultDom();
      const { startSearch } = setup({ dom });
      startSearch();
      expect(dom.addResult()).toBeNull();
    });
  });
});
