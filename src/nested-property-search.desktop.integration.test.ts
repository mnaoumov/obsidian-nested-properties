/**
 * @file
 *
 * Shared integration suite that exercises nested-property support in Obsidian's *native* search (issue #1)
 * end-to-end against a real Obsidian. Obsidian's built-in `[key]` / `[key: value]` property operators
 * enumerate only top-level frontmatter keys; `NestedPropertySearchPatchComponent` patches the internal
 * property-matcher node so a dotted key such as `[book.author: value]` also matches nested paths — directly
 * in the real search bar, with no separate command.
 *
 * The flow driven here is exactly the one a user drives: type a nested-property query into the real global
 * search view and read back which notes it returns. The assertion is the observable effect — the note whose
 * nested frontmatter matches is returned, and the note that does not match is not — proving both that the
 * patch makes nested queries work and that it does not over-match.
 *
 * Desktop-only, per G47: the file name alone picks the project. Android is DEFERRED because no emulator /
 * Appium server is provisioned here, so an android entry could not be verified green (G97's "record the
 * specific reason" escape hatch). The body is platform-agnostic, so enabling Android later is a rename to
 * `*.cross-platform.integration.test.ts`.
 */

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

// Minimal structural view of the internal global-search view the closure drives (its real type is not in
// `obsidian-typings`). `as` casts are compile-time only, so no runtime import is needed inside the closure.
interface ResultFile {
  path: string;
}

interface SearchResultDom {
  resultDomLookup: Map<ResultFile, unknown>;
}

interface SearchViewLike {
  dom: SearchResultDom;
  setQuery(query: string): void;
}
describe('Native search understands nested properties', () => {
  it('returns the note whose nested property matches and not the one that does not', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil } }) {
        const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;
        const FOLDER = 'np-search';
        const MATCH_PATH = `${FOLDER}/match.md`;
        const OTHER_PATH = `${FOLDER}/other.md`;

        async function cleanup(): Promise<void> {
          for (const path of [MATCH_PATH, OTHER_PATH, FOLDER]) {
            const existing = app.vault.getAbstractFileByPath(path);
            if (existing) {
              await app.fileManager.trashFile(existing);
            }
          }
        }

        await cleanup();
        await app.vault.createFolder(FOLDER);
        const matchFile = await app.vault.create(MATCH_PATH, '---\nbook:\n  author: Ursula K. Le Guin\n  genres:\n    - fantasy\n    - sci-fi\n---\n');
        const otherFile = await app.vault.create(OTHER_PATH, '---\nbook:\n  author: Frank Herbert\n  genres:\n    - sci-fi\n---\n');

        try {
          await waitUntil({
            message: 'seeded frontmatter did not reach the metadata cache',
            predicate: () =>
              Boolean(app.metadataCache.getFileCache(matchFile)?.frontmatter?.['book'])
              && Boolean(app.metadataCache.getFileCache(otherFile)?.frontmatter?.['book']),
            timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
          });

          const existingSearchLeaf = app.workspace.getLeavesOfType('search')[0];
          const searchLeaf = existingSearchLeaf ?? app.workspace.getLeftLeaf(false);
          if (!searchLeaf) {
            throw new Error('could not obtain a search leaf');
          }
          if (!existingSearchLeaf) {
            await searchLeaf.setViewState({ type: 'search' });
          }
          const searchViewUnknown: unknown = searchLeaf.view;
          const searchView = searchViewUnknown as SearchViewLike;

          // `startSearch` empties the result list synchronously then repopulates asynchronously, so waiting
          // On the expected end-state (the match present, or — for the negative control — absent) settles
          // Quickly and never blocks on the 20s ceiling.
          async function runQuery(query: string, shouldMatch: boolean): Promise<string[]> {
            // `setQuery` compiles the query and starts the search; the first call also bootstraps the patch.
            searchView.setQuery(query);
            let paths: string[] = [];
            await waitUntil({
              message: `search results for "${query}" did not settle`,
              predicate: () => {
                paths = [...searchView.dom.resultDomLookup.keys()]
                  .map((file) => file.path)
                  .filter((path) => path === MATCH_PATH || path === OTHER_PATH);
                return shouldMatch ? paths.includes(MATCH_PATH) : !paths.includes(MATCH_PATH);
              },
              timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
            });
            return paths;
          }

          const nestedValueMatches = await runQuery('[book.author: Ursula K. Le Guin]', true);
          const nestedListMemberMatches = await runQuery('[book.genres: fantasy]', true);
          const nestedExistenceMatches = await runQuery('[book.author]', true);
          const composedMatches = await runQuery('[book.author: Ursula K. Le Guin] Guin', true);
          const nonMatching = await runQuery('[book.author: Nobody At All]', false);

          // Reset the search box so the run leaves no residue in the UI.
          searchView.setQuery('');

          return {
            composedMatches,
            nestedExistenceMatches: nestedExistenceMatches.sort((a, b) => a.localeCompare(b)),
            nestedListMemberMatches,
            nestedValueMatches,
            nonMatching
          };
        } finally {
          await cleanup();
        }
      },
      vaultPath: getTemporaryVault().path
    });

    // A nested value query returns only the matching book, not the other author.
    expect(result.nestedValueMatches).toEqual(['np-search/match.md']);
    // A nested list-member query matches a value inside the nested list.
    expect(result.nestedListMemberMatches).toEqual(['np-search/match.md']);
    // A nested existence query matches every note that has the nested path (both books have `book.author`).
    expect(result.nestedExistenceMatches).toEqual(['np-search/match.md', 'np-search/other.md']);
    // The nested-property operator composes with a plain content term.
    expect(result.composedMatches).toEqual(['np-search/match.md']);
    // A nested value query that matches nothing returns nothing (no over-matching).
    expect(result.nonMatching).toEqual([]);
  });
});
