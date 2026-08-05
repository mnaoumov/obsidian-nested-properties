/**
 * @file
 *
 * Shared integration suite that exercises the vault-wide nested-property RENAME and DELETE commands
 * (issue #6) end-to-end against a real Obsidian. Obsidian's built-in "All properties" view exposes only
 * top-level names, so `NestedPropertyVaultOpsComponent` surfaces nested paths through commands gated
 * behind the shared `selectItem` picker plus a `prompt` (rename) / `confirm` (delete) modal.
 *
 * The flow driven here is exactly the one a user drives: run the command, pick the nested path from the
 * real fuzzy picker DOM, then answer the real prompt/confirm modal DOM. The assertion is the observable
 * effect — the nested key is renamed across every note (via `processFrontMatter`) or removed from them.
 *
 * The suite is written platform-parameterized per G47 (`register…Suite(platform)`), imported by the thin
 * entry point `nested-property-vault-ops.desktop.integration.test.ts`. It is registered on Desktop only,
 * matching this plugin's other behavioral integration tests (full-key-display, nested-property-renderer,
 * value-utils are all desktop-only). Android registration is DEFERRED because no Android emulator /
 * Appium server is provisioned in the current environment, so an `…android.integration.test.ts` entry
 * could not be verified green (G97's "record the specific reason" escape hatch). Because the body is
 * platform-agnostic (nested frontmatter + shared modals render identically on mobile), enabling Android
 * later is a one-line `registerNestedPropertyVaultOpsSuite('Android')` from an android entry point once
 * the emulator is available. The `*-shared.integration.test.ts` name keeps it out of unit collection +
 * coverage while matching no `*.desktop`/`*.android` project glob, so it runs only when imported.
 */

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

/**
 * Registers the vault-wide rename/delete integration tests for the given platform.
 *
 * @param platform - Human-readable platform label used in the test name (e.g. `'Desktop'`).
 */
