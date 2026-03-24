import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-base';

import type { PluginTypes } from './plugin-types.ts';

import { NestedPropertyRenderer } from './nested-property-renderer.ts';

export class Plugin extends PluginBase<PluginTypes> {
  protected override createSettingsManager(): null {
    return null;
  }

  protected override createSettingsTab(): null {
    return null;
  }

  protected override async onloadImpl(): Promise<void> {
    await super.onloadImpl();
    this.addChild(new NestedPropertyRenderer(this.app));
  }
}
