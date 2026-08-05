import type { App } from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import type { GenericObject } from 'obsidian-dev-utils/type-guards';

import { Component } from 'obsidian';
import { confirm } from 'obsidian-dev-utils/obsidian/modals/confirm';
import { prompt } from 'obsidian-dev-utils/obsidian/modals/prompt';
import { selectItem } from 'obsidian-dev-utils/obsidian/modals/select-item';

import {
  collectNestedPropertyPaths,
  didDeleteNestedProperty,
  didRenameNestedProperty
} from './nested-property-paths.ts';

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

  public constructor(params: NestedPropertyVaultOpsComponentConstructorParams) {
    super();
    this.app = params.app;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
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
    for (const file of this.app.vault.getMarkdownFiles()) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as GenericObject | undefined;
      if (!frontmatter || !collectNestedPropertyPaths(frontmatter).includes(path)) {
        continue;
      }
      await this.app.fileManager.processFrontMatter(file, (fileFrontmatter) => {
        didDeleteNestedProperty({ frontmatter: fileFrontmatter as GenericObject, path });
      });
      count++;
    }
    return count;
  }

  private async applyRename(params: NestedPropertyVaultOpsComponentApplyRenameParams): Promise<number> {
    const { fromPath, toPath } = params;
    let count = 0;
    for (const file of this.app.vault.getMarkdownFiles()) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as GenericObject | undefined;
      if (!frontmatter) {
        continue;
      }
      const existingPaths = collectNestedPropertyPaths(frontmatter);
      if (!existingPaths.includes(fromPath) || existingPaths.includes(toPath)) {
        continue;
      }
      // Decide on a deep clone first (the mutating write cannot report back through Obsidian's
      // Synchronous frontmatter callback in a way the type checker can observe).
      // eslint-disable-next-line n/no-unsupported-features/node-builtins -- structuredClone is a Web/Electron API available in Obsidian's renderer; the rule wrongly flags it against the Node engines range.
      if (!didRenameNestedProperty({ fromPath, frontmatter: structuredClone(frontmatter), toPath })) {
        continue;
      }
      await this.app.fileManager.processFrontMatter(file, (fileFrontmatter) => {
        didRenameNestedProperty({ fromPath, frontmatter: fileFrontmatter as GenericObject, toPath });
      });
      count++;
    }
    return count;
  }

  private collectPathsWithCounts(): NestedPropertyPathCount[] {
    const counts = new Map<string, number>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as GenericObject | undefined;
      if (!frontmatter) {
        continue;
      }
      for (const path of collectNestedPropertyPaths(frontmatter)) {
        counts.set(path, (counts.get(path) ?? 0) + 1);
      }
    }
    return [...counts]
      .map(([path, count]) => ({ count, path }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }
}

function describeNoteCount(count: number): string {
  return `${String(count)} ${count === 1 ? 'note' : 'notes'}`;
}