export function registerNestedPropertyVaultOpsSuite(platform: string): void {
  describe(`Nested property vault-wide operations (${platform})`, () => {
    it('renames a nested property across every note that has it', async () => {
      const result = await evalInObsidian({
        // eslint-disable-next-line unicorn/name-replacements -- `fn` is an `obsidian-integration-testing` parameter name.
        async fn({ app, lib: { waitUntil } }) {
          const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;
          const FOLDER = 'np-vault-ops-rename';
          const FROM_PATH = 'npVaultOpsRename.owner';
          const TO_PATH = 'npVaultOpsRename.maintainer';
          const FILE_A = `${FOLDER}/a.md`;
          const FILE_B = `${FOLDER}/b.md`;
          const RENAME_COMMAND_ID = 'nested-properties:rename-nested-property-across-vault';

          async function cleanup(): Promise<void> {
            for (const el of activeDocument.querySelectorAll<HTMLElement>(':scope .modal-container .modal-close-button')) {
              el.click();
            }
            for (const path of [FILE_A, FILE_B, FOLDER]) {
              const existing = app.vault.getAbstractFileByPath(path);
              if (existing) {
                await app.fileManager.trashFile(existing);
              }
            }
          }

          await cleanup();
          await app.vault.createFolder(FOLDER);
          const fileA = await app.vault.create(FILE_A, '---\nnpVaultOpsRename:\n  owner: alice\n---\n');
          const fileB = await app.vault.create(FILE_B, '---\nnpVaultOpsRename:\n  owner: bob\n---\n');

          try {
            // Both notes must be parsed into the metadata cache before the command scans them.
            await waitUntil({
              message: 'seeded frontmatter did not reach the metadata cache',
              predicate: () =>
                Boolean(app.metadataCache.getFileCache(fileA)?.frontmatter?.['npVaultOpsRename'])
                && Boolean(app.metadataCache.getFileCache(fileB)?.frontmatter?.['npVaultOpsRename']),
              timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
            });

            app.commands.executeCommandById(RENAME_COMMAND_ID);

            // Step 1: the fuzzy picker of nested paths. Filter to our unique path, then click it.
            await waitUntil({
              message: 'nested property picker did not open',
              predicate: () => activeDocument.querySelector(':scope .select-item-modal .prompt-input') !== null,
              timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
            });
            const pickerInput = activeDocument.querySelector(':scope .select-item-modal .prompt-input');
            if (!(pickerInput instanceof HTMLInputElement)) {
              throw new TypeError('picker input not found');
            }
            pickerInput.value = FROM_PATH;
            pickerInput.dispatchEvent(new Event('input'));
            await waitUntil({
              message: 'nested path suggestion did not appear',
              predicate: () =>
                [...activeDocument.querySelectorAll(':scope .select-item-modal .suggestion-item')]
                  .some((el) => el.textContent.includes(FROM_PATH)),
              timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
            });
            const suggestion = [...activeDocument.querySelectorAll<HTMLElement>(':scope .select-item-modal .suggestion-item')]
              .find((el) => el.textContent.includes(FROM_PATH));
            if (!suggestion) {
              throw new Error('nested path suggestion not found');
            }
            suggestion.click();

            // Step 2: the rename prompt (pre-filled with the current path). Type the new path + confirm.
            await waitUntil({
              message: 'rename prompt did not open',
              predicate: () => activeDocument.querySelector(':scope .prompt-modal .text-box') !== null,
              timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
            });
            const promptInput = activeDocument.querySelector(':scope .prompt-modal .text-box');
            if (!(promptInput instanceof HTMLInputElement)) {
              throw new TypeError('rename prompt input not found');
            }
            promptInput.value = TO_PATH;
            promptInput.dispatchEvent(new Event('input'));
            const okButton = activeDocument.querySelector(':scope .prompt-modal .ok-button');
            if (!(okButton instanceof HTMLElement)) {
              throw new TypeError('rename prompt OK button not found');
            }
            okButton.click();

            // Step 3: the observable effect — both notes now carry the renamed leaf key.
            await waitUntil({
              message: 'nested property was not renamed across both notes',
              predicate: async () => {
                const contentA = await app.vault.read(fileA);
                const contentB = await app.vault.read(fileB);
                return contentA.includes('maintainer: alice') && !contentA.includes('owner:')
                  && contentB.includes('maintainer: bob') && !contentB.includes('owner:');
              },
              timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
            });

            return {
              contentA: await app.vault.read(fileA),
              contentB: await app.vault.read(fileB)
            };
          } finally {
            await cleanup();
          }
        },
        vaultPath: getTempVault().path
      });

      expect(result.contentA).toContain('maintainer: alice');
      expect(result.contentA).not.toContain('owner:');
      expect(result.contentB).toContain('maintainer: bob');
      expect(result.contentB).not.toContain('owner:');
    });

    it('deletes a nested property from every note that has it', async () => {
      const result = await evalInObsidian({
        // eslint-disable-next-line unicorn/name-replacements -- `fn` is an `obsidian-integration-testing` parameter name.
        async fn({ app, lib: { waitUntil } }) {
          const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;
          const FOLDER = 'np-vault-ops-delete';
          const PATH = 'npVaultOpsDelete.channel';
          const FILE_A = `${FOLDER}/a.md`;
          const FILE_B = `${FOLDER}/b.md`;
          const DELETE_COMMAND_ID = 'nested-properties:delete-nested-property-across-vault';

          async function cleanup(): Promise<void> {
            for (const el of activeDocument.querySelectorAll<HTMLElement>(':scope .modal-container .modal-close-button')) {
              el.click();
            }
            for (const path of [FILE_A, FILE_B, FOLDER]) {
              const existing = app.vault.getAbstractFileByPath(path);
              if (existing) {
                await app.fileManager.trashFile(existing);
              }
            }
          }

          await cleanup();
          await app.vault.createFolder(FOLDER);
          const fileA = await app.vault.create(FILE_A, '---\nnpVaultOpsDelete:\n  channel: beta\n  keep: yes\n---\n');
          const fileB = await app.vault.create(FILE_B, '---\nnpVaultOpsDelete:\n  channel: alpha\n  keep: yes\n---\n');

          try {
            await waitUntil({
              message: 'seeded frontmatter did not reach the metadata cache',
              predicate: () =>
                Boolean(app.metadataCache.getFileCache(fileA)?.frontmatter?.['npVaultOpsDelete'])
                && Boolean(app.metadataCache.getFileCache(fileB)?.frontmatter?.['npVaultOpsDelete']),
              timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
            });

            app.commands.executeCommandById(DELETE_COMMAND_ID);

            // Step 1: the fuzzy picker of nested paths.
            await waitUntil({
              message: 'nested property picker did not open',
              predicate: () => activeDocument.querySelector(':scope .select-item-modal .prompt-input') !== null,
              timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
            });
            const pickerInput = activeDocument.querySelector(':scope .select-item-modal .prompt-input');
            if (!(pickerInput instanceof HTMLInputElement)) {
              throw new TypeError('picker input not found');
            }
            pickerInput.value = PATH;
            pickerInput.dispatchEvent(new Event('input'));
            await waitUntil({
              message: 'nested path suggestion did not appear',
              predicate: () =>
                [...activeDocument.querySelectorAll(':scope .select-item-modal .suggestion-item')]
                  .some((el) => el.textContent.includes(PATH)),
              timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
            });
            const suggestion = [...activeDocument.querySelectorAll<HTMLElement>(':scope .select-item-modal .suggestion-item')]
              .find((el) => el.textContent.includes(PATH));
            if (!suggestion) {
              throw new Error('nested path suggestion not found');
            }
            suggestion.click();

            // Step 2: the delete confirmation.
            await waitUntil({
              message: 'delete confirmation did not open',
              predicate: () => activeDocument.querySelector(':scope .confirm-modal .ok-button') !== null,
              timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
            });
            const okButton = activeDocument.querySelector(':scope .confirm-modal .ok-button');
            if (!(okButton instanceof HTMLElement)) {
              throw new TypeError('confirm OK button not found');
            }
            okButton.click();

            // Step 3: the observable effect — the leaf key is gone from both notes, siblings preserved.
            await waitUntil({
              message: 'nested property was not deleted across both notes',
              predicate: async () => {
                const contentA = await app.vault.read(fileA);
                const contentB = await app.vault.read(fileB);
                return !contentA.includes('channel:') && contentA.includes('keep: yes')
                  && !contentB.includes('channel:') && contentB.includes('keep: yes');
              },
              timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
            });

            return {
              contentA: await app.vault.read(fileA),
              contentB: await app.vault.read(fileB)
            };
          } finally {
            await cleanup();
          }
        },
        vaultPath: getTempVault().path
      });

      expect(result.contentA).not.toContain('channel:');
      expect(result.contentA).toContain('keep: yes');
      expect(result.contentB).not.toContain('channel:');
      expect(result.contentB).toContain('keep: yes');
    });
  });
}
