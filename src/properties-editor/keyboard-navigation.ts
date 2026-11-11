import type { FocusMode } from '@obsidian-typings/obsidian-public-latest';

import { Platform } from 'obsidian';

/**
 * Everything the keyboard can reach in a Properties editor: a property row (Obsidian's own top-level row or a
 * nested one), the nested **Add property** / **Add item** buttons, and Obsidian's own **Add property** button.
 */
const FOCUS_STOP_SELECTOR = '.metadata-property, .nested-properties-add-property, .nested-properties-add-item, .metadata-add-button';
const NESTED_ADD_BUTTON_SELECTOR = ':scope > .nested-properties-add-property, :scope > .nested-properties-add-item';
const NESTED_CONTAINER_SELECTOR = '.nested-properties-container';

/**
 * Parameters for {@link NestedPropertyKeyboardNavigator.focusRowByPath}.
 */
export interface NestedPropertyKeyboardNavigatorFocusRowByPathParams {
  /**
   * The row's path, as its `data-path` attribute carries it.
   */
  readonly path: string;

  /**
   * The element to search under.
   */
  readonly scopeEl: HTMLElement;

  /**
   * Whether to focus the row's value rather than the row itself.
   */
  readonly shouldFocusValue: boolean;
}

/**
 * What the keyboard can do to one row. The renderer registers it for every nested row, and for every top-level
 * object or list row.
 */
export interface NestedRowKeyboardActions {
  /**
   * Focuses the row's value. Absent on an object or list row, which has no single value to focus.
   */
  readonly focusValue?: (this: void, mode: FocusMode) => void;

  /**
   * Removes the entry. Absent on a top-level row, whose removal is Obsidian's own.
   */
  readonly remove?: (this: void) => void;

  /**
   * Expands or collapses the row. Present only on an object or list row.
   */
  readonly setExpanded?: (this: void, isExpanded: boolean) => void;
}

/**
 * Drives the nested tree from the keyboard, with the keys Obsidian's own Properties editor uses for its
 * top-level rows (issue #15): the tree reads as one list of rows, in which an object or list row opens onto its
 * children.
 *
 * It listens in the capture phase, so it sees a key before Obsidian's own row handlers do. It acts only where
 * the nested tree is involved, and a key it acts on is consumed: its default is prevented and it goes no further.
 * Every other key is left to Obsidian.
 */
export class NestedPropertyKeyboardNavigator {
  private readonly rowActions = new WeakMap<HTMLElement, NestedRowKeyboardActions>();

  /**
   * Focuses the first row or button inside a nested container.
   *
   * @param containerEl - The `.nested-properties-container`.
   */
  public focusFirstStop(containerEl: HTMLElement): void {
    containerEl.querySelector<HTMLElement>(FOCUS_STOP_SELECTOR)?.focus();
  }

  /**
   * Focuses the row with the given path, or its value. Does nothing when no such row is there.
   *
   * @param params - The row and what to focus.
   */
  public focusRowByPath(params: NestedPropertyKeyboardNavigatorFocusRowByPathParams): void {
    const { path, scopeEl, shouldFocusValue } = params;
    const rowEl = scopeEl.querySelector<HTMLElement>(`.metadata-property[data-path="${CSS.escape(path)}"]`);
    if (!rowEl) {
      return;
    }

    const focusValue = this.rowActions.get(rowEl)?.focusValue;
    if (shouldFocusValue && focusValue) {
      focusValue('both');
    } else {
      rowEl.focus();
    }
  }

  /**
   * Handles a `keydown` seen in the capture phase.
   *
   * @param $event - The event.
   */
  public handleKeydown($event: KeyboardEvent): void {
    if ($event.isComposing || $event.defaultPrevented) {
      return;
    }

    const target = $event.targetNode;
    if (!target?.instanceOf(HTMLElement) || !target.matches(FOCUS_STOP_SELECTOR)) {
      return;
    }

    const metadataContainerEl = target.closest<HTMLElement>('.metadata-container');
    if (!metadataContainerEl?.querySelector(NESTED_CONTAINER_SELECTOR)) {
      return;
    }

    this.handleRowKey($event, target);
    handleAddButtonKey($event, target);
    handleNavigationKey($event, target, metadataContainerEl);
  }

  /**
   * Registers what the keyboard can do to a row.
   *
   * @param rowEl - The row.
   * @param actions - The actions.
   */
  public registerRow(rowEl: HTMLElement, actions: NestedRowKeyboardActions): void {
    this.rowActions.set(rowEl, actions);
  }

  private enterRow($event: KeyboardEvent, rowEl: HTMLElement, mode: FocusMode): void {
    const actions = this.rowActions.get(rowEl);
    if (actions?.setExpanded) {
      consume($event);
      actions.setExpanded(true);
      const containerEl = rowEl.querySelector<HTMLElement>(`:scope > .metadata-property-value > ${NESTED_CONTAINER_SELECTOR}`);
      if (containerEl) {
        this.focusFirstStop(containerEl);
      }
      return;
    }

    if (!actions?.focusValue) {
      return;
    }

    consume($event);
    actions.focusValue(mode);
  }

