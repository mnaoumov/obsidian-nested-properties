import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { OpenDemoVaultCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/open-demo-vault-command-handler';
import { PluginDataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';

import { NestedPropertyRendererComponent } from './nested-property-renderer.ts';
import { NestedPropertyVaultOpsComponent } from './nested-property-vault-ops-component.ts';
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
    const nestedPropertyVaultOpsComponent = this.addChild(
      new NestedPropertyVaultOpsComponent({
        app: this.app,
        pluginNoticeComponent: this.pluginNoticeComponent
      })
    );
    this.addCommand({
      callback: () => {
        invokeAsyncSafely(() => nestedPropertyVaultOpsComponent.renameNestedPropertyAcrossVault());
      },
      id: 'rename-nested-property-across-vault',
      name: 'Rename a nested property in all notes'
    });
    this.addCommand({
      callback: () => {
        invokeAsyncSafely(() => nestedPropertyVaultOpsComponent.deleteNestedPropertyAcrossVault());
      },
      id: 'delete-nested-property-across-vault',
      name: 'Delete a nested property from all notes'
    });
    this.commandHandlerComponent.registerCommandHandlers([
      new OpenDemoVaultCommandHandler({
        app: this.app,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginVersion: this.manifest.version
      })
    ]);
  }
}
