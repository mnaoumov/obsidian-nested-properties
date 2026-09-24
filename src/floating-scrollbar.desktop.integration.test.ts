import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

const vault = getTemporaryVault();

const DEEP_NESTING_NOTE_PATH = 'deep-nesting.md';

/**
 * The note the whole suite runs against, shaped to make the root property genuinely overflow its own
 * scroll box - which is the precondition the floating scrollbar exists for, and the one thing a jsdom
 * test never has to earn because it builds the element by hand.
 *
 * Two ingredients, and both are needed:
 *
 * - **Depth.** Every nested level is indented 20px by the stylesheet, so at ten levels the innermost row
 *   has 200px less room than the property that contains it. Indentation alone does NOT overflow: each
 *   level is `width: 100%` in a column flex container, so it shrinks by the margin rather than spilling
 *   past it. Measured in real Obsidian, an eleven-level note of short keys reports
 *   `scrollWidth === clientWidth` at every level.
 * - **A key too long to shrink.** With full key display on, the stylesheet gives key elements
 *   `width: auto; flex: 0 0 auto`, so the deepest key claims its natural width in the narrowest row
 *   there is. That is what pushes content past the scroll box - and it is also the real reason a user
 *   ever sees this scrollbar.
 *
 * `nestedProperties.initialExpandLevel` renders the tree fully expanded on open: the plugin setting
 * defaults to `0`, and the component's root-property selector excludes a collapsed property, so without
 * the override there would be nothing overflowing and nothing matching to wheel at.
 */
const DEEP_NESTING_NOTE_CONTENT = `---
nestedProperties:
  initialExpandLevel: 12
deeply_nested:
  level_1:
    level_2:
      level_3:
        level_4:
          level_5:
            level_6:
              level_7:
                level_8:
                  a_deeply_indented_nested_property_key_long_enough_to_overflow_the_scroll_box_by_a_wide_margin: value
---
`;

/**
 * The wheel delta the tests turn. The handler adds it straight to `scrollLeft`, so as long as the note
 * overflows by more than this the scroll cannot be clamped and the assertion can be an equality.
 */
const WHEEL_DELTA_IN_PIXELS = 120;

beforeEach(() => {
  vault.populate({
    [DEEP_NESTING_NOTE_PATH]: DEEP_NESTING_NOTE_CONTENT
  });
});

interface WheelMeasurement {
  readonly isDefaultPrevented: boolean;
  readonly isTargetInsideProperty: boolean;
  readonly maxScrollLeft: number;
  readonly scrollLeftAfter: number;
  readonly scrollLeftBefore: number;
}

/**
 * Where, vertically, the wheel turn lands on the root property.
 *
 * `near-scrollbar` is inside the 16px zone above the property's bottom edge, where its native horizontal
 * scrollbar is drawn; `away-from-scrollbar` is the property's vertical middle, which is nowhere near it.
 */
type WheelPosition = 'away-from-scrollbar' | 'near-scrollbar';

describe('floating scrollbar wheel over the native scrollbar', () => {
  it('scrolls the root property horizontally when the wheel turn lands near its native scrollbar', async () => {
    const result = await wheelAtRootProperty('near-scrollbar');

    expect(result.maxScrollLeft).toBeGreaterThan(WHEEL_DELTA_IN_PIXELS);
    expect(result.isTargetInsideProperty).toBe(true);
    expect(result.scrollLeftBefore).toBe(0);
    expect(result.scrollLeftAfter).toBe(WHEEL_DELTA_IN_PIXELS);
    expect(result.isDefaultPrevented).toBe(true);
  });

  it('leaves the root property alone when the wheel turn lands away from the native scrollbar', async () => {
    const result = await wheelAtRootProperty('away-from-scrollbar');

    expect(result.maxScrollLeft).toBeGreaterThan(WHEEL_DELTA_IN_PIXELS);
    expect(result.isTargetInsideProperty).toBe(true);
    expect(result.scrollLeftBefore).toBe(0);
    expect(result.scrollLeftAfter).toBe(0);
    expect(result.isDefaultPrevented).toBe(false);
  });
});

/**
 * Opens the deep-nesting note in a real Obsidian, waits for its root property to render overflowing, and
 * turns one wheel at the requested height of it.
 *
 * The event is dispatched at whatever `elementFromPoint` reports under that point rather than at the root
 * property itself, and that is the whole reason this test is not a unit test: it starts from an element
 * chosen by a real hit test, in a real rendered Properties editor, and so exercises
 * registration-to-delivery rather than just the handler. The unit suite already dispatches synthetic
 * events straight at hand-built elements, which proves the handler and nothing about where the listener
 * sits.
 *
 * @param position - Where on the property the wheel turn lands.
 * @returns What the property's horizontal scroll offset did, and whether the event was consumed.
 */
