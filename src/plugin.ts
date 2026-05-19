import type {
  App,
  PluginManifest
} from 'obsidian';

import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';

import { NestedPropertyRendererComponent } from './nested-property-renderer.ts';

export class Plugin extends PluginBase {
  public constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
    this.addChild(new NestedPropertyRendererComponent(app));
  }
}
