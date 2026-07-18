import { OpenDemoVaultCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/open-demo-vault-command-handler';
import { PluginDataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';

import { NestedPropertyRendererComponent } from './nested-property-renderer.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettings } from './plugin-settings.ts';

export class Plugin extends PluginBase {
  protected override onloadImpl(): void {
    const dataHandler = new PluginDataHandler(this);
    const pluginSettingsComponent = this.addChild(
      new PluginSettingsComponent({
        dataHandler,
        pluginEventSource: this,
        pluginSettingsClass: PluginSettings
      })
    );
    const nestedPropertyRendererComponent = this.addChild(
      new NestedPropertyRendererComponent({
        app: this.app,
        pluginSettingsComponent
      })
    );
    this.addCommand({
      callback: () => {
        nestedPropertyRendererComponent.toggleFullKeyDisplay();
      },
      id: 'toggle-full-key-display',
      name: 'Toggle full key display'
    });
    this.commandHandlerComponent.registerCommandHandlers([
      new OpenDemoVaultCommandHandler({
        app: this.app,
        manifest: this.manifest,
        pluginNoticeComponent: this.pluginNoticeComponent
      })
    ]);
  }
}
