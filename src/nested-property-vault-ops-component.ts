import type {
  App,
  TFile
} from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import type { ResourceLockComponent } from 'obsidian-dev-utils/obsidian/resource-lock';
import type { GenericObject } from 'obsidian-dev-utils/type-guards';

import { Component } from 'obsidian';
import { processFrontmatter } from 'obsidian-dev-utils/obsidian/file-manager';
import { confirm } from 'obsidian-dev-utils/obsidian/modals/confirm';
import { prompt } from 'obsidian-dev-utils/obsidian/modals/prompt';
import { selectItem } from 'obsidian-dev-utils/obsidian/modals/select-item';

import {
  collectNestedPropertyPaths,
  didDeleteNestedProperty,
  didRenameNestedProperty
} from './nested-property-paths.ts';

/**
 * A note that carries frontmatter, as yielded by the single vault traversal every vault-wide operation
 * runs on.
 */
interface NestedPropertyNote {
  /**
   * The note itself.
   */
  readonly file: TFile;

  /**
   * The note's frontmatter, as the metadata cache has it.
   */
  readonly frontmatter: GenericObject;

  /**
   * The sorted, de-duplicated nested property paths the frontmatter contains.
   */
  readonly paths: string[];
}

interface NestedPropertyPathCount {
  readonly count: number;
  readonly path: string;
}

interface NestedPropertyVaultOpsComponentApplyDeleteParams {
  readonly path: string;
}

interface NestedPropertyVaultOpsComponentApplyRenameParams {
  readonly fromPath: string;
  readonly toPath: string;
}

interface NestedPropertyVaultOpsComponentConstructorParams {
  readonly app: App;
  readonly pluginNoticeComponent: PluginNoticeComponent;
  readonly resourceLockComponent: null | ResourceLockComponent;
}

/**
 * Provides vault-wide operations over nested frontmatter properties (issue #6): renaming and deleting a
 * nested property across every note that contains it. Obsidian's built-in "All properties" view only
 * exposes top-level property names, so this component surfaces the nested ones through commands driven
 * by the shared selection/prompt/confirm modals.
 */
export class NestedPropertyVaultOpsComponent extends Component {
  private readonly app: App;
  private readonly pluginNoticeComponent: PluginNoticeComponent;
  private readonly resourceLockComponent: null | ResourceLockComponent;

  public constructor(params: NestedPropertyVaultOpsComponentConstructorParams) {
    super();
    this.app = params.app;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
    this.resourceLockComponent = params.resourceLockComponent;
  }

  public async deleteNestedPropertyAcrossVault(): Promise<void> {
    const items = this.collectPathsWithCounts();
    if (items.length === 0) {
      this.pluginNoticeComponent.showNotice('No nested properties found in the vault.');
      return;
    }

    const selected = await selectItem({
      app: this.app,
      items,
      itemTextFunction: (item) => `${item.path} (${String(item.count)})`,
      placeholder: 'Select a nested property to delete'
    });
    if (!selected) {
      return;
    }

    const isConfirmed = await confirm({
      app: this.app,
      message: `Delete the nested property "${selected.path}" from ${describeNoteCount(selected.count)}? This cannot be undone.`,
      title: 'Delete nested property'
    });
    if (!isConfirmed) {
      return;
    }

    const count = await this.applyDelete({ path: selected.path });
    this.pluginNoticeComponent.showNotice(`Deleted the nested property "${selected.path}" from ${describeNoteCount(count)}.`);
  }

  public async renameNestedPropertyAcrossVault(): Promise<void> {
    const items = this.collectPathsWithCounts();
    if (items.length === 0) {
      this.pluginNoticeComponent.showNotice('No nested properties found in the vault.');
      return;
    }

    const selected = await selectItem({
      app: this.app,
      items,
      itemTextFunction: (item) => `${item.path} (${String(item.count)})`,
      placeholder: 'Select a nested property to rename'
    });
    if (!selected) {
      return;
    }

    const newPath = await prompt({
      app: this.app,
      defaultValue: selected.path,
      placeholder: 'New dotted path (e.g. parent.child)',
      title: 'Rename nested property'
    });
    if (newPath === null) {
      return;
    }
    const trimmedNewPath = newPath.trim();
    if (trimmedNewPath === '' || trimmedNewPath === selected.path) {
      return;
    }

    const count = await this.applyRename({ fromPath: selected.path, toPath: trimmedNewPath });
    this.pluginNoticeComponent.showNotice(
      `Renamed the nested property "${selected.path}" to "${trimmedNewPath}" in ${describeNoteCount(count)}.`
    );
  }

