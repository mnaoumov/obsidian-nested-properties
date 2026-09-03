import type { SettingDefinitionItem } from 'obsidian';

import { appendCodeBlock } from 'obsidian-dev-utils/obsidian/html-element';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  protected override getSettingDefinitionItems(): SettingDefinitionItem[] {
    return [
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('How many levels of a nested property are expanded when a note is opened.');
          f.createEl('br');
          f.appendText('0 collapses everything, 1 expands the nested property but not its children, 2 also expands its children, and so on.');
          f.createEl('br');
          f.appendText('An array index counts as a level of its own.');
          f.createEl('br');
          f.appendText('A note can override this for itself:');
          f.createEl('br');
          appendCodeBlock(f, 'nestedProperties:\n  initialExpandLevel: 2');
        }),
        name: 'Initial expand level',
        render: (setting) => {
          setting.addNumber((number) => {
            this.bind({ propertyName: 'initialExpandLevel', valueComponent: number });
          });
        }
      })
    ];
  }
}
