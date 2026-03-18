import type { PluginTypesBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-types-base';

import type { Plugin } from './plugin.ts';

export interface PluginTypes extends PluginTypesBase {
  plugin: Plugin;
}
