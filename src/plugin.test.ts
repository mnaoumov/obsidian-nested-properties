import type {
  App as AppOriginal,
  PluginManifest
} from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { OpenDemoVaultCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/open-demo-vault-command-handler';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { NestedPropertyRendererComponent } from './nested-property-renderer.ts';
import { Plugin } from './plugin.ts';

// The real `PluginBase.onload()` loads dev-utils' own notice/context/debug components, which read a
// Shared-state bag off the app via `getObsidianDevUtilsState`. The strict App mock has no such bag, so
// Stub this one utility (return a fresh value wrapper per call) — mirroring dev-utils' own PluginBase test.
vi.mock('obsidian-dev-utils/obsidian/app', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian-dev-utils/obsidian/app')>(),
  getObsidianDevUtilsState: vi.fn((_app: unknown, _key: string, defaultValue: unknown) => ({ value: defaultValue }))
}));

// `NestedPropertyRendererComponent` is added via `addChild`, which eager-loads it, so its stub must be
// Loadable — it returns a real `Component`. The instance that flows through `addChild` is the stub's
// Return value (`mock.results[0].value`), not the discarded `this` (`mock.instances[0]`).
interface ObsidianComponentModule {
  Component: new () => object;
}

interface RendererWithToggle {
  toggleFullKeyDisplay: ReturnType<typeof vi.fn>;
}

async function loadableComponentStub(): Promise<ReturnType<typeof vi.fn>> {
  const { Component } = await vi.importActual<ObsidianComponentModule>('obsidian');
  // Vitest requires a non-arrow function for a mock invoked with `new`; it must return a fresh real
  // `Component`. Constructing a stub class directly would route `this` through vitest's mock proxy and
  // Break the test-mocks `Component` constructor's own strict proxy. The stub carries a
  // `toggleFullKeyDisplay` spy so the command callback can be asserted to delegate to it.
  // eslint-disable-next-line prefer-arrow-callback -- See above; an arrow cannot be used here.
  return vi.fn(function componentStub() {
    const component = new Component();
    Object.assign(component, { toggleFullKeyDisplay: vi.fn() });
    return component;
  });
}

vi.mock('./nested-property-renderer.ts', async () => ({
  NestedPropertyRendererComponent: await loadableComponentStub()
}));

// `OpenDemoVaultCommandHandler` is registered through the real `commandHandlerComponent`, which calls
// `buildCommand()` then `onRegistered()` on each handler — so the stub must supply both (a minimal command
// And a noop) to keep that real registration path working; the constructor spy is what the test asserts on.
vi.mock('obsidian-dev-utils/obsidian/command-handlers/open-demo-vault-command-handler', () => ({
  // eslint-disable-next-line prefer-arrow-callback -- a non-arrow function so it is constructable via `new`.
  OpenDemoVaultCommandHandler: vi.fn(function openDemoVaultCommandHandlerStub() {
    return {
      buildCommand: vi.fn(() => ({ id: 'open-demo-vault', name: 'Open demo vault' })),
      onRegistered: vi.fn()
    };
  })
}));

const MockNestedPropertyRendererComponent = vi.mocked(NestedPropertyRendererComponent);
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
    appMock.workspace.onLayoutReady = vi.fn((cb: () => void) => {
      cb();
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

    it('should register the open-demo-vault command handler with the app and manifest', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      expect(MockOpenDemoVaultCommandHandler).toHaveBeenCalledOnce();
      const params = MockOpenDemoVaultCommandHandler.mock.calls[0]?.[0];
      expect(params?.app).toBe(app);
      expect(params?.manifest).toBe(manifest);
    });
  });
});
