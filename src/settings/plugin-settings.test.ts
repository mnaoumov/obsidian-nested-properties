import {
  describe,
  expect,
  it
} from 'vitest';

import { PluginSettings } from './plugin-settings.ts';

describe('PluginSettings', () => {
  it('should default isFullKeyDisplayEnabled to false', () => {
    const settings = new PluginSettings();
    expect(settings.isFullKeyDisplayEnabled).toBe(false);
  });

  // 0 on purpose: an upgrade must not change how an existing vault renders.
  it('should default initialExpandLevel to 0', () => {
    const settings = new PluginSettings();
    expect(settings.initialExpandLevel).toBe(0);
  });
});
