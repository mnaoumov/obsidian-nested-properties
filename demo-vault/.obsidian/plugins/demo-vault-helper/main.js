'use strict';

// Demo Vault Helper - a UNIVERSAL bootstrap plugin shipped inside a plugin's demo vault. It is
// meant to be byte-identical across every plugin's demo vault and carries nothing plugin-specific:
// on first open (after you trust the vault) it installs and enables CodeScript Toolkit, then runs
// the vault's own startup script via CodeScript Toolkit's require():
//
//   window.require('//_assets/CodeScriptToolkit/startup.ts')
//
// The `//` prefix is vault-root-relative, so the path is the same in every demo vault regardless of
// CodeScript Toolkit's configured modules root. All per-vault setup - opening the landing note, any
// plugin-specific configuration - lives in that startup script, keeping this helper generic.
//
// It replicates obsidian-dev-utils' installCommunityPlugin flow with plain Obsidian internals because
// it cannot import obsidian-dev-utils: that module is only reachable through CodeScript Toolkit's
// require(), which is exactly what this plugin bootstraps.
//
// TODO(T115): this committed per-vault copy is a stand-in until obsidian-dev-utils ships a shared,
// release-injected version of this helper; replace it with that (and drop the committed files) once
// T115 lands.

const { Plugin, Notice, requestUrl } = require('obsidian');

const CODESCRIPT_TOOLKIT_ID = 'fix-require-modules';
const CODESCRIPT_TOOLKIT_MODULES_ROOT = '_assets/CodeScriptToolkit';
const STARTUP_SCRIPT_PATH = '//_assets/CodeScriptToolkit/startup.ts';
const COMMUNITY_PLUGINS_URL = 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/community-plugins.json';

class DemoVaultHelperPlugin extends Plugin {
  async onload() {
    this.app.workspace.onLayoutReady(() => {
      void this.setUpDemoVault();
    });
  }

  async setUpDemoVault() {
    try {
      const wasInstalled = await this.ensureCodeScriptToolkit();
      if (wasInstalled) {
        new Notice('Demo Vault Helper: installed and enabled CodeScript Toolkit.');
      }
    } catch (error) {
      console.error('Demo Vault Helper: could not install CodeScript Toolkit', error);
      new Notice('Demo Vault Helper: could not auto-install CodeScript Toolkit. See the "CodeScript Toolkit prerequisite" note for manual steps.');
      return;
    }
    this.runStartupScript();
  }

  runStartupScript() {
    try {
      window.require(STARTUP_SCRIPT_PATH);
    } catch (error) {
      console.error(`Demo Vault Helper: could not run the startup script (${STARTUP_SCRIPT_PATH})`, error);
    }
  }

  async ensureCodeScriptToolkit() {
    const { plugins } = this.app;
    if (plugins.manifests[CODESCRIPT_TOOLKIT_ID]) {
      if (!plugins.enabledPlugins.has(CODESCRIPT_TOOLKIT_ID)) {
        await plugins.enablePluginAndSave(CODESCRIPT_TOOLKIT_ID);
      }
      return false;
    }

    const entries = (await requestUrl(COMMUNITY_PLUGINS_URL)).json;
    const entry = entries.find((candidate) => candidate.id === CODESCRIPT_TOOLKIT_ID);
    if (!entry) {
      throw new Error('CodeScript Toolkit was not found in the Obsidian community plugins registry.');
    }

    const release = (await requestUrl(`https://api.github.com/repos/${entry.repo}/releases/latest`)).json;
    const version = release.tag_name;
    const manifest = (await requestUrl(`https://github.com/${entry.repo}/releases/download/${version}/manifest.json`)).json;
    await plugins.installPlugin(entry.repo, version, manifest);
    // Point CodeScript Toolkit's modules root at the vault's demo scripts BEFORE enabling, so it
    // reads the config on load and the notes' `require('/demoSetup.ts')` buttons resolve. Writing
    // this here (rather than committing the plugin's data.json) keeps all CST setup in the helper.
    await this.configureCodeScriptToolkit();
    await plugins.enablePluginAndSave(CODESCRIPT_TOOLKIT_ID);
    return true;
  }

  async configureCodeScriptToolkit() {
    const dataPath = `${this.app.vault.configDir}/plugins/${CODESCRIPT_TOOLKIT_ID}/data.json`;
    const data = { modulesRoot: CODESCRIPT_TOOLKIT_MODULES_ROOT };
    await this.app.vault.adapter.write(dataPath, `${JSON.stringify(data, null, 2)}\n`);
  }
}

module.exports = DemoVaultHelperPlugin;
