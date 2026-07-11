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
});
