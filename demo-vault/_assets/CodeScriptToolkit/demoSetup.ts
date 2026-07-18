import type { App } from 'obsidian';

import { Notice } from 'obsidian';
import {
  enableCommunityPlugin,
  installCommunityPlugin
} from 'obsidian-dev-utils/obsidian/community-plugins';

const FULL_KEY_DISPLAY_COMMAND_ID = 'nested-properties:toggle-full-key-display';

export async function installAndEnable(app: App, pluginId: string): Promise<void> {
  await installCommunityPlugin({ app, pluginId });
  await enableCommunityPlugin({ app, pluginId });
  new Notice(`Installed and enabled: ${pluginId}`);
}

// Nested Properties has a single live setting - full key display - toggled by a command that flips a
// body class across all windows with no reload. So the demo just runs that command (the same thing the
// command palette and the Properties-header button do); there is no data.json patch + reload to perform.
export function toggleFullKeyDisplay(app: App): void {
  app.commands.executeCommandById(FULL_KEY_DISPLAY_COMMAND_ID);
  new Notice('Toggled full key display.');
}
