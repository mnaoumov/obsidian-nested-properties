export class PluginSettings {
  /**
   * How many levels of a nested property are expanded when a note is opened.
   *
   * `0` collapses everything, `1` expands the nested property itself but not its children, `2` also expands
   * its children, and so on. An array index counts as a level of its own, so in `generated.foo.0` the array
   * item sits one level below `generated.foo`. Overridable per note via the `nestedProperties` frontmatter
   * key.
   */
  public initialExpandLevel = 1;

  public isFullKeyDisplayEnabled = false;
}
