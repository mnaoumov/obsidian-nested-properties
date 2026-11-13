# CHANGELOG

## 1.9.0

This release has 1 new feature. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### New

- type `[a, b]` or `[]` into a property to make it a list (#15)

## 1.8.0

This release has 2 new features and 3 documentation changes. 4 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- Improve editing using keyboard. (#15)
- navigate nested properties from the keyboard

### Documentation

- **changelog:** regroup the published release notes for readers
- make issue attachments optional and strongly encouraged
- link to the Obsidian resources page

## 1.7.0

This release has 2 new features and 4 documentation changes. 9 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- add a Report a bug command
- record vault-wide nested property renames and deletes as `git` commits that can be reverted

### Documentation

- **readme:** point bug reports at the Report a bug command
- add issue-filing instructions for AI agents
- **readme:** combine related resources and plugin comparisons
- **readme:** list similar plugins

## 1.6.3

This release has 8 documentation changes. 8 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Documentation

- name `obsidian-lib` where comments said dev-utils
- shorten the debugging section
- **changelog:** escape the issue-title tags so `markdownlint` and `cspell` pass
- **changelog:** name the issue each released entry resolved
- **readme:** lead the Debugging section with `Advanced Debug Mode`
- mark plugin names as code
- **demo-vault:** give every Try it section a code button
- mark plugin names as code in markdown and comments

## 1.6.2

This release has 1 fix. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- **search:** merge the nested value on nested-property match lines (re #14 - \[FR\] when using Level1.level2 in search get the value of the property.)

## 1.6.1

This release has 5 fixes, 2 improvements and 4 documentation changes. 21 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **screenshots:** merge the caret-free desktop captures
- **floating-scrollbar:** merge the cross-window pending-frame fix
- **test:** merge the headless demo-vault toolkit install
- **deps:** restore the lockfile's missing resolved and integrity fields
- **deps:** float devalue to 5.9.4, clearing GHSA-9rgm-9g3h-6x36

### Improved

- **floating-scrollbar:** stop the cursor handler running on every pointer move
- **floating-scrollbar:** stop blocking every wheel event in the app

### Documentation

- replace the private rule-id citations with what they assert
- name the library and the sibling plugins so a reader can resolve them
- replace the private tracker references with what they pointed at
- name the unversioned demo-vault asset and the folder it unzips into

## 1.6.0

This release has 1 new feature and 1 fix. 3 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- \[FR\] Support properties preview by default (#12)

### Fixed

- **build:** wire build:compile to buildCompile and drop the duplicate leaf script

## 1.5.0

This release has 1 new feature and 2 fixes. 3 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- left margin from 144px to 20px re PR #11

### Fixed

- **deps:** move to `obsidian-integration-testing` 11 and `obsidian-dev-utils` 96.5.2
- **deps:** drop the brace-expansion file: override that breaks a clean install

## 1.4.4

This release has 1 fix and 3 documentation changes. 6 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- override deepmerge-ts to clear GHSA-ggr8-5vv4-36mx

### Documentation

- **readme:** render the same in Obsidian's plugin page as on `GitHub`
- **demo-vault:** give the cumulative walkthrough a reset
- capture the community-store screenshot set

## 1.4.3

This release has 1 new feature and 1 documentation change.

### New

- **demo-vault:** migrate to `obsidian-dev-utils` 93.3.1 and adopt the authoring convention

### Documentation

- make the demo vault the documentation, in the standard layout

## 1.4.2

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.4.1

This release has 1 fix and 1 documentation change. 6 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- await the settings load before the renderer that reads them

### Documentation

- fix the demo vault download instructions

## 1.4.0

This release has 3 new features and 1 documentation change. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### New

- re #1
- \[FR\] Allow finding nested properties via Obsidian's search (#1)
- \[FR\] Allow nested properties renaming (#6)

### Documentation

- demo nested-property commands in demo vault (re #6, re #1)

## 1.3.1

This release has 1 fix. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- re #7

## 1.3.0

This release has 1 new feature. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- \[FR\] Save nested property type (#8)

## 1.2.16

This release has 1 fix.

### Fixed

- expand long key

## 1.2.15

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.2.14

This release has 1 fix. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **demo-vault:** export invoke() from startup script; add Invocables folder

## 1.2.13

This release has 5 documentation changes.

### Documentation

- standardize demo-vault README
- drop per-plugin demo-vault setup notes (bootstrap covered by the `obsidian-dev-utils` harness)
- unnumber demo-vault setup notes
- **demo-vault:** number the `Nested Properties` demo vault example notes
- **demo-vault:** adopt `obsidian-dev-utils` 87.x demo-vault helpers and its coverage suite

## 1.2.12

This release has 1 new feature and 1 fix.

### New

- demo-vault

### Fixed

- \[FR\] Command to toggle full word display for nested property keys (#9)

## 1.2.11

This release has 1 new feature.

### New

- \[FR\] Command to toggle full word display for nested property keys (#9)

## 1.2.10

This release has maintenance changes only. 7 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 1.2.9

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.2.8

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.2.7

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.2.6

This release has maintenance changes only. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 1.2.5

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.2.4

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.2.3

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.2.2

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.2.1

This release has 1 other change. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Other changes

- add 100% coverage

## 1.2.0

This release has 1 new feature and 1 other change.

### New

- add mixed list type

### Other changes

- Style improvements: use native cursor, center chevrons, fit-content add property buttons (#5 by @davidvkimball)

## 1.1.0

This release has 2 new features and 2 fixes. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### New

- allow scrolling with keyboard
- add floating scrollbar

### Fixed

- hide wrong type warning
- `add item` button to lists re #3 #4

## 1.0.0

This release has 1 new feature.

### New

- initial
