import type {
  App as AppOriginal,
  Plugin,
  SettingGroup
} from 'obsidian';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';
import type { MockInstance } from 'vitest';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';
import { SettingEx } from 'obsidian-dev-utils/obsidian/setting-ex';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
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
  'initialExpandLevel'
];

describe('PluginSettingsTab', () => {
  let app: AppOriginal;
  let bindSpy: MockInstance<PluginSettingsTab['bind']>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = App.createConfigured__().asOriginalType__();

    // `PluginSettingsTabBase.bind` duck-types components via a strict-proxy property probe that the real
    // Test-mocks components throw on, so neutralize only `bind`'s return value while keeping the real base,
    // The real `SettingEx` and the real rendered components.
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
