/**
 * @file
 *
 * Integration suite for bulk-operation commits: with `shouldCommitBulkOperations` on and the vault inside a git
 * work tree, the vault-wide rename of a nested property lands as `chore: before OP<n>` (what was pending) followed
 * by `OP<n>: Rename nested property <from> to <to> in all notes` (what the run changed), and `git revert` of the
 * second commit puts the notes back.
 *
 * The shared temporary vault is made a git work tree for this suite only, and its `.git` is removed again
 * afterwards, so no other suite runs against a repository. The config folder is ignored, because the workspace file
 * Obsidian keeps rewriting would otherwise land in the operation's commit and make its revert conflict.
 *
 * It is named `*.desktop.integration.test.ts` so it runs only in the desktop integration project: the commits
 * need the system `git`, which only the desktop app reaches.
 */

import type { SettingTab } from 'obsidian';

import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

import type { PluginSettings } from '../settings/plugin-settings.ts';

/**
 * Both renamed notes, as read back from disk.
 */
interface RenamedContents {
  readonly contentA: string;
  readonly contentB: string;
}

/**
 * The (otherwise protected) settings component exposed for the test, letting it change settings the
 * same way the plugin's own settings UI does.
 */
interface TestableSettingsComponent {
  readonly editAndSave: (settingsEditor: (settings: PluginSettings) => Promise<void> | void) => Promise<void>;
}

/**
 * The plugin's settings tab, exposing its settings component.
 */
interface TestableSettingsTab extends SettingTab {
  readonly pluginSettingsComponent: TestableSettingsComponent;
}

const PLUGIN_ID = 'nested-properties';
const FOLDER_PATH = 'np-bulk-operation-commits';
const FILE_A_PATH = `${FOLDER_PATH}/a.md`;
const FILE_B_PATH = `${FOLDER_PATH}/b.md`;
const FILE_A_CONTENT = '---\nnpBulkCommits:\n  owner: alice\n---\n';
const FILE_B_CONTENT = '---\nnpBulkCommits:\n  owner: bob\n---\n';
const FROM_PATH = 'npBulkCommits.owner';
const TO_PATH = 'npBulkCommits.maintainer';
const COMMIT_WAIT_TIMEOUT_IN_MILLISECONDS = 30_000;
const COMMIT_POLL_INTERVAL_IN_MILLISECONDS = 200;

let vaultPath: string;

function git(...gitArguments: string[]): string {
  return execFileSync('git', gitArguments, { cwd: vaultPath, encoding: 'utf-8' }).trim();
}

beforeAll(async () => {
  vaultPath = getTemporaryVault().path;
  const configDirectory = await evalInObsidian({
    callback({ app }): string {
      return app.vault.configDir;
    },
    vaultPath
  });
  git('init', '--quiet', '--initial-branch=main');
  // Hooks from the machine's global config must not decide whether the suite's commits land.
  const hooksPath = join(vaultPath, '.git', 'test-hooks');
  mkdirSync(hooksPath);
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  git('config', 'commit.gpgSign', 'false');
  // A global core.autocrlf would check the reverted notes out with CRLF line endings.
  git('config', 'core.autocrlf', 'false');
  git('config', 'core.hooksPath', hooksPath);
  writeFileSync(join(vaultPath, '.gitignore'), `${configDirectory}/\n`);
  git('add', '-A');
  git('commit', '--quiet', '-m', 'chore: vault before the suite');
});

afterAll(async () => {
  // Turned off only once the operation's commit has landed: the commit is made after the vault goes quiet,
  // well after the rename the test waits for.
  await evalInObsidian({
    async callback({ app, folderPath, pluginId }): Promise<void> {
      const settingTab = app.setting.pluginTabs.find((tab) => tab.id === pluginId);
      await (settingTab as TestableSettingsTab | undefined)?.pluginSettingsComponent.editAndSave((settings) => {
        settings.shouldCommitBulkOperations = false;
      });
      const folder = app.vault.getFolderByPath(folderPath);
      if (folder) {
        await app.fileManager.trashFile(folder);
      }
    },
    input: { folderPath: FOLDER_PATH, pluginId: PLUGIN_ID },
    vaultPath
  });
  rmSync(join(vaultPath, '.git'), { force: true, recursive: true });
  rmSync(join(vaultPath, '.gitignore'), { force: true });
});

describe('bulk operation commits (Desktop)', () => {
  it('should record a vault-wide rename as two commits that a revert undoes', async () => {
    const renamed = await runRenameAcrossVault();
    expect(renamed.contentA).toContain('maintainer: alice');
    expect(renamed.contentB).toContain('maintainer: bob');

    const operationCommitSha = await waitForOperationCommit();
    const subjects = git('log', '--format=%s', '-2', operationCommitSha).split('\n');
    const operationId = /^(?<operationId>OP\d+): /u.exec(subjects[0] ?? '')?.groups?.['operationId'];
    expect(subjects).toEqual([
      `${operationId ?? 'OP?'}: Rename nested property ${FROM_PATH} to ${TO_PATH} in all notes`,
      `chore: before ${operationId ?? 'OP?'}`
    ]);
    expect(git('show', '--name-only', '--format=', operationCommitSha).split('\n').sort()).toEqual([FILE_A_PATH, FILE_B_PATH]);
    expect(git('show', '--format=%B', '--no-patch', operationCommitSha)).toContain(`Obsidian-Plugin: ${PLUGIN_ID}`);

    git('revert', '--no-edit', operationCommitSha);

    expect(await readFromVault(FILE_A_PATH)).toBe(FILE_A_CONTENT);
    expect(await readFromVault(FILE_B_PATH)).toBe(FILE_B_CONTENT);
    expect(git('status', '--porcelain')).toBe('');
  });
});

