# CHANGELOG

## 1.5.0

- chore(deps): sweep caret-ranged dependencies to latest
- fix(deps): move to obsidian-integration-testing 11 and obsidian-dev-utils 96.5.2
- fix(deps): drop the brace-expansion file: override that breaks a clean install
- feat: left margin from 144px to 20px re PR #11
- test(nested-properties): record the deliberate untrusted-input exception
- test(nested-properties): right-click and dismiss with trusted input in the capture suite

## 1.4.4

- docs(readme): render the same in Obsidian's plugin page as on GitHub
- chore: update libs
- chore: update obsidian-dev-utils to 94.6.1
- chore: update obsidian-dev-utils to 94.6.0
- fix: override deepmerge-ts to clear GHSA-ggr8-5vv4-36mx
- test: gate the demo vault by clicking every code button
- chore: teach cspell the advisory wording
- chore: update libs
- docs(demo-vault): give the cumulative walkthrough a reset
- docs: capture the community-store screenshot set

## 1.4.3

- docs: make the demo vault the documentation, in the standard layout
- feat(demo-vault): migrate to obsidian-dev-utils 93.3.1 and adopt the authoring convention

## 1.4.2

- chore: update libs and adopt obsidian-integration-testing 10

## 1.4.1

- test: cover the expanded-path bookkeeping of expand/collapse all
- fix: await the settings load before the renderer that reads them
- chore: update libs
- refactor(test): collapse the shared integration suites per G47
- chore: update libs
- chore(vitest): adopt the shared Obsidian plugin vitest configuration
- chore: update libs and clear the npm audit
- docs: fix the demo vault download instructions

## 1.4.0

- feat: re #1
- docs: demo nested-property commands in demo vault (re #6, re #1)
- test: add behavioral integration tests for nested-property commands (re #6, re #1)
- feat: re #1
- feat: re #6

## 1.3.1

- fix: re #7
- chore: update libs

## 1.3.0

- test: reach 100% unit-test coverage
- chore: spellcheck
- feat: re #8

## 1.2.16

- fix: expand long key

## 1.2.15

- chore: update libs

## 1.2.14

- chore: update libs
- chore(demo-vault): drop committed Invocables placeholder
- fix(demo-vault): export invoke() from startup script; add Invocables folder

## 1.2.13

- docs: standardize demo-vault README
- docs: drop per-plugin demo-vault setup notes (bootstrap covered by ODU harness)
- docs: unnumber demo-vault setup notes
- Merge branch 'T119-renumber': number ONP demo vault example notes (S2)
- Merge branch 'T119': adopt ODU 87.x demo-vault helpers + coverage suite (S2)

## 1.2.12

- fix: re #9
- feat: demo-vault

## 1.2.11

- feat: re #9

## 1.2.10

- chore: update libs
- chore: update obsidian-dev-utils to 85.0.0
- refactor: pass params objects to nested property renderer
- build: lock typescript to 6.0.3
- test: wire integration-testing vitest-setup into integration projects
- chore: update libs
- chore: clean up tsconfig

## 1.2.9

- refactor: new template

## 1.2.8

- refactor: new template

## 1.2.7

- chore: update libs

## 1.2.6

- chore: update libs
- chore: upgrade dependencies and green up all checks

## 1.2.5

- chore: update template

## 1.2.4

- refactor: new template

## 1.2.3

- refactor: new template

## 1.2.2

- chore: update libs

## 1.2.1

- tests: add 100% coverage
- refactor: new template

## 1.2.0

- Style improvements: use native cursor, center chevrons, fit-content add property buttons (#5 by @davidvkimball)
- feat: add mixed list type

## 1.1.0

- test: add unit tests
- fix: hide wrong type warning
- feat: allow scrolling with keyboard
- feat: add floating scrollbar
- fix: `add item` button to lists re #3 #4

## 1.0.0

- feat: initial
