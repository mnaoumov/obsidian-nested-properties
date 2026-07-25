/**
 * @file
 *
 * Shared integration suite that exercises the "Find notes by nested property" command (issue #1)
 * end-to-end against a real Obsidian. Obsidian's native search only understands top-level property
 * operators, so `NestedPropertySearchComponent` prompts for a nested-property query, matches it across
 * every note's frontmatter, then opens the chosen match via a `selectItem` picker.
 *
 * The flow driven here is exactly the one a user drives: run the command, type the nested query into the
 * real prompt DOM, then pick the matching note from the real fuzzy picker DOM. The assertion is the
 * observable effect — the correct matching note is opened (and the non-matching note is not offered).
 *
 * The suite is written platform-parameterized per G47 (`register…Suite(platform)`), imported by the thin
 * entry point `nested-property-search.desktop.integration.test.ts`. It is registered on Desktop only,
 * matching this plugin's other behavioral integration tests (full-key-display, nested-property-renderer,
 * value-utils are all desktop-only). Android registration is DEFERRED because no Android emulator /
 * Appium server is provisioned in the current environment, so an `…android.integration.test.ts` entry
 * could not be verified green (G97's "record the specific reason" escape hatch). Because the body is
 * platform-agnostic (nested frontmatter + shared modals render identically on mobile), enabling Android
 * later is a one-line `registerNestedPropertySearchSuite('Android')` from an android entry point once
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
 * Registers the nested-property search integration test for the given platform.
 *
 * @param platform - Human-readable platform label used in the test name (e.g. `'Desktop'`).
 */
export function registerNestedPropertySearchSuite(platform: string): void {
  describe(`Find notes by nested property (${platform})`, () => {
    it('opens the note whose nested list value matches the query', async () => {
      const result = await evalInObsidian({
        async fn({ app, lib: { waitUntil } }) {
          const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;
          const FOLDER = 'np-search';
          const MATCH_PATH = `${FOLDER}/match.md`;
          const OTHER_PATH = `${FOLDER}/other.md`;
          const QUERY = 'npSearch.genres: fantasy';
          const SEARCH_COMMAND_ID = 'nested-properties:find-notes-by-nested-property';

          async function cleanup(): Promise<void> {
            for (const el of Array.from(activeDocument.querySelectorAll<HTMLElement>('.modal-container .modal-close-button'))) {
              el.click();
            }
            for (const path of [MATCH_PATH, OTHER_PATH, FOLDER]) {
              const existing = app.vault.getAbstractFileByPath(path);
              if (existing) {
                await app.fileManager.trashFile(existing);
              }
            }
          }

          await cleanup();
          await app.vault.createFolder(FOLDER);
          const matchFile = await app.vault.create(MATCH_PATH, '---\nnpSearch:\n  genres:\n    - fantasy\n    - sci-fi\n---\n');
          const otherFile = await app.vault.create(OTHER_PATH, '---\nnpSearch:\n  genres:\n    - mystery\n---\n');

          // Focus an unrelated leaf first so opening the match is an observable change of the active file.
          await app.workspace.getLeaf(true).openFile(otherFile);
          await waitUntil({
            message: 'the non-matching note did not become active',
            predicate: () => app.workspace.getActiveFile()?.path === OTHER_PATH,
            timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
          });

          try {
            await waitUntil({
              message: 'seeded frontmatter did not reach the metadata cache',
              predicate: () =>
                Boolean(app.metadataCache.getFileCache(matchFile)?.frontmatter?.['npSearch'])
                && Boolean(app.metadataCache.getFileCache(otherFile)?.frontmatter?.['npSearch']),
              timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
            });

            app.commands.executeCommandById(SEARCH_COMMAND_ID);

            // Step 1: the query prompt. Type the nested query + confirm.
            await waitUntil({
              message: 'query prompt did not open',
              predicate: () => activeDocument.querySelector('.prompt-modal .text-box') !== null,
              timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
            });
            const promptInput = activeDocument.querySelector('.prompt-modal .text-box');
            if (!(promptInput instanceof HTMLInputElement)) {
              throw new Error('query prompt input not found');
            }
            promptInput.value = QUERY;
            promptInput.dispatchEvent(new Event('input'));
            const okButton = activeDocument.querySelector('.prompt-modal .ok-button');
            if (!(okButton instanceof HTMLElement)) {
              throw new Error('query prompt OK button not found');
            }
            okButton.click();

            // Step 2: the picker of matching notes. Only the matching note is offered; pick it.
            await waitUntil({
              message: 'matching-note picker did not open',
              predicate: () =>
                Array.from(activeDocument.querySelectorAll('.select-item-modal .suggestion-item'))
                  .some((el) => el.textContent.includes(MATCH_PATH)),
              timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
            });
            const suggestions = Array.from(activeDocument.querySelectorAll<HTMLElement>('.select-item-modal .suggestion-item'));
            const offersOther = suggestions.some((el) => el.textContent.includes(OTHER_PATH));
            const suggestion = suggestions.find((el) => el.textContent.includes(MATCH_PATH));
            if (!suggestion) {
              throw new Error('matching-note suggestion not found');
            }
            suggestion.click();

            // Step 3: the observable effect — the matching note is opened as the active file.
            await waitUntil({
              message: 'the matching note was not opened',
              predicate: () => app.workspace.getActiveFile()?.path === MATCH_PATH,
              timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
            });

            return {
              activePath: app.workspace.getActiveFile()?.path ?? null,
              offersOther
            };
          } finally {
            await cleanup();
          }
        },
        vaultPath: getTempVault().path
      });

      expect(result.activePath).toBe('np-search/match.md');
      expect(result.offersOther).toBe(false);
    });
  });
}