/**
 * Reads a note the way the vault sees it after git rewrote it from outside.
 *
 * @param path - The note's vault path.
 * @returns Its content.
 */
async function readFromVault(path: string): Promise<string> {
  return evalInObsidian({
    async callback({ app, notePath }): Promise<string> {
      return await app.vault.adapter.read(notePath);
    },
    input: { notePath: path },
    vaultPath
  });
}

/**
 * Turns the commits on, creates the two notes, runs `Rename a nested property in all notes` through its real
 * picker and prompt, and returns both notes once the rename is on disk.
 *
 * @returns The renamed notes.
 */
async function runRenameAcrossVault(): Promise<RenamedContents> {
  return evalInObsidian({
    async callback({ app, fileAContent, fileAPath, fileBContent, fileBPath, folderPath, fromPath, lib: { waitUntil }, pluginId, toPath }): Promise<RenamedContents> {
      // Under the transport's ~30s per-closure cap: each step lands in well under a second.
      const WAIT_TIMEOUT_IN_MILLISECONDS = 5000;

      const settingTab = app.setting.pluginTabs.find((tab) => tab.id === pluginId);
      if (!settingTab) {
        throw new Error(`Settings tab not found for plugin: ${pluginId}`);
      }

      await (settingTab as TestableSettingsTab).pluginSettingsComponent.editAndSave((settings) => {
        settings.shouldCommitBulkOperations = true;
      });

      await app.vault.createFolder(folderPath);
      const fileA = await app.vault.create(fileAPath, fileAContent);
      const fileB = await app.vault.create(fileBPath, fileBContent);
      await waitUntil({
        message: 'seeded frontmatter did not reach the metadata cache',
        predicate: () =>
          Boolean(app.metadataCache.getFileCache(fileA)?.frontmatter?.['npBulkCommits'])
          && Boolean(app.metadataCache.getFileCache(fileB)?.frontmatter?.['npBulkCommits']),
        timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      });

      app.commands.executeCommandById(`${pluginId}:rename-nested-property-across-vault`);

      await waitUntil({
        message: 'nested property picker did not open',
        predicate: () => activeDocument.querySelector(':scope .select-item-modal .prompt-input') !== null,
        timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      });
      const pickerInput = activeDocument.querySelector(':scope .select-item-modal .prompt-input');
      if (!(pickerInput instanceof HTMLInputElement)) {
        throw new TypeError('picker input not found');
      }
      pickerInput.value = fromPath;
      pickerInput.dispatchEvent(new Event('input'));
      await waitUntil({
        message: 'nested path suggestion did not appear',
        predicate: () =>
          [...activeDocument.querySelectorAll(':scope .select-item-modal .suggestion-item')]
            .some((el) => el.textContent.includes(fromPath)),
        timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      });
      const suggestion = [...activeDocument.querySelectorAll<HTMLElement>(':scope .select-item-modal .suggestion-item')]
        .find((el) => el.textContent.includes(fromPath));
      if (!suggestion) {
        throw new Error('nested path suggestion not found');
      }
      suggestion.click();

      await waitUntil({
        message: 'rename prompt did not open',
        predicate: () => activeDocument.querySelector(':scope .prompt-modal .text-box') !== null,
        timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      });
      const promptInput = activeDocument.querySelector(':scope .prompt-modal .text-box');
      if (!(promptInput instanceof HTMLInputElement)) {
        throw new TypeError('rename prompt input not found');
      }
      promptInput.value = toPath;
      promptInput.dispatchEvent(new Event('input'));
      const okButton = activeDocument.querySelector(':scope .prompt-modal .ok-button');
      if (!(okButton instanceof HTMLElement)) {
        throw new TypeError('rename prompt OK button not found');
      }
      okButton.click();

      await waitUntil({
        message: 'nested property was not renamed across both notes',
        predicate: async () => {
          const contentA = await app.vault.adapter.read(fileAPath);
          const contentB = await app.vault.adapter.read(fileBPath);
          return contentA.includes('maintainer: alice') && contentB.includes('maintainer: bob');
        },
        timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      });

      return {
        contentA: await app.vault.adapter.read(fileAPath),
        contentB: await app.vault.adapter.read(fileBPath)
      };
    },
    input: {
      fileAContent: FILE_A_CONTENT,
      fileAPath: FILE_A_PATH,
      fileBContent: FILE_B_CONTENT,
      fileBPath: FILE_B_PATH,
      folderPath: FOLDER_PATH,
      fromPath: FROM_PATH,
      pluginId: PLUGIN_ID,
      toPath: TO_PATH
    },
    vaultPath
  });
}

/**
 * Waits for the operation's commit, which lands only after the vault has gone quiet following the run.
 *
 * @returns The commit's sha.
 */
async function waitForOperationCommit(): Promise<string> {
  const start = performance.now();
  while (performance.now() - start < COMMIT_WAIT_TIMEOUT_IN_MILLISECONDS) {
    const sha = git('log', '--format=%H', '-1', '--grep=^OP[0-9]+: ', '--extended-regexp');
    if (sha) {
      return sha;
    }

    await delay(COMMIT_POLL_INTERVAL_IN_MILLISECONDS);
  }

  throw new Error(`No OP commit appeared within ${String(COMMIT_WAIT_TIMEOUT_IN_MILLISECONDS)} ms`);
}
