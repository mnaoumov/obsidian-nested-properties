import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';

import { NestedPropertyRendererComponent } from './nested-property-renderer.ts';

export class Plugin extends PluginBase {
  protected override onloadImpl(): void {
    this.addChild(new NestedPropertyRendererComponent(this.app));
  }
}
