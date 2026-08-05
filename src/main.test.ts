import {
  describe,
  expect,
  it
} from 'vitest';

import DefaultExport from './main.ts';
import { Plugin } from './plugin.ts';

describe('main', () => {
  it('should export Plugin as default', () => {
    expect(DefaultExport).toBe(Plugin);
  });
});
