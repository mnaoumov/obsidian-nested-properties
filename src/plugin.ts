import { OpenDemoVaultCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/open-demo-vault-command-handler';
import { UndoBulkOperationCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/undo-bulk-operation-command-handler';
import { BulkOperationCommitComponent } from '@mnaoumov/obsidian-lib/components/bulk-operation-commit-component';
import { PluginSettingsTabComponent } from '@mnaoumov/obsidian-lib/components/plugin-settings-tab-component';
import { PluginDataHandler } from '@mnaoumov/obsidian-lib/data-handler';
import { PluginBase } from '@mnaoumov/obsidian-lib/plugin/plugin';
import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';

import { NestedPropertyRendererComponent } from './properties-editor/nested-property-renderer.ts';
import { NestedPropertySearchPatchComponent } from './search/nested-property-search-patch-component.ts';
import { PluginSettingsComponent } from './settings/plugin-settings-component.ts';
import { PluginSettingsTab } from './settings/plugin-settings-tab.ts';
import { PluginSettings } from './settings/plugin-settings.ts';
import { NestedPropertyVaultOpsComponent } from './vault-ops/nested-property-vault-ops-component.ts';

export class Plugin extends PluginBase {
  protected override async onloadImpl(): Promise<void> {
    const dataHandler = new PluginDataHandler(this);
    const pluginSettingsComponent = this.addChild(
      new PluginSettingsComponent({
        dataHandler,
        pluginEventSource: this,
        pluginSettingsClass: PluginSettings
      })
    );
    this.pluginSettingsComponent = pluginSettingsComponent;
    // A child is loaded as it is added, so the settings' async load tail runs
    // in parallel with the components added below instead of before them. The renderer reads
    // `isFullKeyDisplayEnabled` in its synchronous `onload` and never re-reads it on the initial load, so
    // without this wait a stored `true` was read as its default `false` for the whole session.
    await pluginSettingsComponent.loadWithPromises();

    this.addChild(
      new PluginSettingsTabComponent({
        plugin: this,
        pluginSettingsTab: new PluginSettingsTab({
          plugin: this,
          pluginSettingsComponent
        })
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
    const bulkOperationCommitComponent = this.addChild(
      new BulkOperationCommitComponent({
        app: this.app,
        isEnabled: (): boolean => pluginSettingsComponent.settings.shouldCommitBulkOperations,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent
      })
    );
    const nestedPropertyVaultOpsComponent = this.addChild(
      new NestedPropertyVaultOpsComponent({
        app: this.app,
        bulkOperationCommitComponent,
        pluginNoticeComponent: this.pluginNoticeComponent,
        resourceLockComponent: this.resourceLockComponent
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
    this.addChild(
      new NestedPropertySearchPatchComponent({
        app: this.app
      })
    );
    await this.commandHandlerComponent.registerCommandHandlers(() => [
      new UndoBulkOperationCommandHandler({
        bulkOperationCommitComponent,
        isEnabled: (): boolean => pluginSettingsComponent.settings.shouldCommitBulkOperations
      }),
      new OpenDemoVaultCommandHandler({
        app: this.app,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginVersion: this.manifest.version
      })
    ]);
  }
}
