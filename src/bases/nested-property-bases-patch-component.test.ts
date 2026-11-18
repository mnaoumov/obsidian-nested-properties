import type { GenericObject } from '@mnaoumov/typescript-lib/type-guards';
import type {
  App,
  TFile
} from 'obsidian';

import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  BasesEntry,
  BasesView,
  NullValue,
  ObjectValue
} from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { NestedPropertyBasesPatchComponent } from './nested-property-bases-patch-component.ts';

// The mocks model the public Bases API only, so the internal members the component patches are installed on their
// prototypes here, as test doubles that answer the way Obsidian's own methods do.
interface EntryInternals {
  readonly getPropertyKeys: () => string[];
  readonly getRawProperty: (name: string) => unknown;
}

interface FileCacheStub {
  readonly frontmatter: GenericObject;
}

interface ViewInternals {
  readonly updateProperty: (file: TFile, name: string, value: unknown) => Promise<void>;
}

const FILE = castTo<TFile>({ path: 'note.md' });

let frontmatter: GenericObject = {};
let hasFileCache = true;
const updateProperty = vi.fn(async (_file: TFile, _name: string, _value: unknown): Promise<void> => {
  await noopAsync();
});

function createApp(): App {
  return castTo<App>({
    metadataCache: {
      getFileCache: (): FileCacheStub | null => (hasFileCache ? { frontmatter } : null)
    }
  });
}

function createEntry(): BasesEntry & EntryInternals {
  const entry = castTo<BasesEntry & EntryInternals>(BasesEntry.create__({}, castTo(FILE)));
  return entry;
}

function createView(): ViewInternals {
  return castTo<ViewInternals>(Object.create(BasesView.prototype));
}

function installInternals(): void {
  Object.assign(BasesEntry.prototype, {
    getPropertyKeys(this: BasesEntry): string[] {
      return Object.keys(frontmatter);
    },
    getRawProperty(this: BasesEntry, name: string): unknown {
      return Object.hasOwn(frontmatter, name) ? frontmatter[name] : null;
    }
  });
  Object.assign(BasesView.prototype, { updateProperty });
}

function loadComponent(): NestedPropertyBasesPatchComponent {
  const component = new NestedPropertyBasesPatchComponent({ app: createApp() });
  component.load();
  return component;
}

function removeInternals(): void {
  Reflect.deleteProperty(BasesEntry.prototype, 'getPropertyKeys');
  Reflect.deleteProperty(BasesEntry.prototype, 'getRawProperty');
  Reflect.deleteProperty(BasesView.prototype, 'updateProperty');
}

describe('NestedPropertyBasesPatchComponent', () => {
  let component: NestedPropertyBasesPatchComponent | null = null;

  beforeEach(() => {
    frontmatter = { book: { author: 'Ursula', meta: { year: 1969 } }, title: 'Lathe' };
    hasFileCache = true;
    updateProperty.mockClear();
    installInternals();
  });

  afterEach(() => {
    component?.unload();
    component = null;
    removeInternals();
  });

  it('should add the nested paths to the property keys', () => {
    component = loadComponent();
    expect(createEntry().getPropertyKeys()).toEqual(['book', 'title', 'book.author', 'book.meta', 'book.meta.year']);
  });

  it('should read a nested raw property the original cannot see', () => {
    component = loadComponent();
    expect(createEntry().getRawProperty('book.meta.year')).toBe(1969);
  });

  it('should keep the original raw property when there is one', () => {
    component = loadComponent();
    expect(createEntry().getRawProperty('title')).toBe('Lathe');
  });

  it('should keep a value the original found', () => {
    component = loadComponent();
    const entry = createEntry();
    const value = ObjectValue.create__({ a: 1 });
    entry.setValue__('note.title', value.asOriginalType3__());
    expect(entry.getValue('note.title')).toBe(value.asOriginalType3__());
  });

  it('should walk the nested values for a dotted note property', () => {
    component = loadComponent();
    const entry = createEntry();
    const authorValue = ObjectValue.create__({});
    entry.setValue__('note.book', ObjectValue.create__({ author: authorValue }).asOriginalType3__());
    expect(entry.getValue('note.book.author')).toBe(authorValue.asOriginalType3__());
  });

  it('should return the original null when the walk meets a value that is not an object', () => {
    component = loadComponent();
    frontmatter = { book: { author: { name: 'Ursula' } } };
    const entry = createEntry();
    entry.setValue__('note.book', NullValue.value.asOriginalType2__());
    expect(entry.getValue('note.book.author.name')).toBeNull();
  });

  it('should leave a dotted note property that does not resolve to the original', () => {
    component = loadComponent();
    expect(createEntry().getValue('note.book.missing')).toBeNull();
  });

  it('should leave a file property to the original', () => {
    component = loadComponent();
    expect(createEntry().getValue('file.name.x')).toBeNull();
  });

  it('should write a nested edit as a write of its top-level key', async () => {
    component = loadComponent();
    await createView().updateProperty(FILE, 'book.author', 'Le Guin');
    expect(updateProperty).toHaveBeenCalledWith(FILE, 'book', { author: 'Le Guin', meta: { year: 1969 } });
  });

  it('should pass a top-level edit through unchanged', async () => {
    component = loadComponent();
    await createView().updateProperty(FILE, 'title', 'Dispossessed');
    expect(updateProperty).toHaveBeenCalledWith(FILE, 'title', 'Dispossessed');
  });

  it('should add nothing for a note the metadata cache has not read', () => {
    component = loadComponent();
    hasFileCache = false;
    expect(createEntry().getPropertyKeys()).toEqual(['book', 'title']);
  });

  it('should patch nothing when an internal method is missing', () => {
    Reflect.deleteProperty(BasesEntry.prototype, 'getRawProperty');
    const getValueBefore = BasesEntry.prototype.getValue;
    component = loadComponent();
    expect(BasesEntry.prototype.getValue).toBe(getValueBefore);
    expect(BasesView.prototype).toHaveProperty('updateProperty', updateProperty);
  });

  it('should restore the original methods on unload', () => {
    const getValueBefore = BasesEntry.prototype.getValue;
    component = loadComponent();
    expect(BasesEntry.prototype.getValue).not.toBe(getValueBefore);
    component.unload();
    component = null;
    expect(BasesEntry.prototype.getValue).toBe(getValueBefore);
  });
});
