import { Platform } from 'obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { NestedRowKeyboardActions } from './keyboard-navigation.ts';

import { NestedPropertyKeyboardNavigator } from './keyboard-navigation.ts';

interface KeyOptions {
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly isComposing?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
}

interface RowOptions {
  readonly isCollapsed?: boolean;
  readonly isComplex?: boolean;
}

let navigator: NestedPropertyKeyboardNavigator;
let metadataContainerEl: HTMLElement;

/**
 * Builds the shape the renderer produces inside Obsidian's Properties editor:
 *
 * - `title` (Obsidian's own plain row)
 * - `book` (Obsidian's own row, holding an object): `author`, `meta` (an object: `year`), Add property
 * - `list` (Obsidian's own row, holding a list): `0`, Add item
 * - Obsidian's own Add property button
 */
interface Tree {
  readonly addButtonEl: HTMLElement;
  readonly authorEl: HTMLElement;
  readonly bookAddPropertyEl: HTMLElement;
  readonly bookEl: HTMLElement;
  readonly listAddItemEl: HTMLElement;
  readonly listEl: HTMLElement;
  readonly listItemEl: HTMLElement;
  readonly metaEl: HTMLElement;
  readonly titleEl: HTMLElement;
  readonly yearEl: HTMLElement;
}

function addNestedContainer(rowEl: HTMLElement): HTMLElement {
  return getValueEl(rowEl).createDiv({ cls: 'nested-properties-container' });
}

function addRow(parentEl: HTMLElement, path: string, options: RowOptions = {}): HTMLElement {
  const rowEl = parentEl.createDiv({ attr: { 'data-path': path, 'tabindex': '0' }, cls: 'metadata-property' });
  if (options.isComplex) {
    rowEl.addClass('nested-properties-collapsible');
    rowEl.toggleClass('is-collapsed', options.isCollapsed ?? false);
  }
  rowEl.createDiv({ cls: 'metadata-property-key' });
  rowEl.createDiv({ cls: 'metadata-property-value' });
  return rowEl;
}

function buildTree(): Tree {
  const listEl = metadataContainerEl.createDiv({ cls: 'metadata-properties' });
  const titleEl = addRow(listEl, 'title');
  const bookEl = addRow(listEl, 'book', { isComplex: true });
  const bookContainerEl = addNestedContainer(bookEl);
  const authorEl = addRow(bookContainerEl, 'book.author');
  const metaEl = addRow(bookContainerEl, 'book.meta', { isCollapsed: true, isComplex: true });
  const yearEl = addRow(addNestedContainer(metaEl), 'book.meta.year');
  const bookAddPropertyEl = bookContainerEl.createDiv({ attr: { tabindex: '0' }, cls: 'nested-properties-add-property' });
  const listRowEl = addRow(listEl, 'list', { isComplex: true });
  const listContainerEl = addNestedContainer(listRowEl);
  const listItemEl = addRow(listContainerEl, 'list.0');
  const listAddItemEl = listContainerEl.createDiv({ attr: { tabindex: '0' }, cls: 'nested-properties-add-item' });
  const addButtonEl = metadataContainerEl.createDiv({ attr: { tabindex: '0' }, cls: 'metadata-add-button' });
  return {
    addButtonEl,
    authorEl,
    bookAddPropertyEl,
    bookEl,
    listAddItemEl,
    listEl: listRowEl,
    listItemEl,
    metaEl,
    titleEl,
    yearEl
  };
}

function getValueEl(rowEl: HTMLElement): HTMLElement {
  const valueEl = rowEl.querySelector<HTMLElement>(':scope > .metadata-property-value');
  if (!valueEl) {
    throw new Error('A row without a value element');
  }
  return valueEl;
}

function listener($event: KeyboardEvent): void {
  navigator.handleKeydown($event);
}

function press(targetEl: HTMLElement, key: string, options: KeyOptions = {}): KeyboardEvent {
  targetEl.focus();
  const $event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...options });
  targetEl.dispatchEvent($event);
  return $event;
}

function registerComplexRow(rowEl: HTMLElement): NestedRowKeyboardActions {
  const registered: NestedRowKeyboardActions = {
    setExpanded: vi.fn((isExpanded: boolean) => {
      rowEl.toggleClass('is-collapsed', !isExpanded);
    })
  };
  navigator.registerRow(rowEl, registered);
  return registered;
}

function registerSimpleRow(rowEl: HTMLElement): NestedRowKeyboardActions {
  const registered: NestedRowKeyboardActions = {
    focusValue: vi.fn(),
    remove: vi.fn()
  };
  navigator.registerRow(rowEl, registered);
  return registered;
}