async function wheelAtRootProperty(position: WheelPosition): Promise<WheelMeasurement> {
  return await evalInObsidian({
    callback: async ({ app, lib, notePath, obsidianModule, wheelDeltaInPixels, wheelPosition }) => {
      const { waitUntil } = lib;

      const FULL_KEY_DISPLAY_CLASS = 'nested-properties-full-key-display';
      const FULL_KEY_DISPLAY_COMMAND_ID = 'nested-properties:toggle-full-key-display';
      // Inside the handler's 16px hit zone, and far enough off the edge that a sub-pixel layout
      // difference cannot drop the hit test onto whatever is below the property.
      const SCROLLBAR_ZONE_INSET_IN_PIXELS = 4;

      const file = app.vault.getFileByPath(notePath);
      if (!file) {
        throw new Error(`${notePath} not found`);
      }
      await app.workspace.getLeaf(true).openFile(file);

      const view = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
      const containerEl = view?.contentEl ?? activeDocument.body;
      // The path is escaped once and reused: it carries a dot, which is meaningful in a CSS selector.
      const escapedNotePath = CSS.escape(notePath);
      const rootSelector = `.nested-properties-collapsible[data-path="${escapedNotePath}:deeply_nested"]`;

      // Full key display is what makes the deepest key claim its natural width, and so what makes the
      // property overflow at all. The previous state is restored below: the setting is persisted and the
      // Obsidian instance is shared with every other suite in this project.
      const wasFullKeyDisplayOn = activeDocument.body.hasClass(FULL_KEY_DISPLAY_CLASS);
      if (!wasFullKeyDisplayOn) {
        app.commands.executeCommandById(FULL_KEY_DISPLAY_COMMAND_ID);
      }

      try {
        // Waiting on the overflow rather than merely on the element is what makes this deterministic:
        // the property is only a wheel target once it has been laid out wider than its own scroll box.
        await waitUntil({
          message: 'the deeply_nested property to render wider than its scroll box',
          predicate: () => {
            const el = containerEl.querySelector(rootSelector);
            return el instanceof HTMLElement && !el.hasClass('is-collapsed') && el.scrollWidth > el.clientWidth;
          }
        });

        const rootEl = containerEl.querySelector(rootSelector);
        if (!(rootEl instanceof HTMLElement)) {
          throw new TypeError('the deeply_nested property did not render');
        }

        rootEl.scrollIntoView();
        rootEl.scrollLeft = 0;

        const rect = rootEl.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = wheelPosition === 'near-scrollbar'
          ? rect.bottom - SCROLLBAR_ZONE_INSET_IN_PIXELS
          : rect.top + rect.height / 2;

        const targetEl = activeDocument.elementFromPoint(clientX, clientY);
        if (!(targetEl instanceof HTMLElement)) {
          throw new TypeError('the wheel point hit no element');
        }

        const scrollLeftBefore = rootEl.scrollLeft;
        const $event = new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          deltaY: wheelDeltaInPixels
        });
        // eslint-disable-next-line obsidian-dev-utils/no-untrusted-input-events -- There is no trusted wheel turn available to a harness, and this dispatch demonstrably exercises the real listener rather than passing vacuously: mis-anchoring the wheel registration onto the floating track makes this test fail, and widening the hit zone makes its sibling fail. Neither the registration nor the handler reads `isTrusted`.
        targetEl.dispatchEvent($event);

        return {
          isDefaultPrevented: $event.defaultPrevented,
          isTargetInsideProperty: rootEl.contains(targetEl),
          maxScrollLeft: rootEl.scrollWidth - rootEl.clientWidth,
          scrollLeftAfter: rootEl.scrollLeft,
          scrollLeftBefore
        };
      } finally {
        if (!wasFullKeyDisplayOn) {
          app.commands.executeCommandById(FULL_KEY_DISPLAY_COMMAND_ID);
        }
      }
    },
    input: {
      notePath: DEEP_NESTING_NOTE_PATH,
      wheelDeltaInPixels: WHEEL_DELTA_IN_PIXELS,
      wheelPosition: position
    },
    vaultPath: vault.path
  });
}
