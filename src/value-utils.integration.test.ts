import { evalObsidianCli } from 'obsidian-dev-utils/script-utils/obsidian-cli';
import {
  describe,
  expect,
  it
} from 'vitest';

import { getTempVaultPath } from './test-helpers/integration-test-context.ts';

const vaultPath = getTempVaultPath();

describe('type conversion integration', () => {
  describe('list -> mixed list', () => {
    it('should keep array as-is', async () => {
      const result = await evalObsidianCli({
        args: [[1, 2, 3]],
        fn: (app, value) => {
          const widget = app.metadataTypeManager.registeredTypeWidgets['list'];
          if (!widget) {
            throw new Error('Widget is not registered');
          }
          return { validates: widget.validate(value), value };
        },
        vaultPath
      });

      expect(result.validates).toBe(true);
      expect(result.value).toEqual([1, 2, 3]);
    });
  });

  describe('list -> object', () => {
    it('should warn and convert to empty object', async () => {
      const result = await evalObsidianCli({
        args: [[1, 2, 3]],
        fn: (app, value) => {
          const widget = app.metadataTypeManager.registeredTypeWidgets['object'];
          if (!widget) {
            throw new Error('Widget is not registered');
          }
          const validates = widget.validate(value);
          const converted = validates ? value : {};
          return { converted, validates };
        },
        vaultPath
      });

      expect(result.validates).toBe(false);
      expect(result.converted).toEqual({});
    });
  });

  describe('mixed list -> list (simple)', () => {
    it('should not warn for simple string array', async () => {
      const result = await evalObsidianCli({
        args: [['a', 'b', 'c']],
        fn: (app, value) => {
          const widget = app.metadataTypeManager.registeredTypeWidgets.multitext;
          return { validates: widget.validate(value) };
        },
        vaultPath
      });

      expect(result.validates).toBe(true);
    });

    it('should filter complex items from mixed array', async () => {
      const result = await evalObsidianCli({
        args: [['a', { a: 2 }, 'b', [4]]],
        fn: (app, value: unknown[]) => {
          const widget = app.metadataTypeManager.registeredTypeWidgets.multitext;
          const validates = widget.validate(value);
          const filtered = value.filter((item) => item === null || typeof item !== 'object');
          return { filtered, validates };
        },
        vaultPath
      });

      expect(result.validates).toBe(false);
      expect(result.filtered).toEqual(['a', 'b']);
    });
  });

  describe('mixed list -> object', () => {
    it('should warn and convert to empty object', async () => {
      const result = await evalObsidianCli({
        args: [[1, { a: 2 }, 3]],
        fn: (app, value) => {
          const widget = app.metadataTypeManager.registeredTypeWidgets['object'];
          if (!widget) {
            throw new Error('Widget is not registered');
          }
          const validates = widget.validate(value);
          const converted = validates ? value : {};
          return { converted, validates };
        },
        vaultPath
      });

      expect(result.validates).toBe(false);
      expect(result.converted).toEqual({});
    });
  });

  describe('object -> list (simple)', () => {
    it('should warn and convert to empty array', async () => {
      const result = await evalObsidianCli({
        args: [{ a: 1, b: 2 }],
        fn: (app, value) => {
          const widget = app.metadataTypeManager.registeredTypeWidgets.multitext;
          const validates = widget.validate(value);
          const converted = validates ? value : [];
          return { converted, validates };
        },
        vaultPath
      });

      expect(result.validates).toBe(false);
      expect(result.converted).toEqual([]);
    });
  });

  describe('object -> mixed list', () => {
    it('should warn and wrap object in array', async () => {
      const result = await evalObsidianCli({
        args: [{ a: 1, b: 2 }],
        fn: (app, value) => {
          const widget = app.metadataTypeManager.registeredTypeWidgets['list'];
          if (!widget) {
            throw new Error('Widget is not registered');
          }
          const validates = widget.validate(value);
          const converted = validates ? value : [value];
          return { converted, validates };
        },
        vaultPath
      });

      expect(result.validates).toBe(false);
      expect(result.converted).toEqual([{ a: 1, b: 2 }]);
    });
  });

  describe('primitive -> mixed list', () => {
    it('should warn and wrap string in array', async () => {
      const result = await evalObsidianCli({
        args: ['hello'],
        fn: (app, value) => {
          const widget = app.metadataTypeManager.registeredTypeWidgets['list'];
          if (!widget) {
            throw new Error('Widget is not registered');
          }
          const validates = widget.validate(value);
          const converted = validates ? value : [value];
          return { converted, validates };
        },
        vaultPath
      });

      expect(result.validates).toBe(false);
      expect(result.converted).toEqual(['hello']);
    });

    it('should warn and wrap number in array', async () => {
      const result = await evalObsidianCli({
        args: [42],
        fn: (app, value) => {
          const widget = app.metadataTypeManager.registeredTypeWidgets['list'];
          if (!widget) {
            throw new Error('Widget is not registered');
          }
          const validates = widget.validate(value);
          const converted = validates ? value : [value];
          return { converted, validates };
        },
        vaultPath
      });

      expect(result.validates).toBe(false);
      expect(result.converted).toEqual([42]);
    });
  });
});
