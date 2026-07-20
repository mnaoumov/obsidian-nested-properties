import process from 'node:process';
import { registerDemoVaultCoverageSuite } from 'obsidian-dev-utils/script-utils/demo-vault-coverage';
import { getRootFolder } from 'obsidian-dev-utils/script-utils/root';

// Keeps the in-repo `demo-vault/` in sync with the plugin's public surface WITHOUT
// Launching Obsidian: it reflects the real config from source and asserts every
// Setting is documented in a note, and that the guard note/member still exist
// (rename drift). Nested Properties is UI-only, so there is no feature-method
// Interface and no `docs/` folder — only the `PluginSettings` config class. The
// Plugin's runtime behavior is covered by the other integration tests, not here.
registerDemoVaultCoverageSuite({
  configInterfaces: [{ interfaceName: 'PluginSettings', sourcePath: 'src/plugin-settings.ts' }],
  interfaces: [],
  nonTrivialGuard: {
    expectDemoNote: '08 Full key display.md',
    expectMember: 'isFullKeyDisplayEnabled',
    interfaceName: 'PluginSettings',
    sourcePath: 'src/plugin-settings.ts'
  },
  rootFolder: getRootFolder() ?? process.cwd()
});
