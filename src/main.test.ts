import {
  describe,
  expect,
  it
} from 'vitest';

// eslint-disable-next-line import-x/no-rename-default -- Renamed to avoid conflict with the named import of Plugin from './plugin.ts'.
import DefaultExport from './main.ts';
import { Plugin } from './plugin.ts';

describe('main', () => {
  it('should export Plugin as default', () => {
    expect(DefaultExport).toBe(Plugin);
  });
});
