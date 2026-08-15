/**
 * @file
 *
 * Produces the desktop screenshots the community-store listing needs
 * (T461-P21), driving staged notes in a real Obsidian and writing
 * `images/screenshots/screenshot-desktop-N.png`.
 *
 * Each shot shows a DIFFERENT capability, and each is CAPTIONED by
 * `labelScreenshot` after capture — a listing carousel shows screenshots one at
 * a time with no caption of its own, so an image has to say what it is showing.
 *
 * Shot 1 is the plugin turned OFF, because this plugin's value is only legible
 * against what Obsidian does on its own: give a note nested frontmatter and the
 * Properties panel shows a row per top-level key and nothing underneath it. The
 * shots that follow are the same note with the plugin on, which is the whole
 * pitch in two frames.
 *
 * The notes are staged rather than taken from the demo vault: the vault's own
 * notes embed screenshots of this very panel, and a screenshot containing a
 * screenshot of itself is not a listing image.
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
 * `App`, reduced to the inline-title toggle that `obsidian-typings` does not
 * declare. Setting the config alone changes nothing on screen.
 */
interface InlineTitleApp {
  updateInlineTitleDisplay(this: void): void;
}

/**
 * The desktop side dock, reduced to the resize call.
 */
interface ResizableSideDock {
  setSize(this: void, size: number): void;
}

const PLUGIN_ID = 'nested-properties';
const WIDTH_IN_PIXELS = 1200;
const HEIGHT_IN_PIXELS = 800;

/**
 * The staged note with a nested OBJECT — the shape the panel handles worst
 * without this plugin.
 */
const OBJECT_NOTE_PATH = 'Screenshots/Project.md';

/**
 * The staged note with nested ARRAYS, including an array of objects.
 */
const ARRAY_NOTE_PATH = 'Screenshots/Team.md';

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

beforeAll(async () => {
  const vault = getTemporaryVault();

  vault.populate({
    [ARRAY_NOTE_PATH]: buildArrayNote(),
    [OBJECT_NOTE_PATH]: buildObjectNote()
  });
  await vault.syncToDevice();

  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, objectNotePath }) {
      const SETTLE_TIMEOUT_IN_MILLISECONDS = 30_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1000;

      app.changeTheme('obsidian');

      await waitUntil({
        message: 'the staged notes to appear in the vault',
        predicate: () => Boolean(app.vault.getFileByPath(objectNotePath)),
        timeoutInMilliseconds: SETTLE_TIMEOUT_IN_MILLISECONDS
      });

      // The properties panel is the subject; the file explorer and an empty
      // Right dock would otherwise take a third of a 1200x800 frame.
      app.workspace.leftSplit.collapse();
      const rightSplit: unknown = app.workspace.rightSplit;
      (rightSplit as ResizableSideDock).setSize(0);
      app.workspace.rightSplit.collapse();

      // The panel IS the subject, so it has to be in the document rather than
      // Tucked into a side pane.
      app.vault.setConfig('propertiesInDocument', 'visible');

      // Each note opens with its own `# H1`, so the inline title doubles it.
      app.vault.setConfig('showInlineTitle', false);
      const inlineTitleApp: unknown = app;
      (inlineTitleApp as InlineTitleApp).updateInlineTitleDisplay();

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { objectNotePath: OBJECT_NOTE_PATH },
    vaultPath: vaultPath()
  });
});

describe('desktop store screenshots', () => {
  it('1 - the same note with the plugin off', async () => {
    // A before-shot is only safe BECAUSE of the caption. A listing carousel
    // Shows screenshots one at a time, so an unlabelled one reads as a picture
    // Of what the plugin does, not of what it fixes.
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

  it('4 - the context menu on a nested key', async () => {
    // NOT the full-key-display toggle, which was the first pick: that feature is
    // About long keys being truncated, and against short keys it changes nothing
    // On screen — the frame came out identical to shot 2 but for a highlighted
    // Toolbar icon, which is not a capability a reader can see.
    await openNote(OBJECT_NOTE_PATH);
    await openKeyContextMenu('geo');
    await shoot(4, 'Cut, copy, paste or remove any node');
  });

  it('5 - renaming a nested key across the vault', async () => {
    await dismissMenu();
    await openNote(OBJECT_NOTE_PATH);
    await openVaultRenamePicker();
    await shoot(5, 'Rename a nested key in every note at once');
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
 * Builds the staged note with a nested object.
 *
 * Three levels deep, because two looks like a coincidence and the panel's
 * failure to show anything useful is what shot 1 is about.
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
 * Right-clicks a nested key, which is what raises the plugin's per-node menu.
 *
 * @param keyName - The nested key to right-click, e.g. `geo`.
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

      // Obsidian raises the menu from a `contextmenu` event, and the coordinates
      // Are where it anchors the menu — dispatched without them it lands in the
      // Top-left corner, over the properties it is supposed to sit beside.
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
        message: 'the nested-key context menu to open',
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
 * Opens a staged note and waits for its properties panel to render.
 *
 * @param path - Vault-relative path of the note.
 */
async function openNote(path: string): Promise<void> {
  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, path: notePath }) {
      const RENDER_TIMEOUT_IN_MILLISECONDS = 20_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1200;
      const RESIZE_SETTLE_DELAY_IN_MILLISECONDS = 2000;

      // Let the previous shot's capture settle. `captureObsidianScreenshot`
      // Overrides the device metrics and clears them again, and the re-layout
      // That lands afterwards disturbs anything opened too soon after it.
      await sleep(RESIZE_SETTLE_DELAY_IN_MILLISECONDS);

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
      // And nothing underneath — which is barely different from the
      // Plugin-off frame it is supposed to contrast with. Expanding takes
      // Several passes: opening a node is what renders its children, and they
      // Arrive collapsed in their turn.
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
 * Opens the vault-wide rename flow far enough to show its picker: the list of
 * every nested key path the vault contains.
 */
async function openVaultRenamePicker(): Promise<void> {
  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, pluginId }) {
      const PICKER_TIMEOUT_IN_MILLISECONDS = 15_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 900;

      // Deliberately NOT awaited: the flow resolves only once the picker is
      // Answered, so awaiting here would hang the whole closure.
      app.commands.executeCommandById(`${pluginId}:rename-nested-property-across-vault`);

      await waitUntil({
        message: 'the nested-key picker to appear',
        predicate: () => Boolean(document.querySelector('.modal-container .prompt, .modal-container .modal')),
        timeoutInMilliseconds: PICKER_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { pluginId: PLUGIN_ID },
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
 * Captures the window, captions it, and writes it as
 * `images/screenshots/screenshot-desktop-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const bytes = await captureObsidianScreenshot({
    heightInPixels: HEIGHT_IN_PIXELS,
    vaultPath: vaultPath(),
    widthInPixels: WIDTH_IN_PIXELS
  });

  const labeled = await labelScreenshot(bytes, { text: caption });

  expect(readPngDimensions(labeled)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-desktop-${String(index)}.png`), labeled);
}

function vaultPath(): string {
  return getTemporaryVault().path;
}
