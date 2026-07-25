import type {
  App,
  TFile
} from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import type { GenericObject } from 'obsidian-dev-utils/type-guards';

import { Component } from 'obsidian';
import { prompt } from 'obsidian-dev-utils/obsidian/modals/prompt';
import { selectItem } from 'obsidian-dev-utils/obsidian/modals/select-item';

import type { NestedPropertyQuery } from './nested-property-query.ts';

import {
  matchesNestedPropertyQuery,
  parseNestedPropertyQuery
} from './nested-property-query.ts';

interface NestedPropertySearchComponentConstructorParams {
  readonly app: App;
  readonly pluginNoticeComponent: PluginNoticeComponent;
}

/**
 * Adds a command to find notes by a nested frontmatter property (issue #1). Obsidian's native search
 * only understands top-level property operators (`[property]` / `[property: value]`), so this evaluates
 * an equivalent nested query (`[parent][child: value]` or `parent.child: value`) across every note's
 * frontmatter and opens the chosen match.
 */
export class NestedPropertySearchComponent extends Component {
  private readonly app: App;
  private readonly pluginNoticeComponent: PluginNoticeComponent;

  public constructor(params: NestedPropertySearchComponentConstructorParams) {
    super();
    this.app = params.app;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
  }

  public async findNotesByNestedProperty(): Promise<void> {
    const rawQuery = await prompt({
      app: this.app,
      placeholder: '[parent][child: value] or parent.child: value',
      title: 'Find notes by nested property'
    });
    if (rawQuery === null) {
      return;
    }

    const query = parseNestedPropertyQuery(rawQuery);
    if (query === null) {
      this.pluginNoticeComponent.showNotice('Invalid nested property query. Use [parent][child: value] or parent.child: value.');
      return;
    }

    const matches = this.findMatchingFiles(query);
    if (matches.length === 0) {
      this.pluginNoticeComponent.showNotice(`No notes match the nested property "${query.path}".`);
      return;
    }

    const selected = await selectItem({
      app: this.app,
      items: matches,
      itemTextFunc: (file) => file.path,
      placeholder: `${String(matches.length)} matching ${matches.length === 1 ? 'note' : 'notes'}`
    });
    if (!selected) {
      return;
    }

    await this.app.workspace.getLeaf(false).openFile(selected);
  }

  private findMatchingFiles(query: NestedPropertyQuery): TFile[] {
    const matches: TFile[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as GenericObject | undefined;
      if (!frontmatter) {
        continue;
      }
      if (matchesNestedPropertyQuery(frontmatter, query)) {
        matches.push(file);
      }
    }
    return matches;
  }
}
