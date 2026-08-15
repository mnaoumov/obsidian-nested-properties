/**
 * @file
 *
 * Produces the five mobile screenshots the community-store listing needs
 * (T461-P21), driving staged notes in Obsidian Mobile on a real Android
 * emulator and writing `images/screenshots/screenshot-mobile-N.png`.
 *
 * The mobile counterpart of the desktop capture suite. The first four frames
 * tell the same story, because that story is the plugin. The fifth differs on
 * purpose, in both directions:
 *
 * - The desktop set ends on the vault-wide rename picker, which is an Obsidian
 *   suggester. A phone suggester renders full height and expects the on-screen
 *   keyboard to have focused it, so driven from a script it is a full-height
 *   empty list, which no shot can rescue.
 * - Full key display goes the other way. On a 1200px-wide desktop frame the
 *   keys have room and the toggle changes nothing you can see; on a 450dp phone
 *   they truncate, which is the very problem the feature exists for. So the
 *   feature that could not earn a desktop slot earns the mobile one.
 *
 * There is no mobile equivalent of the desktop viewport override, so the capture
 * is always the device's own framebuffer. The fix is to make the DEVICE the
 * right size: this runs on a dedicated `obsidian_screenshots` AVD built at
 * exactly 900x1600 — see [[T461-P21]] for its one-time provisioning.
 */

