import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';

import { NestedPropertyRendererComponent } from './nested-property-renderer.ts';

export class Plugin extends PluginBase {
  protected override onloadImpl(): void {
    const nestedPropertyRendererComponent = this.addChild(new NestedPropertyRendererComponent(this.app));
    this.addCommand({
      callback: () => {
        nestedPropertyRendererComponent.toggleFullKeyDisplay();
      },
      id: 'toggle-full-key-display',
      name: 'Toggle full key display'
    });
  }
}
