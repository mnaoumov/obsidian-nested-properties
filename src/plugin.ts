import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';

import type { PluginTypes } from './plugin-types.ts';

import { registerNestedPropertyRenderer } from './nested-property-renderer.ts';

export class Plugin extends PluginBase<PluginTypes> {
  protected override createSettingsManager(): null {
    return null;
  }

  protected override createSettingsTab(): null {
    return null;
  }

  protected override async onloadImpl(): Promise<void> {
    await super.onloadImpl();
    registerNestedPropertyRenderer(this);
  }
}
