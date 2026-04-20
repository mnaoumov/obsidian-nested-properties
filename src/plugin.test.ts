import type { RegisterComponentParams } from 'obsidian-dev-utils/obsidian/plugin/plugin';

import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

interface ComponentWithApp {
  app: unknown;
}

const registeredComponents: RegisterComponentParams[] = [];

const PluginBaseMock = vi.hoisted(() =>
  class {
    public app: unknown;
    public manifest: unknown;

    public constructor(app: unknown, manifest: unknown) {
      this.app = app;
      this.manifest = manifest;
    }

    protected registerComponent(params: RegisterComponentParams): void {
      registeredComponents.push(params);
    }
  }
);

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin', () => ({
  PluginBase: PluginBaseMock
}));

vi.mock('./nested-property-renderer.ts', () => ({
  NestedPropertyRenderer: class MockNestedPropertyRenderer {
    public app: unknown;
    public constructor(app: unknown) {
      this.app = app;
    }
  }
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { Plugin } from './plugin.ts';

describe('Plugin', () => {
  it('should register NestedPropertyRenderer component', () => {
    registeredComponents.length = 0;
    const mockApp = { name: 'test-app' };
    const mockManifest = { id: 'nested-properties' };

    new Plugin(mockApp as never, mockManifest as never);

    expect(registeredComponents).toHaveLength(1);
    const params = registeredComponents.at(0);
    expect(params).toBeDefined();
    expect(params?.component).toBeDefined();
    // eslint-disable-next-line no-restricted-syntax -- Accessing mock properties requires double assertion.
    expect((params?.component as unknown as ComponentWithApp).app).toBe(mockApp);
  });
});
