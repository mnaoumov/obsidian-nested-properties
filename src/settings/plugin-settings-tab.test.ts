import type { PluginSettingsComponentBase } from '@mnaoumov/obsidian-lib/components/plugin-settings-component';
import type {
  App as AppOriginal,
  Plugin,
  SettingGroup
} from 'obsidian';
import type { MockInstance } from 'vitest';

import { PluginSettingsTabBase } from '@mnaoumov/obsidian-lib/plugin/plugin-settings-tab';
import { SettingEx } from '@mnaoumov/obsidian-lib/setting-ex';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { Platform } from 'obsidian';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettings } from './plugin-settings.ts';

import { PluginSettingsTab } from './plugin-settings-tab.ts';

/**
 * Every settings key the tab is expected to expose. Kept as a list rather than one `it` per key so that
 * adding a setting without a row - or a row without a setting - fails loudly on the count assertion too.
 *
 * `isFullKeyDisplayEnabled` is deliberately absent: it is toggled from the Properties header button and the
 * command, and the settings component only persists it.
 */
const EXPECTED_BOUND_KEYS: (keyof PluginSettings)[] = [
  'initialExpandLevel',
  'shouldCommitBulkOperations'
];

interface VisibleDefinition {
  readonly name: string;
  readonly visible: () => boolean;
}

describe('PluginSettingsTab', () => {
  let app: AppOriginal;
  let bindSpy: MockInstance<PluginSettingsTab['bind']>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = App.createConfigured__().asOriginalType__();

    // `PluginSettingsTabBase.bind` duck-types components via a strict-proxy property probe that the real
    // test-mocks components throw on, so neutralize only `bind`'s return value while keeping the real base,
    // the real `SettingEx` and the real rendered components.
    bindSpy = vi.spyOn(PluginSettingsTabBase.prototype, 'bind').mockImplementation((params) => params.valueComponent);
  });

  it('should create an instance', () => {
    const tab = createTab();
    expect(tab).toBeInstanceOf(PluginSettingsTab);
  });

  it('should render setting elements in containerEl', () => {
    const tab = createTab();
    callDisplay(tab);
    expect(tab.containerEl.children.length).toBeGreaterThan(0);
  });

  it('should declare one row per setting', () => {
    const tab = createTab();
    expect(tab.getSettingDefinitions()).toHaveLength(EXPECTED_BOUND_KEYS.length);
  });

  it('should bind every setting exactly once', () => {
    const tab = createTab();
    callDisplay(tab);
    expect(getBoundKeys().sort()).toEqual([...EXPECTED_BOUND_KEYS].sort());
  });

  // The commits run the system `git`, which only the desktop app can reach.
  it('should show the bulk operation commits row on desktop only', () => {
    const tab = createTab();
    const definition = castTo<VisibleDefinition[]>(tab.getSettingDefinitions())
      .find((candidate) => candidate.name === 'Should commit bulk operations');
    const isDesktop = Platform.isDesktop;

    try {
      Platform.isDesktop = true;
      expect(definition?.visible()).toBe(true);
      Platform.isDesktop = false;
      expect(definition?.visible()).toBe(false);
    } finally {
      Platform.isDesktop = isDesktop;
    }
  });

  /**
   * Invokes every declared row's `render` callback the way Obsidian does when the tab is opened, so the
   * bindings are still exercised now that the rows are declarative.
   *
   * @param tab - The settings tab.
   */
  function callDisplay(tab: PluginSettingsTab): void {
    for (const definition of tab.getSettingDefinitions()) {
      if ('render' in definition) {
        definition.render(new SettingEx(tab.containerEl), castTo<SettingGroup>(null));
      }
    }
  }

  function createTab(): PluginSettingsTab {
    const plugin = strictProxy<Plugin>({
      app,
      manifest: { id: 'test-plugin' }
    });

    const pluginSettingsComponent = strictProxy<PluginSettingsComponentBase<PluginSettings>>({
      defaultSettings: castTo<PluginSettings>({}),
      on: castTo<PluginSettingsComponentBase<PluginSettings>['on']>(vi.fn(() => ({
        asyncEventSource: { offref: vi.fn() }
      }))),
      settings: castTo<PluginSettings>({}),
      settingsState: castTo<PluginSettingsComponentBase<PluginSettings>['settingsState']>({
        effectiveValues: {},
        inputValues: {},
        validationMessages: {}
      })
    });

    return new PluginSettingsTab({
      plugin,
      pluginSettingsComponent
    });
  }

  function getBoundKeys(): unknown[] {
    return bindSpy.mock.calls.map((call): unknown => call[0].propertyName);
  }
});
