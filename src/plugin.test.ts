import type {
  App as AppOriginal,
  PluginManifest
} from 'obsidian';

import { OpenDemoVaultCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/open-demo-vault-command-handler';
import { UndoBulkOperationCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/undo-bulk-operation-command-handler';
import { BulkOperationCommitComponent } from '@mnaoumov/obsidian-lib/components/bulk-operation-commit-component';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettings } from './settings/plugin-settings.ts';

import { Plugin } from './plugin.ts';
import { NestedPropertyRendererComponent } from './properties-editor/nested-property-renderer.ts';
import { NestedPropertySearchPatchComponent } from './search/nested-property-search-patch-component.ts';
import { NestedPropertyVaultOpsComponent } from './vault-ops/nested-property-vault-ops-component.ts';

interface ObsidianComponentModule {
  readonly Component: new () => object;
}

interface PluginSettingsComponentWithSettings {
  readonly settings: PluginSettings;
}

interface PluginWithSettings {
  readonly pluginSettingsComponent: PluginSettingsComponentWithSettings;
}

interface RendererWithToggle {
  readonly toggleFullKeyDisplay: ReturnType<typeof vi.fn>;
}

interface VaultOpsWithCommands {
  readonly deleteNestedPropertyAcrossVault: ReturnType<typeof vi.fn>;
  readonly renameNestedPropertyAcrossVault: ReturnType<typeof vi.fn>;
}

async function loadableComponentStub(): Promise<ReturnType<typeof vi.fn>> {
  const { Component } = await vi.importActual<ObsidianComponentModule>('obsidian');
  // Vitest requires a non-arrow function for a mock invoked with `new`; it must return a fresh real
  // `Component`. Constructing a stub class directly would route `this` through vitest's mock proxy and
  // break the test-mocks `Component` constructor's own strict proxy. The stub carries a
  // `toggleFullKeyDisplay` spy so the command callback can be asserted to delegate to it.
  // eslint-disable-next-line prefer-arrow-callback -- See above; an arrow cannot be used here.
  return vi.fn(function componentStub() {
    const component = new Component();
    Object.assign(component, { toggleFullKeyDisplay: vi.fn() });
    return component;
  });
}

vi.mock('./properties-editor/nested-property-renderer.ts', async () => ({
  NestedPropertyRendererComponent: await loadableComponentStub()
}));

// Mirrors `loadableComponentStub` but exposes the two vault-wide command methods as async spies so the
// command callbacks can be asserted to delegate to them.
async function loadableVaultOpsStub(): Promise<ReturnType<typeof vi.fn>> {
  const { Component } = await vi.importActual<ObsidianComponentModule>('obsidian');
  // eslint-disable-next-line prefer-arrow-callback -- A non-arrow function so it is constructable via `new`.
  return vi.fn(function vaultOpsComponentStub() {
    const component = new Component();
    Object.assign(component, {
      deleteNestedPropertyAcrossVault: vi.fn().mockResolvedValue(undefined),
      renameNestedPropertyAcrossVault: vi.fn().mockResolvedValue(undefined)
    });
    return component;
  });
}

vi.mock('./vault-ops/nested-property-vault-ops-component.ts', async () => ({
  NestedPropertyVaultOpsComponent: await loadableVaultOpsStub()
}));

// The native-search patch component has no command surface; it just needs to be a loadable `Component` so
// the real `addChild` eager-load succeeds.
async function loadablePlainComponentStub(): Promise<ReturnType<typeof vi.fn>> {
  const { Component } = await vi.importActual<ObsidianComponentModule>('obsidian');
  // eslint-disable-next-line prefer-arrow-callback -- A non-arrow function so it is constructable via `new`.
  return vi.fn(function plainComponentStub() {
    return new Component();
  });
}

vi.mock('./search/nested-property-search-patch-component.ts', async () => ({
  NestedPropertySearchPatchComponent: await loadablePlainComponentStub()
}));

// `OpenDemoVaultCommandHandler` is registered through the real `commandHandlerComponent`, which calls
// `buildCommand()` then `onRegistered()` on each handler — so the stub must supply both (a minimal command
// and a noop) to keep that real registration path working; the constructor spy is what the test asserts on.
vi.mock('@mnaoumov/obsidian-lib/command-handlers/open-demo-vault-command-handler', () => ({
  // eslint-disable-next-line prefer-arrow-callback -- a non-arrow function so it is constructable via `new`.
  OpenDemoVaultCommandHandler: vi.fn(function openDemoVaultCommandHandlerStub() {
    return {
      buildCommand: vi.fn(() => ({ id: 'open-demo-vault', name: 'Open demo vault' })),
      onRegistered: vi.fn()
    };
  })
}));

vi.mock('@mnaoumov/obsidian-lib/components/bulk-operation-commit-component', async () => ({
  BulkOperationCommitComponent: await loadablePlainComponentStub()
}));

vi.mock('@mnaoumov/obsidian-lib/command-handlers/undo-bulk-operation-command-handler', () => ({
  // eslint-disable-next-line prefer-arrow-callback -- a non-arrow function so it is constructable via `new`.
  UndoBulkOperationCommandHandler: vi.fn(function undoBulkOperationCommandHandlerStub() {
    return {
      buildCommand: vi.fn(() => ({ id: 'undo-bulk-operation', name: 'Undo a bulk operation...' })),
      onRegistered: vi.fn()
    };
  })
}));

const MockBulkOperationCommitComponent = vi.mocked(BulkOperationCommitComponent);
const MockUndoBulkOperationCommandHandler = vi.mocked(UndoBulkOperationCommandHandler);
const MockNestedPropertyRendererComponent = vi.mocked(NestedPropertyRendererComponent);
const MockNestedPropertyVaultOpsComponent = vi.mocked(NestedPropertyVaultOpsComponent);
const MockNestedPropertySearchPatchComponent = vi.mocked(NestedPropertySearchPatchComponent);
const MockOpenDemoVaultCommandHandler = vi.mocked(OpenDemoVaultCommandHandler);

const manifest: PluginManifest = {
  author: 'test',
  description: 'test',
  id: 'nested-properties',
  minAppVersion: '1.0.0',
  name: 'Nested Properties',
  version: '1.0.0'
};

let app: AppOriginal;

function instanceOf(mock: ReturnType<typeof vi.fn>): unknown {
  // The value that flows through `addChild` is the constructor's return value.
  return mock.mock.results[0]?.value;
}

describe('Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const appMock = App.createConfigured__();
    appMock.workspace.onLayoutReady = vi.fn((callback: () => void) => {
      callback();
    });
    app = appMock.asOriginalType__();
  });

  describe('onload', () => {
    it('should create NestedPropertyRendererComponent with app', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      const params = MockNestedPropertyRendererComponent.mock.calls[0]?.[0];
      expect(params?.app).toBe(app);
    });

    it('should add NestedPropertyRendererComponent as a child', async () => {
      const plugin = new Plugin(app, manifest);
      const addChildSpy = vi.spyOn(plugin, 'addChild');
      await plugin.onload();

      expect(addChildSpy).toHaveBeenCalledWith(instanceOf(MockNestedPropertyRendererComponent));
    });

    it('should register the toggle-full-key-display command', async () => {
      const plugin = new Plugin(app, manifest);
      const addCommandSpy = vi.spyOn(plugin, 'addCommand');
      await plugin.onload();

      expect(addCommandSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: 'toggle-full-key-display',
        name: 'Toggle full key display'
      }));
    });

    it('should delegate the toggle-full-key-display command to the renderer', async () => {
      const plugin = new Plugin(app, manifest);
      const addCommandSpy = vi.spyOn(plugin, 'addCommand');
      await plugin.onload();

      const command = addCommandSpy.mock.calls
        .map((call) => call[0])
        .find((candidate) => candidate.id === 'toggle-full-key-display');
      command?.callback?.();

      const renderer = castTo<RendererWithToggle>(instanceOf(MockNestedPropertyRendererComponent));
      expect(renderer.toggleFullKeyDisplay).toHaveBeenCalledTimes(1);
    });

    it('should add NestedPropertyVaultOpsComponent as a child', async () => {
      const plugin = new Plugin(app, manifest);
      const addChildSpy = vi.spyOn(plugin, 'addChild');
      await plugin.onload();

      expect(addChildSpy).toHaveBeenCalledWith(instanceOf(MockNestedPropertyVaultOpsComponent));
    });

    it('should register the rename-nested-property-across-vault command', async () => {
      const plugin = new Plugin(app, manifest);
      const addCommandSpy = vi.spyOn(plugin, 'addCommand');
      await plugin.onload();

      expect(addCommandSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: 'rename-nested-property-across-vault',
        name: 'Rename a nested property in all notes'
      }));
    });

    it('should register the delete-nested-property-across-vault command', async () => {
      const plugin = new Plugin(app, manifest);
      const addCommandSpy = vi.spyOn(plugin, 'addCommand');
      await plugin.onload();

      expect(addCommandSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: 'delete-nested-property-across-vault',
        name: 'Delete a nested property from all notes'
      }));
    });

    it('should delegate the rename command to the vault-ops component', async () => {
      const plugin = new Plugin(app, manifest);
      const addCommandSpy = vi.spyOn(plugin, 'addCommand');
      await plugin.onload();

      const command = addCommandSpy.mock.calls
        .map((call) => call[0])
        .find((candidate) => candidate.id === 'rename-nested-property-across-vault');
      command?.callback?.();

      const vaultOps = castTo<VaultOpsWithCommands>(instanceOf(MockNestedPropertyVaultOpsComponent));
      expect(vaultOps.renameNestedPropertyAcrossVault).toHaveBeenCalledTimes(1);
    });

    it('should delegate the delete command to the vault-ops component', async () => {
      const plugin = new Plugin(app, manifest);
      const addCommandSpy = vi.spyOn(plugin, 'addCommand');
      await plugin.onload();

      const command = addCommandSpy.mock.calls
        .map((call) => call[0])
        .find((candidate) => candidate.id === 'delete-nested-property-across-vault');
      command?.callback?.();

      const vaultOps = castTo<VaultOpsWithCommands>(instanceOf(MockNestedPropertyVaultOpsComponent));
      expect(vaultOps.deleteNestedPropertyAcrossVault).toHaveBeenCalledTimes(1);
    });

    it('should add NestedPropertySearchPatchComponent as a child with the app', async () => {
      const plugin = new Plugin(app, manifest);
      const addChildSpy = vi.spyOn(plugin, 'addChild');
      await plugin.onload();

      expect(addChildSpy).toHaveBeenCalledWith(instanceOf(MockNestedPropertySearchPatchComponent));
      expect(MockNestedPropertySearchPatchComponent.mock.calls[0]?.[0]?.app).toBe(app);
    });

    it('should commit bulk operations only while the setting is on', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      const params = MockBulkOperationCommitComponent.mock.calls[0]?.[0];
      expect(params?.app).toBe(app);
      expect(params?.pluginId).toBe(manifest.id);
      expect(params?.isEnabled()).toBe(false);
      castTo<PluginWithSettings>(plugin).pluginSettingsComponent.settings.shouldCommitBulkOperations = true;
      expect(params?.isEnabled()).toBe(true);
    });

    it('should hand the bulk operation commit component to the vault-ops component', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      expect(MockNestedPropertyVaultOpsComponent.mock.calls[0]?.[0]?.bulkOperationCommitComponent)
        .toBe(instanceOf(MockBulkOperationCommitComponent));
    });

    it('should register the undo-bulk-operation command handler with the same component and setting', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      expect(MockUndoBulkOperationCommandHandler).toHaveBeenCalled();
      const params = MockUndoBulkOperationCommandHandler.mock.calls[0]?.[0];
      expect(params?.bulkOperationCommitComponent).toBe(instanceOf(MockBulkOperationCommitComponent));
      expect(params?.isEnabled()).toBe(false);
      castTo<PluginWithSettings>(plugin).pluginSettingsComponent.settings.shouldCommitBulkOperations = true;
      expect(params?.isEnabled()).toBe(true);
    });

    it('should register the open-demo-vault command handler with the app, plugin id, and version', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      // The handler factory is invoked once per menu surface, each
      // getting its own instances — so the handler is constructed more than once by design.
      expect(MockOpenDemoVaultCommandHandler).toHaveBeenCalled();
      const params = MockOpenDemoVaultCommandHandler.mock.calls[0]?.[0];
      expect(params?.app).toBe(app);
      expect(params?.pluginId).toBe(manifest.id);
      expect(params?.pluginVersion).toBe(manifest.version);
    });
  });
});
