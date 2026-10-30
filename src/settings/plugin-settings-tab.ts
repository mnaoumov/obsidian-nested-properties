import type { SettingDefinitionItem } from 'obsidian';

import { appendCodeBlock } from '@mnaoumov/obsidian-lib/html-element';
import { PluginSettingsTabBase } from '@mnaoumov/obsidian-lib/plugin/plugin-settings-tab';
import { Platform } from 'obsidian';

import type { PluginSettings } from './plugin-settings.ts';

export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  protected override getSettingDefinitionItems(): SettingDefinitionItem[] {
    return [
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('How many levels of a nested property are expanded when a note is opened.');
          f.createEl('br');
          f.appendText('0, the default, collapses everything - a collapsed property is still readable from its preview. 1 expands the nested property but not its children, 2 also expands its children, and so on.');
          f.createEl('br');
          f.appendText('An array index counts as a level of its own.');
          f.createEl('br');
          f.appendText('A note can override this for itself:');
          f.createEl('br');
          appendCodeBlock(f, 'nestedProperties:\n  initialExpandLevel: 2');
        }),
        name: 'Initial expand level',
        render: (setting) => {
          setting.addNumber(($number) => {
            this.bind({ propertyName: 'initialExpandLevel', valueComponent: $number });
          });
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('Whether to record each vault-wide rename or delete of a nested property as git commits, when the vault is inside a git repository.');
          f.createEl('br');
          f.appendText('Whatever was pending is committed first as ');
          appendCodeBlock(f, 'chore: before OP<n>');
          f.appendText(', then the run\'s own changes as ');
          appendCodeBlock(f, 'OP<n>: <summary>');
          f.appendText('.');
          f.createEl('br');
          f.appendText('The ');
          appendCodeBlock(f, 'Undo a bulk operation...');
          f.appendText(' command reverts one of those commits. Desktop only; uses the system ');
          appendCodeBlock(f, 'git');
          f.appendText('.');
        }),
        name: 'Should commit bulk operations',
        render: (setting) => {
          setting.addToggle((toggle) => {
            this.bind({ propertyName: 'shouldCommitBulkOperations', valueComponent: toggle });
          });
        },
        visible: () => Platform.isDesktop
      })
    ];
  }
}
