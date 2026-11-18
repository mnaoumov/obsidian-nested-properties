import type { GenericObject } from '@mnaoumov/typescript-lib/type-guards';
import type {
  App,
  BasesPropertyId,
  TFile,
  Value
} from 'obsidian';

import { MonkeyAroundComponent } from '@mnaoumov/obsidian-lib/components/monkey-around-component';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  BasesEntry,
  BasesView,
  NullValue,
  ObjectValue,
  parsePropertyId
} from 'obsidian';

import {
  buildNestedPropertyUpdate,
  collectNestedPropertyPaths,
  getNestedPropertyValue,
  resolveNestedPropertyKeys
} from '../nested-values/nested-property-paths.ts';

// TODO: Import these two shapes from `obsidian-typings` and delete them once it declares
// `BasesEntry.getPropertyKeys`, `BasesEntry.getRawProperty` and `BasesView.updateProperty`. They are Bases
// internals the public `obsidian.d.ts` leaves out, verified against Obsidian 1.15.1's `app.js`.

/**
 * The internal members of a Bases row that this patch relies on.
 */
interface BasesEntryInternals {
  readonly file: TFile;
  readonly getPropertyKeys: () => string[];
  readonly getRawProperty: (name: string) => unknown;
  readonly getValue: (propertyId: BasesPropertyId) => null | Value;
}

/**
 * The internal member of a Bases view that writes a property edited in place.
 */
interface BasesViewInternals {
  readonly updateProperty: (file: TFile, name: string, value: unknown) => Promise<void>;
}

/**
 * Parameters for constructing a {@link NestedPropertyBasesPatchComponent}.
 */
interface NestedPropertyBasesPatchComponentConstructorParams {
  readonly app: App;
}

/**
 * Lets Bases show and edit nested frontmatter properties as ordinary columns (issue #17).
 *
 * Bases names a note property `note.<name>` and reads `<name>` as ONE top-level frontmatter key, so
 * `note.book.author` looks for a key spelled `book.author`, finds none and shows an empty cell. Nested values
 * were reachable only through a formula, which is read-only. Four methods of two public runtime classes
 * (`BasesEntry` and `BasesView`, both exported by `obsidian`) carry the whole feature:
 *
 * - `BasesEntry.getPropertyKeys` feeds the base's list of relevant properties, so adding the nested paths of
 *   each row's note puts them in the Properties picker, scoped to the notes the base actually shows.
 * - `BasesEntry.getValue` serves every view (table, cards, list), sorting, grouping and summaries.
 * - `BasesEntry.getRawProperty` is what the table's in-place editor renders from.
 * - `BasesView.updateProperty` is what that editor writes through. A nested write becomes a write of the whole
 *   top-level key, so it keeps Bases' own undo and redo.
 *
 * Each patch calls the original first and only steps in when the original found nothing and the name is a
 * dotted path into the note's objects. A note whose frontmatter has a top-level key spelled with the dots is
 * left to Obsidian. If a future Obsidian drops one of the internal methods, nothing is patched at all.
 */
export class NestedPropertyBasesPatchComponent extends MonkeyAroundComponent {
  private readonly app: App;

  public constructor(params: NestedPropertyBasesPatchComponentConstructorParams) {
    super();
    this.app = params.app;
  }

  public override onload(): void {
    const entryPrototype = castTo<BasesEntryInternals>(BasesEntry.prototype);
    const viewPrototype = castTo<BasesViewInternals>(BasesView.prototype);
    if (!hasMethods(entryPrototype, ['getPropertyKeys', 'getRawProperty', 'getValue']) || !hasMethods(viewPrototype, ['updateProperty'])) {
      return;
    }

    this.registerMethodPatch({
      $object: entryPrototype,
      methodName: 'getPropertyKeys',
      patchHandler: ({
        fallback,
        originalThis
      }) => [...fallback(), ...collectNestedPropertyPaths(this.getFrontmatter(originalThis.file))]
    });

    this.registerMethodPatch({
      $object: entryPrototype,
      methodName: 'getRawProperty',
      patchHandler: ({
        fallback,
        originalArguments: [name],
        originalThis
      }) => fallback() ?? getNestedPropertyValue(this.getFrontmatter(originalThis.file), name)
    });

    this.registerMethodPatch({
      $object: entryPrototype,
      methodName: 'getValue',
      patchHandler: ({
        fallback,
        originalArguments: [propertyId],
        originalThis
      }) => {
        const value = fallback();
        return value === null || (value instanceof NullValue) ? this.getNestedValue(originalThis, propertyId) ?? value : value;
      }
    });

    this.registerMethodPatch({
      $object: viewPrototype,
      methodName: 'updateProperty',
      patchHandler: ({
        fallback,
        originalArguments: [file, name, value],
        originalMethodBound
      }) => {
        const update = buildNestedPropertyUpdate({ frontmatter: this.getFrontmatter(file), path: name, value });
        return update === null ? fallback() : originalMethodBound(file, update.key, update.value);
      }
    });
  }

  private getFrontmatter(file: TFile): GenericObject {
    return (this.app.metadataCache.getFileCache(file)?.frontmatter as GenericObject | undefined) ?? {};
  }

  private getNestedValue(entry: BasesEntryInternals, propertyId: BasesPropertyId): null | Value {
    const { name, type } = parsePropertyId(propertyId);
    if (type !== 'note') {
      return null;
    }
    const keys = resolveNestedPropertyKeys(this.getFrontmatter(entry.file), name);
    if (keys === null) {
      return null;
    }
    const [topKey = '', ...restKeys] = keys;
    // Walking Bases' own values keeps its conversion of each leaf: links, dates, tags and URLs.
    let value = entry.getValue(`note.${topKey}`);
    for (const key of restKeys) {
      if (!(value instanceof ObjectValue)) {
        return null;
      }
      value = value.get(key);
    }
    return value;
  }
}

function hasMethods(prototype: object, methodNames: readonly string[]): boolean {
  return methodNames.every((methodName) => typeof Reflect.get(prototype, methodName) === 'function');
}
