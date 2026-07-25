import type { App as AppOriginal } from 'obsidian';
import type { GenericObject } from 'obsidian-dev-utils/type-guards';

import { castTo } from 'obsidian-dev-utils/object-utils';
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
// Test doubles for it (a search view, the compiled-query constructor, the property matcher, and the per-file
// Match context). They implement only the members the patch touches; the real App still comes from
// `obsidian-test-mocks` (G49), with the two workspace methods the component calls stubbed on it.

interface FakeLeaf {
  view: object;
}

interface FakeSubMatcher {
  match(context: FakeContext): MatcherContent | null;
}

interface FrontmatterCache {
  frontmatter?: GenericObject | undefined;
}

interface MatchContextInit {
  cache?: FrontmatterCache | undefined;
  content?: unknown;
  hasContent?: boolean;
}

interface MatcherContent {
  content?: unknown[];
}

interface PropertyMatcherInit {
  key: FakeSubMatcher;
  nativeResult?: unknown;
  value: FakeSubMatcher | null;
}

interface PropertyMatcherPrototype {
  match(this: PropertyMatcherState, context: FakeContext): unknown;
}

interface PropertyMatcherState {
  nativeResult?: unknown;
}

interface SearchViewSetup {
  app: AppOriginal;
  component: NestedPropertySearchPatchComponent;
  prototype: PropertyMatcherPrototype;
  startSearch(): void;
}

interface SearchViewSetupOptions {
  readonly hasSearchLeaf?: boolean;
  readonly searchQueryConstructor?: unknown;
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
  // Patches from one test do not leak into the next.
  class FakeSearchView {
    public searchQuery = searchQueryConstructor === undefined ? undefined : { constructor: searchQueryConstructor };

    public startSearch(): void {
      // Native no-op; the patch wraps this.
    }
  }
  const searchView = new FakeSearchView();

  const appMock = App.createConfigured__();
  appMock.workspace.onLayoutReady = vi.fn((cb: () => void) => {
    cb();
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
});