beforeEach(() => {
  navigator = new NestedPropertyKeyboardNavigator();
  metadataContainerEl = activeDocument.body.createDiv({ cls: 'metadata-container' });
  activeDocument.addEventListener('keydown', listener, { capture: true });
});

afterEach(() => {
  activeDocument.removeEventListener('keydown', listener, { capture: true });
  metadataContainerEl.remove();
  vi.restoreAllMocks();
});

describe('NestedPropertyKeyboardNavigator', () => {
  describe('moving between rows', () => {
    it('should move down through the visible rows, skipping a collapsed object, and out of the tree', () => {
      const tree = buildTree();
      registerComplexRow(tree.metaEl);

      press(tree.authorEl, 'ArrowDown');
      expect(activeDocument.activeElement).toBe(tree.metaEl);

      press(tree.metaEl, 'j');
      expect(activeDocument.activeElement).toBe(tree.bookAddPropertyEl);

      press(tree.bookAddPropertyEl, 'Tab');
      expect(activeDocument.activeElement).toBe(tree.listEl);
    });

    it('should move up with ArrowUp, k and Shift+Tab', () => {
      const tree = buildTree();

      press(tree.listEl, 'ArrowUp');
      expect(activeDocument.activeElement).toBe(tree.bookAddPropertyEl);

      press(tree.bookAddPropertyEl, 'k');
      expect(activeDocument.activeElement).toBe(tree.metaEl);

      press(tree.metaEl, 'Tab', { shiftKey: true });
      expect(activeDocument.activeElement).toBe(tree.authorEl);

      press(tree.authorEl, 'ArrowUp');
      expect(activeDocument.activeElement).toBe(tree.bookEl);
    });

    it('should enter an expanded object from its own top-level row, and stop the event there', () => {
      const tree = buildTree();
      const rowListener = vi.fn();
      tree.bookEl.addEventListener('keydown', rowListener);

      const $event = press(tree.bookEl, 'ArrowDown');

      expect(activeDocument.activeElement).toBe(tree.authorEl);
      expect($event.defaultPrevented).toBe(true);
      expect(rowListener).not.toHaveBeenCalled();
    });

    it('should leave a move between two of Obsidian\'s own rows to Obsidian', () => {
      const tree = buildTree();

      const $event = press(tree.titleEl, 'ArrowDown');

      expect(activeDocument.activeElement).toBe(tree.titleEl);
      expect($event.defaultPrevented).toBe(false);
    });

    it('should leave a move out of the tree to Obsidian while several rows are selected', () => {
      const tree = buildTree();
      tree.titleEl.addClass('is-selected');
      tree.bookEl.addClass('is-selected');

      const $event = press(tree.bookEl, 'ArrowDown');

      expect($event.defaultPrevented).toBe(false);
    });

    it('should leave a move past the last stop to the browser', () => {
      const tree = buildTree();

      const $event = press(tree.addButtonEl, 'ArrowDown');

      expect($event.defaultPrevented).toBe(false);
    });

    it('should ignore a hidden row, and Shift with an arrow, and a modified key', () => {
      const tree = buildTree();

      expect(press(tree.yearEl, 'ArrowDown').defaultPrevented).toBe(false);
      expect(press(tree.authorEl, 'ArrowDown', { shiftKey: true }).defaultPrevented).toBe(false);
      expect(press(tree.authorEl, 'ArrowUp', { shiftKey: true }).defaultPrevented).toBe(false);
      expect(press(tree.authorEl, 'ArrowDown', { ctrlKey: true }).defaultPrevented).toBe(false);
      expect(press(tree.authorEl, 'x').defaultPrevented).toBe(false);
    });
  });

  describe('a nested row', () => {
    it('should focus a value with Enter, Space, ArrowRight and l, at its end with A and at its start with i', () => {
      const tree = buildTree();
      const actions = registerSimpleRow(tree.authorEl);

      for (const key of ['Enter', ' ', 'ArrowRight', 'l']) {
        press(tree.authorEl, key);
      }
      press(tree.authorEl, 'A', { shiftKey: true });
      press(tree.authorEl, 'i');

      expect(actions.focusValue).toHaveBeenNthCalledWith(1, 'both');
      expect(actions.focusValue).toHaveBeenNthCalledWith(4, 'both');
      expect(actions.focusValue).toHaveBeenNthCalledWith(5, 'end');
      expect(actions.focusValue).toHaveBeenNthCalledWith(6, 'start');
    });

    it('should expand an object with Enter and focus its first row', () => {
      const tree = buildTree();
      const actions = registerComplexRow(tree.metaEl);

      press(tree.metaEl, 'Enter');

      expect(actions.setExpanded).toHaveBeenCalledWith(true);
      expect(activeDocument.activeElement).toBe(tree.yearEl);
    });

    it('should expand an object that holds no nested container without moving the focus', () => {
      const tree = buildTree();
      getValueEl(tree.metaEl).empty();
      registerComplexRow(tree.metaEl);

      const $event = press(tree.metaEl, 'Enter');

      expect($event.defaultPrevented).toBe(true);
      expect(activeDocument.activeElement).toBe(tree.metaEl);
    });

    it('should leave Enter alone on a row with no value to focus', () => {
      const tree = buildTree();
      navigator.registerRow(tree.authorEl, {});

      expect(press(tree.authorEl, 'Enter').defaultPrevented).toBe(false);
    });

    it('should collapse an expanded object with ArrowLeft, then move to its parent', () => {
      const tree = buildTree();
      tree.metaEl.removeClass('is-collapsed');
      const actions = registerComplexRow(tree.metaEl);

      press(tree.metaEl, 'ArrowLeft');
      expect(actions.setExpanded).toHaveBeenCalledWith(false);
      expect(activeDocument.activeElement).toBe(tree.metaEl);

      press(tree.metaEl, 'h');
      expect(activeDocument.activeElement).toBe(tree.bookEl);
    });

    it('should move from a value row to its parent with ArrowLeft', () => {
      const tree = buildTree();
      tree.metaEl.removeClass('is-collapsed');
      registerSimpleRow(tree.yearEl);

      press(tree.yearEl, 'ArrowLeft');

      expect(activeDocument.activeElement).toBe(tree.metaEl);
    });

    it('should leave ArrowLeft alone on a row with no parent row', () => {
      const tree = buildTree();
      const orphanContainerEl = metadataContainerEl.createDiv({ cls: 'nested-properties-container' });
      orphanContainerEl.append(tree.authorEl);
      registerSimpleRow(tree.authorEl);

      expect(press(tree.authorEl, 'ArrowLeft').defaultPrevented).toBe(false);
    });

    it('should add a sibling with o through the parent\'s Add property or Add item', () => {
      const tree = buildTree();
      registerSimpleRow(tree.authorEl);
      registerSimpleRow(tree.listItemEl);
      const addPropertyClick = vi.fn();
      const addItemClick = vi.fn();
      tree.bookAddPropertyEl.addEventListener('click', addPropertyClick);
      tree.listAddItemEl.addEventListener('click', addItemClick);

      press(tree.authorEl, 'o');
      press(tree.listItemEl, 'o');

      expect(addPropertyClick).toHaveBeenCalledOnce();
      expect(addItemClick).toHaveBeenCalledOnce();
    });

    it('should leave o alone where the parent has no add button', () => {
      const tree = buildTree();
      tree.bookAddPropertyEl.remove();
      registerSimpleRow(tree.authorEl);

      expect(press(tree.authorEl, 'o').defaultPrevented).toBe(false);
    });

    it('should remove an entry with Delete', () => {
      const tree = buildTree();
      const actions = registerSimpleRow(tree.authorEl);

      const $event = press(tree.authorEl, 'Delete');

      expect(actions.remove).toHaveBeenCalledOnce();
      expect($event.defaultPrevented).toBe(true);
    });

    it('should leave Delete with a modifier, and Delete on a row that cannot be removed, alone', () => {
      const tree = buildTree();
      const actions = registerSimpleRow(tree.authorEl);
      registerComplexRow(tree.metaEl);

      expect(press(tree.authorEl, 'Delete', { shiftKey: true }).defaultPrevented).toBe(false);
      expect(press(tree.metaEl, 'Delete').defaultPrevented).toBe(false);
      expect(actions.remove).not.toHaveBeenCalled();
    });

    it('should remove an entry with Cmd+Backspace on macOS only', () => {
      const tree = buildTree();
      const actions = registerSimpleRow(tree.authorEl);
      const isMacOsSpy = vi.spyOn(Platform, 'isMacOS', 'get');

      isMacOsSpy.mockReturnValue(false);
      press(tree.authorEl, 'Backspace', { metaKey: true });
      expect(actions.remove).not.toHaveBeenCalled();

      isMacOsSpy.mockReturnValue(true);
      press(tree.authorEl, 'Backspace', { metaKey: true, shiftKey: true });
      press(tree.authorEl, 'Backspace');
      expect(actions.remove).not.toHaveBeenCalled();

      press(tree.authorEl, 'Backspace', { metaKey: true });
      expect(actions.remove).toHaveBeenCalledOnce();
    });

    it('should leave a modified key on a row to Obsidian', () => {
      const tree = buildTree();
      const actions = registerSimpleRow(tree.authorEl);

      expect(press(tree.authorEl, 'Enter', { altKey: true }).defaultPrevented).toBe(false);
      expect(press(tree.authorEl, 'Enter', { metaKey: true }).defaultPrevented).toBe(false);
      expect(actions.focusValue).not.toHaveBeenCalled();
    });
  });

  describe('a top-level object row', () => {
    it('should collapse an expanded row with ArrowLeft', () => {
      const tree = buildTree();
      const actions = registerComplexRow(tree.bookEl);

      const $event = press(tree.bookEl, 'ArrowLeft');

      expect(actions.setExpanded).toHaveBeenCalledWith(false);
      expect($event.defaultPrevented).toBe(true);
    });

    it('should leave ArrowLeft on a collapsed row, and Enter, to Obsidian', () => {
      const tree = buildTree();
      tree.bookEl.addClass('is-collapsed');
      const actions = registerComplexRow(tree.bookEl);

      expect(press(tree.bookEl, 'ArrowLeft').defaultPrevented).toBe(false);
      expect(press(tree.bookEl, 'Enter').defaultPrevented).toBe(false);
      expect(actions.setExpanded).not.toHaveBeenCalled();
    });

    it('should leave a row registered without setExpanded alone', () => {
      const tree = buildTree();
      navigator.registerRow(tree.titleEl, {});

      expect(press(tree.titleEl, 'ArrowLeft').defaultPrevented).toBe(false);
    });
  });

  describe('a nested add button', () => {
    it('should press Add property and Add item with Enter or Space', () => {
      const tree = buildTree();
      const addPropertyClick = vi.fn();
      const addItemClick = vi.fn();
      tree.bookAddPropertyEl.addEventListener('click', addPropertyClick);
      tree.listAddItemEl.addEventListener('click', addItemClick);

      press(tree.bookAddPropertyEl, 'Enter');
      press(tree.listAddItemEl, ' ');

      expect(addPropertyClick).toHaveBeenCalledOnce();
      expect(addItemClick).toHaveBeenCalledOnce();
    });

    it('should leave other keys and modified ones alone', () => {
      const tree = buildTree();

      expect(press(tree.bookAddPropertyEl, 'x').defaultPrevented).toBe(false);
      expect(press(tree.bookAddPropertyEl, 'Enter', { ctrlKey: true }).defaultPrevented).toBe(false);
    });
  });

  describe('what it ignores', () => {
    it('should ignore an event already handled, or one composing text', () => {
      const tree = buildTree();
      const actions = registerSimpleRow(tree.authorEl);

      tree.authorEl.focus();
      const handledEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' });
      handledEvent.preventDefault();
      tree.authorEl.dispatchEvent(handledEvent);
      press(tree.authorEl, 'Enter', { isComposing: true });

      expect(actions.focusValue).not.toHaveBeenCalled();
    });

    it('should ignore a key whose target is not a focus stop', () => {
      const tree = buildTree();
      const inputEl = getValueEl(tree.authorEl).createEl('input');

      expect(press(inputEl, 'ArrowDown').defaultPrevented).toBe(false);
    });

    it('should ignore a key whose target is not an element', () => {
      const $event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' });
      activeDocument.dispatchEvent($event);

      expect($event.defaultPrevented).toBe(false);
    });

    it('should ignore a Properties editor that holds no nested property', () => {
      const rowEl = addRow(metadataContainerEl, 'title');
      addRow(metadataContainerEl, 'link');

      expect(press(rowEl, 'ArrowDown').defaultPrevented).toBe(false);
    });

    it('should ignore a row outside a Properties editor', () => {
      const rowEl = activeDocument.body.createDiv({ attr: { tabindex: '0' }, cls: 'metadata-property' });

      expect(press(rowEl, 'ArrowDown').defaultPrevented).toBe(false);
      rowEl.remove();
    });
  });

  describe('focusRowByPath', () => {
    it('should focus a row, or its value when asked and it has one', () => {
      const tree = buildTree();
      const actions = registerSimpleRow(tree.authorEl);

      navigator.focusRowByPath({ path: 'book.meta', scopeEl: metadataContainerEl, shouldFocusValue: true });
      expect(activeDocument.activeElement).toBe(tree.metaEl);

      navigator.focusRowByPath({ path: 'book.author', scopeEl: metadataContainerEl, shouldFocusValue: false });
      expect(activeDocument.activeElement).toBe(tree.authorEl);
      expect(actions.focusValue).not.toHaveBeenCalled();

      navigator.focusRowByPath({ path: 'book.author', scopeEl: metadataContainerEl, shouldFocusValue: true });
      expect(actions.focusValue).toHaveBeenCalledWith('both');
    });

    it('should do nothing for a path that is not there', () => {
      const tree = buildTree();
      tree.titleEl.focus();

      navigator.focusRowByPath({ path: 'missing', scopeEl: metadataContainerEl, shouldFocusValue: false });

      expect(activeDocument.activeElement).toBe(tree.titleEl);
    });
  });
});
