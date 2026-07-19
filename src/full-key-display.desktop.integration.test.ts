import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup';
import {
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

const vault = getTempVault();

beforeEach(() => {
  vault.populate({
    'full-key-top-level.md': `---
vehicle_identification_number_long_key:
  vin: ABC123456789
general_specifications_and_dimensions:
  body: sedan
---
`,
    'full-key.md': `---
vehicleSpecificationData:
  vehicle_identification_number_long_key: ABC123456789
  general_specifications_and_dimensions: sedan
  powertrain_and_transmission_details: v8
---
`
  });
});

interface KeyDisplayMeasurement {
  readonly hasFullKeyDisplayClass: boolean;
  readonly isTruncated: boolean;
  readonly keyValue: string;
}

describe('full key display command', () => {
  it('toggles nested property key truncation', async () => {
    const result = await evalInObsidian({
      fn: async ({ app, obsidianModule }) => {
        const TRUNCATION_TOLERANCE_IN_PIXELS = 2;
        const SETTLE_IN_MILLISECONDS = 300;

        const file = app.vault.getFileByPath('full-key.md');
        if (!file) {
          throw new Error('full-key.md not found');
        }
        await app.workspace.getLeaf(true).openFile(file);
        await sleep(SETTLE_IN_MILLISECONDS);

        const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
        const containerEl = view?.contentEl ?? activeDocument.body;

        // Expand the root nested property only if it is currently collapsed. The renderer remembers
        // Expanded paths across the shared Obsidian instance, so a blind toggle could collapse a
        // Property a previous test already expanded.
        const collapsible = containerEl.querySelector('.nested-properties-collapsible');
        if (collapsible instanceof HTMLElement && collapsible.hasClass('is-collapsed')) {
          const collapseBtn = collapsible.querySelector('.nested-properties-collapse-btn');
          if (collapseBtn instanceof HTMLElement) {
            collapseBtn.click();
          }
        }
        await sleep(SETTLE_IN_MILLISECONDS);

        function measure(): KeyDisplayMeasurement {
          const keyInput = containerEl.querySelector('.nested-properties-container .metadata-property-key-input');
          if (!(keyInput instanceof HTMLInputElement)) {
            throw new Error('nested key input not found');
          }
          return {
            hasFullKeyDisplayClass: activeDocument.body.hasClass('nested-properties-full-key-display'),
            isTruncated: keyInput.scrollWidth > keyInput.clientWidth + TRUNCATION_TOLERANCE_IN_PIXELS,
            keyValue: keyInput.value
          };
        }

        const before = measure();
        app.commands.executeCommandById('nested-properties:toggle-full-key-display');
        await sleep(SETTLE_IN_MILLISECONDS);
        const afterOn = measure();
        app.commands.executeCommandById('nested-properties:toggle-full-key-display');
        await sleep(SETTLE_IN_MILLISECONDS);
        const afterOff = measure();

        return {
          afterOff,
          afterOn,
          before
        };
      },
      vaultPath: vault.path
    });

    expect(result.before.keyValue).toBe('vehicle_identification_number_long_key');
    expect(result.before.isTruncated).toBe(true);
    expect(result.before.hasFullKeyDisplayClass).toBe(false);

    expect(result.afterOn.isTruncated).toBe(false);
    expect(result.afterOn.hasFullKeyDisplayClass).toBe(true);

    expect(result.afterOff.isTruncated).toBe(true);
    expect(result.afterOff.hasFullKeyDisplayClass).toBe(false);
  });

  it('toggles truncation of a top-level object property key', async () => {
    const result = await evalInObsidian({
      fn: async ({ app, obsidianModule }) => {
        const TRUNCATION_TOLERANCE_IN_PIXELS = 2;
        const SETTLE_IN_MILLISECONDS = 300;
        const TOP_LEVEL_KEY_SELECTOR = '.metadata-property.nested-properties-collapsible > .metadata-property-key > .metadata-property-key-input';

        const file = app.vault.getFileByPath('full-key-top-level.md');
        if (!file) {
          throw new Error('full-key-top-level.md not found');
        }
        await app.workspace.getLeaf(true).openFile(file);
        await sleep(SETTLE_IN_MILLISECONDS);

        const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
        const containerEl = view?.contentEl ?? activeDocument.body;

        // Expand the top-level object property only if it is currently collapsed. The renderer remembers
        // Expanded paths across the shared Obsidian instance, so a blind toggle could collapse a
        // Property a previous test already expanded.
        const collapsible = containerEl.querySelector('.metadata-property.nested-properties-collapsible');
        if (collapsible instanceof HTMLElement && collapsible.hasClass('is-collapsed')) {
          const collapseBtn = collapsible.querySelector('.nested-properties-collapse-btn');
          if (collapseBtn instanceof HTMLElement) {
            collapseBtn.click();
          }
        }
        await sleep(SETTLE_IN_MILLISECONDS);

        function measure(): KeyDisplayMeasurement {
          const keyInput = containerEl.querySelector(TOP_LEVEL_KEY_SELECTOR);
          if (!(keyInput instanceof HTMLInputElement)) {
            throw new Error('top-level key input not found');
          }
          return {
            hasFullKeyDisplayClass: activeDocument.body.hasClass('nested-properties-full-key-display'),
            isTruncated: keyInput.scrollWidth > keyInput.clientWidth + TRUNCATION_TOLERANCE_IN_PIXELS,
            keyValue: keyInput.value
          };
        }

        // Normalize to the disabled state so the assertions do not depend on earlier tests.
        if (activeDocument.body.hasClass('nested-properties-full-key-display')) {
          app.commands.executeCommandById('nested-properties:toggle-full-key-display');
          await sleep(SETTLE_IN_MILLISECONDS);
        }

        const before = measure();
        app.commands.executeCommandById('nested-properties:toggle-full-key-display');
        await sleep(SETTLE_IN_MILLISECONDS);
        const afterOn = measure();
        app.commands.executeCommandById('nested-properties:toggle-full-key-display');
        await sleep(SETTLE_IN_MILLISECONDS);
        const afterOff = measure();

        return {
          afterOff,
          afterOn,
          before
        };
      },
      vaultPath: vault.path
    });

    expect(result.before.keyValue).toBe('vehicle_identification_number_long_key');
    expect(result.before.isTruncated).toBe(true);
    expect(result.before.hasFullKeyDisplayClass).toBe(false);

    expect(result.afterOn.isTruncated).toBe(false);
    expect(result.afterOn.hasFullKeyDisplayClass).toBe(true);

    expect(result.afterOff.isTruncated).toBe(true);
    expect(result.afterOff.hasFullKeyDisplayClass).toBe(false);
  });

  it('toggles nested property key truncation via the header button', async () => {
    const result = await evalInObsidian({
      fn: async ({ app, obsidianModule }) => {
        const TRUNCATION_TOLERANCE_IN_PIXELS = 2;
        const SETTLE_IN_MILLISECONDS = 300;

        const file = app.vault.getFileByPath('full-key.md');
        if (!file) {
          throw new Error('full-key.md not found');
        }
        await app.workspace.getLeaf(true).openFile(file);
        await sleep(SETTLE_IN_MILLISECONDS);

        const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
        const containerEl = view?.contentEl ?? activeDocument.body;

        // Expand the root nested property only if it is currently collapsed. The renderer remembers
        // Expanded paths across the shared Obsidian instance, so a blind toggle could collapse a
        // Property a previous test already expanded.
        const collapsible = containerEl.querySelector('.nested-properties-collapsible');
        if (collapsible instanceof HTMLElement && collapsible.hasClass('is-collapsed')) {
          const collapseBtn = collapsible.querySelector('.nested-properties-collapse-btn');
          if (collapseBtn instanceof HTMLElement) {
            collapseBtn.click();
          }
        }
        await sleep(SETTLE_IN_MILLISECONDS);

        const headerButton = containerEl.querySelector('.nested-properties-full-key-toggle');
        if (!(headerButton instanceof HTMLElement)) {
          throw new Error('full key toggle button not found');
        }

        function isTruncated(): boolean {
          const keyInput = containerEl.querySelector('.nested-properties-container .metadata-property-key-input');
          if (!(keyInput instanceof HTMLInputElement)) {
            throw new Error('nested key input not found');
          }
          return keyInput.scrollWidth > keyInput.clientWidth + TRUNCATION_TOLERANCE_IN_PIXELS;
        }

        const hasIcon = headerButton.querySelector('svg') !== null;
        const truncatedBefore = isTruncated();
        headerButton.click();
        await sleep(SETTLE_IN_MILLISECONDS);
        const truncatedAfterFirstClick = isTruncated();
        headerButton.click();
        await sleep(SETTLE_IN_MILLISECONDS);
        const truncatedAfterSecondClick = isTruncated();

        return {
          hasIcon,
          truncatedAfterFirstClick,
          truncatedAfterSecondClick,
          truncatedBefore
        };
      },
      vaultPath: vault.path
    });

    expect(result.hasIcon).toBe(true);
    expect(result.truncatedAfterFirstClick).toBe(!result.truncatedBefore);
    expect(result.truncatedAfterSecondClick).toBe(result.truncatedBefore);
  });

  it('persists full key display across a plugin reload', async () => {
    const result = await evalInObsidian({
      fn: async ({ app }) => {
        const SETTLE_IN_MILLISECONDS = 300;
        const PLUGIN_ID = 'nested-properties';
        const FULL_KEY_CLASS = 'nested-properties-full-key-display';
        const TOGGLE_COMMAND_ID = 'nested-properties:toggle-full-key-display';

        const file = app.vault.getFileByPath('full-key.md');
        if (!file) {
          throw new Error('full-key.md not found');
        }
        await app.workspace.getLeaf(true).openFile(file);
        await sleep(SETTLE_IN_MILLISECONDS);

        // Normalize to the disabled state so the assertions do not depend on earlier tests.
        if (activeDocument.body.hasClass(FULL_KEY_CLASS)) {
          app.commands.executeCommandById(TOGGLE_COMMAND_ID);
          await sleep(SETTLE_IN_MILLISECONDS);
        }

        app.commands.executeCommandById(TOGGLE_COMMAND_ID);
        await sleep(SETTLE_IN_MILLISECONDS);
        const classAfterToggle = activeDocument.body.hasClass(FULL_KEY_CLASS);

        await app.plugins.disablePlugin(PLUGIN_ID);
        await sleep(SETTLE_IN_MILLISECONDS);
        const classAfterDisable = activeDocument.body.hasClass(FULL_KEY_CLASS);

        await app.plugins.enablePlugin(PLUGIN_ID);
        await sleep(SETTLE_IN_MILLISECONDS);
        const classAfterReenable = activeDocument.body.hasClass(FULL_KEY_CLASS);

        // Reset to the disabled state so other tests start clean.
        app.commands.executeCommandById(TOGGLE_COMMAND_ID);
        await sleep(SETTLE_IN_MILLISECONDS);

        return {
          classAfterDisable,
          classAfterReenable,
          classAfterToggle
        };
      },
      vaultPath: vault.path
    });

    expect(result.classAfterToggle).toBe(true);
    expect(result.classAfterDisable).toBe(false);
    expect(result.classAfterReenable).toBe(true);
  });
});
