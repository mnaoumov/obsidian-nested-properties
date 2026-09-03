import type { App } from 'obsidian';

interface GetInitialExpandLevelParams {
  readonly app: App;
  readonly fallbackLevel: number;
  readonly sourcePath: string;
}

/**
 * The per-note settings a note may carry under its `nestedProperties` frontmatter key.
 *
 * ```yaml
 * ---
 * nestedProperties:
 *   initialExpandLevel: 2
 * ---
 * ```
 *
 * The key and its members are camelCase, mirroring the `PluginSettings` field names one-to-one, which is the
 * fleet's convention for a plugin-scoped frontmatter key.
 */
interface NestedPropertiesNoteSettings {
  // Typed as `unknown` on purpose: this comes from user-authored YAML, so it is validated rather than trusted.
  readonly initialExpandLevel?: unknown;
}

interface NestedPropertiesNoteSettingsFrontmatter {
  readonly nestedProperties?: NestedPropertiesNoteSettings;
}

/**
 * The expand level in force for a note: its own `nestedProperties.initialExpandLevel` when that is a valid
 * level, and the plugin setting otherwise.
 *
 * Read synchronously from the metadata cache, because the property widget's render path is synchronous.
 */
export function getInitialExpandLevel(params: GetInitialExpandLevelParams): number {
  const { app, fallbackLevel, sourcePath } = params;
  const frontmatter = app.metadataCache.getCache(sourcePath)?.frontmatter as NestedPropertiesNoteSettingsFrontmatter | undefined;
  return normalizeExpandLevel(frontmatter?.nestedProperties?.initialExpandLevel)
    ?? normalizeExpandLevel(fallbackLevel)
    ?? 0;
}

/**
 * A level is a non-negative integer. Anything else - a string, a float, a negative number, a missing key -
 * is not an override at all and falls through to the next source.
 */
function normalizeExpandLevel(value: unknown): null | number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return null;
  }
  return value;
}
