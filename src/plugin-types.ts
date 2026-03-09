import type { PluginTypesBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginTypesBase';

import type { Plugin } from './plugin.ts';

export interface PluginTypes extends PluginTypesBase {
  plugin: Plugin;
}
