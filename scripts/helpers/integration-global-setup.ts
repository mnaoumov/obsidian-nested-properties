import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  join,
  toPosixPath
} from 'obsidian-dev-utils/path';
import { evalObsidianCli } from 'obsidian-dev-utils/script-utils/obsidian-cli';
import { getRootFolder } from 'obsidian-dev-utils/script-utils/root';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

interface GlobalSetupContext {
  provide(key: string, value: string): void;
}

const projectRoot = ensureNonNullable(getRootFolder());
const distPath = join(projectRoot, 'dist/build');

let pluginId: string;
let tempVaultPath: string;

export async function setup(context: GlobalSetupContext): Promise<void> {
  const manifestJson = JSON.parse(await readFile(join(distPath, 'manifest.json'), 'utf-8')) as { id: string };
  pluginId = manifestJson.id;

  const mainJs = join(distPath, 'main.js');
  const buildStat = await stat(mainJs).catch(() => null);
  if (!buildStat) {
    throw new Error(`Build not found at ${distPath}. Run \`npm run build\` first.`);
  }

  console.warn(`Using build from ${buildStat.mtime.toISOString()}. If outdated, run \`npm run build\`.`);

  tempVaultPath = await mkdtemp(join(toPosixPath(tmpdir()), `${pluginId}-`));
  const pluginDir = join(tempVaultPath, '.obsidian/plugins', pluginId);
  await mkdir(pluginDir, { recursive: true });
  await cp(distPath, pluginDir, { recursive: true });
  await writeFile(join(tempVaultPath, '.obsidian/community-plugins.json'), JSON.stringify([pluginId]));

  await evalObsidianCli({
    args: [pluginId],
    fn: async (app, id) => {
      await app.plugins.enablePluginAndSave(id);
    },
    vaultPath: tempVaultPath
  });

  context.provide('tempVaultPath', tempVaultPath);
}

export async function teardown(): Promise<void> {
  await rm(tempVaultPath, { recursive: true });
}