import {
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import {
  captureObsidianScreenshot,
  evalInObsidian,
  labelScreenshot,
  readPngDimensions
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

/**
 * `App`, reduced to the font-size applier that `obsidian-typings` does not
 * declare. Setting `baseFontSize` alone changes nothing on screen.
 */
interface FontSizeApp {
  updateFontSize(this: void): void;
}

/**
 * `App`, reduced to the inline-title applier, likewise undeclared.
 */
interface InlineTitleApp {
  updateInlineTitleDisplay(this: void): void;
}

const PLUGIN_ID = 'nested-properties';
const WIDTH_IN_PIXELS = 900;
const HEIGHT_IN_PIXELS = 1600;

/**
 * The staged note with a nested OBJECT — the shape the panel handles worst
 * without this plugin.
 */
const OBJECT_NOTE_PATH = 'Screenshots/Project.md';

/**
 * The staged note with nested ARRAYS, including an array of objects.
 */
const ARRAY_NOTE_PATH = 'Screenshots/Team.md';

/**
 * The staged note whose keys are long enough to truncate on a phone.
 */
const LONG_KEY_NOTE_PATH = 'Screenshots/Deployment.md';

/**
 * Base font size for the mobile shots.
 *
 * Below Obsidian's own 16px default: the screenshot AVD is a 450x800 dp screen,
 * and the properties tree indents every level, so at 16 the third level's values
 * are pushed off the right edge.
 */
const MOBILE_FONT_SIZE_IN_PIXELS = 13;

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

/**
 * Diagnostics from the setup closure, surfaced by the first test so a failed
 * mobile layout is readable instead of silent.
 */
let setupDiagnostics: unknown;

beforeAll(async () => {
  const vault = getTemporaryVault();

  vault.populate({
    [ARRAY_NOTE_PATH]: buildArrayNote(),
    [LONG_KEY_NOTE_PATH]: buildLongKeyNote(),
    [OBJECT_NOTE_PATH]: buildObjectNote()
  });
  await vault.syncToDevice();

  setupDiagnostics = await evalInObsidian({
    async callback({ app, fontSizeInPixels, lib: { waitUntil }, objectNotePath }) {
      // A closure runs inside ONE Appium `execute/sync` call, which WebDriver
      // Caps around 30s. A longer wait in here dies as an opaque `script
      // Timeout` rather than a readable failure, so keep every wait under it.
      const SETTLE_TIMEOUT_IN_MILLISECONDS = 20_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;

      app.changeTheme('obsidian');

      await waitUntil({
        message: 'the staged notes to appear in the vault',
        predicate: () => Boolean(app.vault.getFileByPath(objectNotePath)),
        timeoutInMilliseconds: SETTLE_TIMEOUT_IN_MILLISECONDS
      });

      // The panel IS the subject, so it has to be in the document rather than
      // Tucked behind a drawer.
      app.vault.setConfig('propertiesInDocument', 'visible');

      app.vault.setConfig('baseFontSize', fontSizeInPixels);
      const fontApp: unknown = app;
      (fontApp as FontSizeApp).updateFontSize();

      // Each note opens with its own `# H1`, so the inline title doubles it.
      app.vault.setConfig('showInlineTitle', false);
      (fontApp as InlineTitleApp).updateInlineTitleDisplay();

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      return { isNoteStaged: Boolean(app.vault.getFileByPath(objectNotePath)) };
    },
    input: { fontSizeInPixels: MOBILE_FONT_SIZE_IN_PIXELS, objectNotePath: OBJECT_NOTE_PATH },
    vaultPath: vaultPath()
  });
});

describe('mobile store screenshots', () => {
  it('stages the notes the shots are framed on', () => {
    // Surfaced as an assertion because vitest swallows console output from an
    // Integration worker, and a silently-wrong layout produces five bad images
    // Without a single failure.
    expect(setupDiagnostics).toMatchObject({ isNoteStaged: true });
  });

  it('1 - the same note with the plugin off', async () => {
    await setPluginEnabled(false);
    await openNote(OBJECT_NOTE_PATH);
    await shoot(1, 'Without the plugin: nested values have nowhere to go');
    await setPluginEnabled(true);
  });

  it('2 - the same note, nested objects as a tree', async () => {
    await openNote(OBJECT_NOTE_PATH);
    await shoot(2, 'With it: every nested key on its own row');
  });

  it('3 - arrays and arrays of objects', async () => {
    await openNote(ARRAY_NOTE_PATH);
    await shoot(3, 'Arrays nest too, including arrays of objects');
  });

  it('4 - the long-press menu on a nested key', async () => {
    await openNote(OBJECT_NOTE_PATH);
    await openKeyContextMenu('geo');
    await shoot(4, 'Cut, copy, paste or remove any node');
  });

  it('5 - long keys shown in full', async () => {
    await dismissMenu();
    await runCommand('toggle-full-key-display');
    await openNote(LONG_KEY_NOTE_PATH);
    await shoot(5, 'Show long keys in full instead of truncated');
    await runCommand('toggle-full-key-display');
  });
});

/**
 * Builds the staged note with nested arrays.
 *
 * @returns The note's Markdown.
 */
function buildArrayNote(): string {
  return '---\n'
    + 'members:\n'
    + '  - name: Ada Lovelace\n'
    + '    role: Lead\n'
    + '  - name: Grace Hopper\n'
    + '    role: Compilers\n'
    + 'tags:\n'
    + '  - alpha\n'
    + '  - beta\n'
    + '---\n'
    + '# Team\n';
}

/**
 * Builds the staged note whose keys are long enough that a phone truncates them.
 *
 * @returns The note's Markdown.
 */
function buildLongKeyNote(): string {
  return '---\n'
    + 'deployment:\n'
    + '  continuousIntegrationPipelineName: nightly\n'
    + '  maximumConcurrentDeployments: 3\n'
    + '  rollbackWindowInMinutes: 30\n'
    + '---\n'
    + '# Deployment\n';
}

/**
 * Builds the staged note with a nested object.
 *
 * @returns The note's Markdown.
 */
function buildObjectNote(): string {
  return '---\n'
    + 'status: active\n'
    + 'owner:\n'
    + '  name: Ada Lovelace\n'
    + '  email: ada@example.com\n'
    + 'address:\n'
    + '  street: 123 Main St\n'
    + '  city: Metropolis\n'
    + '  geo:\n'
    + '    latitude: 40.7128\n'
    + '    longitude: -74.006\n'
    + '---\n'
    + '# Project\n';
}

/**
 * Closes the menu left open by the previous shot, so the next one does not
 * photograph it sitting underneath its own subject.
 */
async function dismissMenu(): Promise<void> {
  await evalInObsidian({
    async callback({ lib: { waitUntil } }) {
      const MENU_TIMEOUT_IN_MILLISECONDS = 15_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 600;

      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
      document.body.click();

      await waitUntil({
        message: 'the menu to close',
        predicate: () => !document.body.querySelector('.menu'),
        timeoutInMilliseconds: MENU_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    vaultPath: vaultPath()
  });
}

/**
 * Right-clicks a nested key, which is what a long press raises on a phone.
 *
 * @param keyName - The nested key to press, e.g. `geo`.
 */
async function openKeyContextMenu(keyName: string): Promise<void> {
  await evalInObsidian({
    async callback({ keyName: name, lib: { waitUntil } }) {
      const MENU_TIMEOUT_IN_MILLISECONDS = 15_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 900;
      const HALF = 2;

      const keyInput = [...document.querySelectorAll('.metadata-property-key-input')]
        .find((input) => (input.instanceOf(HTMLInputElement) ? input.value : input.textContent) === name);
      const keyEl = keyInput?.closest('.metadata-property-key');
      if (!(keyEl instanceof HTMLElement)) {
        throw new TypeError(`No nested key on screen named ${name}`);
      }

      // Obsidian raises the menu from a `contextmenu` event, which is what a long
      // Press produces on a touch screen. The coordinates are where it anchors.
      const rect = keyEl.getBoundingClientRect();
      keyEl.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / HALF,
          clientY: rect.top + rect.height / HALF
        })
      );

      await waitUntil({
        message: 'the nested-key menu to open',
        predicate: () => Boolean(document.body.querySelector('.menu')),
        timeoutInMilliseconds: MENU_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { keyName },
    vaultPath: vaultPath()
  });
}

/**
 * Opens a staged note, waits for its properties panel, and expands the tree.
 *
 * @param path - Vault-relative path of the note.
 */
async function openNote(path: string): Promise<void> {
  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, path: notePath }) {
      const RENDER_TIMEOUT_IN_MILLISECONDS = 15_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1200;

      const file = app.vault.getFileByPath(notePath);
      if (!file) {
        throw new Error(`Note is missing from the vault: ${notePath}`);
      }

      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(file);

      await waitUntil({
        message: 'the properties panel to render',
        predicate: () => Boolean(document.querySelector('.metadata-property')),
        timeoutInMilliseconds: RENDER_TIMEOUT_IN_MILLISECONDS
      });

      // The tree renders COLLAPSED, so a shot taken here shows `owner { ... }`
      // And nothing underneath — barely different from the plugin-off frame it
      // Is supposed to contrast with. Expanding takes several passes: opening a
      // Node is what renders its children, and they arrive collapsed in turn.
      const EXPAND_PASS_COUNT = 6;
      const EXPAND_PASS_DELAY_IN_MILLISECONDS = 300;
      for (let pass = 0; pass < EXPAND_PASS_COUNT; pass++) {
        const collapsed = document.querySelectorAll('.nested-properties-collapsible.is-collapsed');
        if (collapsed.length === 0) {
          break;
        }
        for (const row of collapsed) {
          const collapseButton = row.querySelector('.nested-properties-collapse-btn');
          if (collapseButton instanceof HTMLElement) {
            collapseButton.click();
          }
        }
        await sleep(EXPAND_PASS_DELAY_IN_MILLISECONDS);
      }

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { path },
    vaultPath: vaultPath()
  });
}

/**
 * Runs one of the plugin's commands.
 *
 * @param commandId - The plugin-relative command id.
 */
async function runCommand(commandId: string): Promise<void> {
  await evalInObsidian({
    async callback({ app, command, pluginId }) {
      const SETTLE_DELAY_IN_MILLISECONDS = 1200;

      const wasExecuted = app.commands.executeCommandById(`${pluginId}:${command}`);
      if (!wasExecuted) {
        throw new Error(`Command did not run: ${command}`);
      }

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { command: commandId, pluginId: PLUGIN_ID },
    vaultPath: vaultPath()
  });
}

/**
 * Enables or disables the plugin, for the one shot that shows the state its
 * absence leaves behind.
 *
 * @param isEnabled - Whether the plugin should be on.
 */
async function setPluginEnabled(isEnabled: boolean): Promise<void> {
  await evalInObsidian({
    async callback({ app, isEnabled: shouldEnable, pluginId }) {
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;

      if (shouldEnable) {
        await app.plugins.enablePlugin(pluginId);
      } else {
        await app.plugins.disablePlugin(pluginId);
      }

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { isEnabled, pluginId: PLUGIN_ID },
    vaultPath: vaultPath()
  });
}

/**
 * Captures the device screen, captions it, and writes it as
 * `images/screenshots/screenshot-mobile-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const captured = await captureObsidianScreenshot({ vaultPath: vaultPath() });

  // The AVD is 900x1600, so the device frame IS the store's size. Asserting it
  // Here is what keeps that true: run this against any other AVD and it fails
  // Loudly instead of quietly shipping an off-spec image.
  expect(readPngDimensions(captured)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  // Captioned AFTER capture, so the frame stays an untouched device screenshot
  // And rewording a label needs no re-shoot.
  const labeled = await labelScreenshot(captured, { text: caption });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-mobile-${String(index)}.png`), labeled);
}

function vaultPath(): string {
  return getTemporaryVault().path;
}