  private async applyDelete(params: NestedPropertyVaultOpsComponentApplyDeleteParams): Promise<number> {
    const { path } = params;
    let count = 0;
    for (const note of this.iterateNotesWithNestedProperties()) {
      if (!note.paths.includes(path)) {
        continue;
      }
      await this.writeFrontmatter(note.file, (fileFrontmatter) => {
        didDeleteNestedProperty({ frontmatter: fileFrontmatter, path });
      });
      count++;
    }
    return count;
  }

  private async applyRename(params: NestedPropertyVaultOpsComponentApplyRenameParams): Promise<number> {
    const { fromPath, toPath } = params;
    let count = 0;
    for (const note of this.iterateNotesWithNestedProperties()) {
      if (!note.paths.includes(fromPath) || note.paths.includes(toPath)) {
        continue;
      }
      // Decide on a deep clone first (the mutating write cannot report back through Obsidian's
      // synchronous frontmatter callback in a way the type checker can observe).
      // eslint-disable-next-line n/no-unsupported-features/node-builtins -- structuredClone is a Web/Electron API available in Obsidian's renderer; the rule wrongly flags it against the Node engines range.
      if (!didRenameNestedProperty({ fromPath, frontmatter: structuredClone(note.frontmatter), toPath })) {
        continue;
      }
      await this.writeFrontmatter(note.file, (fileFrontmatter) => {
        didRenameNestedProperty({ fromPath, frontmatter: fileFrontmatter, toPath });
      });
      count++;
    }
    return count;
  }

  private collectPathsWithCounts(): NestedPropertyPathCount[] {
    const counts = new Map<string, number>();
    for (const note of this.iterateNotesWithNestedProperties()) {
      for (const path of note.paths) {
        counts.set(path, (counts.get(path) ?? 0) + 1);
      }
    }
    return [...counts]
      .map(([path, count]) => ({ count, path }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * The single vault traversal behind every vault-wide operation here: the markdown files, narrowed to the
   * ones the metadata cache has frontmatter for, each paired with its nested property paths.
   *
   * There is no "notes carrying this property key" index in the metadata cache, so a full scan is the
   * correct shape; what the three operations share — and used to each spell out for themselves — is only
   * the iterate-and-filter shell around {@link collectNestedPropertyPaths}.
   *
   * It is a generator rather than a materialized list so the cache read of each note still happens right
   * before that note is written, not once up front for the whole vault.
   *
   * @yields Each note that has frontmatter, with its nested property paths.
   */
  private *iterateNotesWithNestedProperties(): Generator<NestedPropertyNote, void> {
    for (const file of this.app.vault.getMarkdownFiles()) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as GenericObject | undefined;
      if (!frontmatter) {
        continue;
      }
      yield { file, frontmatter, paths: collectNestedPropertyPaths(frontmatter) };
    }
  }

  /**
   * Writes a note's frontmatter through `obsidian-dev-utils`' {@link processFrontmatter} rather than the
   * raw `FileManager.processFrontMatter`, so these vault-wide writes inherit the shared `process()`
   * primitive's resource locking, abort handling and timeout notices.
   *
   * @param file - The note to write.
   * @param frontmatterFunction - Mutates the frontmatter in place.
   * @returns A {@link Promise} that resolves once the note has been written.
   */
  private async writeFrontmatter(file: TFile, frontmatterFunction: (frontmatter: GenericObject) => void): Promise<void> {
    await processFrontmatter({
      app: this.app,
      frontmatterFunction: (fileFrontmatter) => {
        frontmatterFunction(fileFrontmatter);
      },
      pathOrFile: file,
      pluginNoticeComponent: this.pluginNoticeComponent,
      resourceLockComponent: this.resourceLockComponent
    });
  }
}

function describeNoteCount(count: number): string {
  return `${String(count)} ${count === 1 ? 'note' : 'notes'}`;
}