  private handleRowKey($event: KeyboardEvent, rowEl: HTMLElement): void {
    const actions = this.rowActions.get(rowEl);
    if (!actions) {
      return;
    }

    const isNested = isNestedStop(rowEl);
    if (isRemoveKey($event)) {
      if (isNested && actions.remove) {
        consume($event);
        actions.remove();
      }
      return;
    }

    if (hasModifier($event)) {
      return;
    }

    if (!isNested) {
      // Obsidian's own row: Enter and ArrowRight already reach the nested widget's `focus()`. Only ArrowLeft on an
      // expanded row differs, collapsing it; on a collapsed one Obsidian's own ArrowLeft (focus the key) runs.
      if (isLeftKey($event.key)) {
        collapse($event, rowEl, actions);
      }
      return;
    }

    switch ($event.key) {
      case ' ':
      case 'ArrowRight':
      case 'Enter':
      case 'l': {
        this.enterRow($event, rowEl, 'both');
        break;
      }
      case 'A': {
        this.enterRow($event, rowEl, 'end');
        break;
      }
      case 'i': {
        this.enterRow($event, rowEl, 'start');
        break;
      }
      case 'o': {
        addSibling($event, rowEl);
        break;
      }
      default: {
        if (isLeftKey($event.key)) {
          collapse($event, rowEl, actions);
          focusParentRow($event, rowEl);
        }
      }
    }
  }
}

function addSibling($event: KeyboardEvent, rowEl: HTMLElement): void {
  const newEntryButtonEl = rowEl.parentElement?.querySelector<HTMLElement>(NESTED_ADD_BUTTON_SELECTOR);
  if (!newEntryButtonEl) {
    return;
  }

  consume($event);
  newEntryButtonEl.click();
}

function collapse($event: KeyboardEvent, rowEl: HTMLElement, actions: NestedRowKeyboardActions): void {
  if (!actions.setExpanded || rowEl.hasClass('is-collapsed')) {
    return;
  }

  consume($event);
  actions.setExpanded(false);
}

function consume($event: KeyboardEvent): void {
  $event.preventDefault();
  $event.stopPropagation();
}

function focusParentRow($event: KeyboardEvent, rowEl: HTMLElement): void {
  if ($event.defaultPrevented) {
    return;
  }

  const parentRowEl = rowEl.parentElement?.closest<HTMLElement>('.metadata-property');
  if (!parentRowEl) {
    return;
  }

  consume($event);
  parentRowEl.focus();
}

function getNavigationDirection($event: KeyboardEvent): -1 | 0 | 1 {
  if (hasModifier($event)) {
    return 0;
  }

  switch ($event.key) {
    case 'ArrowDown':
    case 'j': {
      return $event.shiftKey ? 0 : 1;
    }
    case 'ArrowUp':
    case 'k': {
      return $event.shiftKey ? 0 : -1;
    }
    case 'Tab': {
      return $event.shiftKey ? -1 : 1;
    }
    default: {
      return 0;
    }
  }
}

/**
 * The rows and buttons the keyboard can reach, in document order, skipping everything inside a collapsed node.
 *
 * @param metadataContainerEl - The Properties editor.
 * @returns The focus stops.
 */
function getVisibleFocusStops(metadataContainerEl: HTMLElement): HTMLElement[] {
  return [...metadataContainerEl.querySelectorAll<HTMLElement>(FOCUS_STOP_SELECTOR)]
    .filter((el) => !el.parentElement?.closest('.nested-properties-collapsible.is-collapsed'));
}

function handleAddButtonKey($event: KeyboardEvent, target: HTMLElement): void {
  if ($event.defaultPrevented || !isNestedAddButton(target) || hasModifier($event) || ($event.key !== 'Enter' && $event.key !== ' ')) {
    return;
  }

  consume($event);
  target.click();
}

function handleNavigationKey($event: KeyboardEvent, target: HTMLElement, metadataContainerEl: HTMLElement): void {
  const direction = getNavigationDirection($event);
  if ($event.defaultPrevented || direction === 0) {
    return;
  }

  const stops = getVisibleFocusStops(metadataContainerEl);
  const index = stops.indexOf(target);
  const adjacentStopEl = index === -1 ? undefined : stops[index + direction];
  if (!adjacentStopEl) {
    return;
  }

  // Between two of Obsidian's own stops, Obsidian's own handling stays, and so does its multi-row selection.
  if (!isNestedStop(target) && (!isNestedStop(adjacentStopEl) || metadataContainerEl.querySelector('.metadata-property.is-selected'))) {
    return;
  }

  consume($event);
  adjacentStopEl.focus();
}

function hasModifier($event: KeyboardEvent): boolean {
  return $event.ctrlKey || $event.metaKey || $event.altKey;
}

function isLeftKey(key: string): boolean {
  return key === 'ArrowLeft' || key === 'h';
}

function isNestedAddButton(el: HTMLElement): boolean {
  return el.hasClass('nested-properties-add-property') || el.hasClass('nested-properties-add-item');
}

function isNestedStop(el: HTMLElement): boolean {
  return isNestedAddButton(el) || !!el.parentElement?.closest(NESTED_CONTAINER_SELECTOR);
}

// Obsidian's own remove keys: Delete, and Cmd+Backspace on macOS.
function isRemoveKey($event: KeyboardEvent): boolean {
  const isUnmodified = !$event.ctrlKey && !$event.altKey && !$event.shiftKey;
  return $event.key === 'Delete'
    ? isUnmodified && !$event.metaKey
    : Platform.isMacOS && $event.key === 'Backspace' && $event.metaKey && isUnmodified;
}
