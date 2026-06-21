import type { App } from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { App as AppCls } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

import { FloatingScrollbarComponent } from './floating-scrollbar.ts';

interface ElementMetrics {
  clientWidth?: number;
  rect?: Partial<DOMRect>;
  scrollLeft?: number;
  scrollWidth?: number;
}

interface ObsidianDevUtilsStateHolder {
  obsidianDevUtilsState: Partial<Record<string, unknown>>;
}

interface ScrollbarInternals {
  syncThumb(): void;
}

const VIEWPORT_HEIGHT_PX = 800;

const loadedScrollbars: FloatingScrollbarComponent[] = [];

function applyMetrics(el: HTMLElement, metrics?: ElementMetrics): void {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: metrics?.clientWidth ?? DEFAULT_CLIENT_WIDTH });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: metrics?.scrollWidth ?? DEFAULT_SCROLL_WIDTH });
  el.scrollLeft = metrics?.scrollLeft ?? 0;
  const rect = metrics?.rect ?? DEFAULT_RECT;
  el.getBoundingClientRect = (): DOMRect => {
    return castTo<DOMRect>({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      ...rect
    });
  };
}

function createApp(): App {
  const appMock = AppCls.createConfigured__();
  // Seed the shared dev-utils state on the app, mirroring the sibling plugin tests.
  // The real `AllWindowsEventComponent` added by the component under test reads it via
  // `getObsidianDevUtilsState`, so seeding lets the real component run instead of a mock.
  castTo<ObsidianDevUtilsStateHolder>(appMock).obsidianDevUtilsState = {};
  return appMock.asOriginalType__();
}

function createPropertyEl(metrics?: ElementMetrics): HTMLElement {
  const prop = activeDocument.createElement('div');
  prop.className = 'metadata-property';
  const value = activeDocument.createElement('div');
  value.className = 'metadata-property-value';
  const nested = activeDocument.createElement('div');
  nested.className = 'nested-properties-container';
  value.appendChild(nested);
  prop.appendChild(value);
  activeDocument.body.appendChild(prop);
  applyMetrics(prop, metrics);
  return prop;
}

function createScrollbar(app: App): FloatingScrollbarComponent {
  const scrollbar = new FloatingScrollbarComponent(app);
  loadedScrollbars.push(scrollbar);
  scrollbar.load();
  return scrollbar;
}

const DEFAULT_CLIENT_WIDTH = 100;
const DEFAULT_SCROLL_WIDTH = 100;
const DEFAULT_RECT: Partial<DOMRect> = { bottom: 850, left: 0, top: 750, width: 100 };

describe('FloatingScrollbar', () => {
  let app: App;
  let scrollbar: FloatingScrollbarComponent;

  beforeEach(() => {
    Object.defineProperty(activeWindow, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT_PX });
    activeDocument.body.innerHTML = '';
    app = createApp();
    scrollbar = createScrollbar(app);
  });

  afterEach(() => {
    while (loadedScrollbars.length > 0) {
      loadedScrollbars.pop()?.unload();
    }
    activeDocument.body.innerHTML = '';
  });

  describe('onload', () => {
    it('should create track and thumb elements', () => {
      const track = getTrack();
      const thumb = track.querySelector('.nested-properties-floating-scrollbar-thumb');

      expect(track).not.toBeNull();
      expect(thumb).not.toBeNull();
      expect(track.parentElement).toBe(activeDocument.body);
    });

    it('should register all event handlers', () => {
      // Driving a real `wheel` event through the registered track handler proves the wiring.
      // The handler scrolls the active element, which is the observable effect we assert on.
      // We do not capture the registered callback into an array.
      const activeEl = createPropertyEl({ scrollLeft: 0, scrollWidth: 200 });
      scrollbar.update();
      const track = getTrack();

      track.dispatchEvent(new WheelEvent('wheel', { cancelable: true, deltaY: 25 }));

      expect(activeEl.scrollLeft).toBe(25);
    });
  });

  describe('onunload', () => {
    it('should clean up track and thumb', () => {
      const track = getTrack();

      scrollbar.unload();

      expect(track.parentElement).toBeNull();
    });

    it('should remove scroll listener from activeEl', () => {
      const activeEl = createPropertyEl({ clientWidth: 100, scrollLeft: 50, scrollWidth: 200 });
      const track = getTrack();
      Object.defineProperty(track, 'clientWidth', { configurable: true, value: 200 });
      scrollbar.update();

      const thumb = getThumb();
      // While loaded, the component's scroll listener (syncThumb) updates the thumb on every scroll.
      thumb.style.removeProperty('--thumb-left');
      activeEl.dispatchEvent(new Event('scroll'));
      expect(thumb.style.getPropertyValue('--thumb-left')).not.toBe('');

      // After unload, the component must have removed its scroll listener.
      // So a subsequent scroll no longer updates the (now-detached) thumb.
      scrollbar.unload();
      thumb.style.removeProperty('--thumb-left');
      activeEl.dispatchEvent(new Event('scroll'));

      expect(thumb.style.getPropertyValue('--thumb-left')).toBe('');
      expect(getTrackOrNull()).toBeNull();
    });

    it('should handle onunload when no activeEl exists', () => {
      const track = getTrack();

      scrollbar.unload();

      // Should not throw
      expect(track.parentElement).toBeNull();
    });
  });

  describe('update', () => {
    it('should return early when track is null', () => {
      scrollbar.unload();

      // No track, so update is a no-op and must not throw.
      scrollbar.update();

      expect(getTrackOrNull()).toBeNull();
    });

    it('should use status bar offset height', () => {
      const STATUS_BAR_HEIGHT_PX = 30;
      const statusBar = activeDocument.createElement('div');
      statusBar.className = 'status-bar';
      Object.defineProperty(statusBar, 'offsetHeight', { configurable: true, value: STATUS_BAR_HEIGHT_PX });
      activeDocument.body.appendChild(statusBar);

      scrollbar.update();

      // No matching property element, so the track is hidden; the status-bar offset path is exercised.
      expect(getTrack().classList.contains('is-visible')).toBe(false);
    });

    it('should use zero offset when no status bar', () => {
      scrollbar.update();

      expect(getTrack().classList.contains('is-visible')).toBe(false);
    });

    it('should skip elements with no overflow', () => {
      createPropertyEl({ clientWidth: 100, scrollWidth: 100 });

      scrollbar.update();

      expect(getTrack().classList.contains('is-visible')).toBe(false);
    });

    it('should find element partially below visible bottom', () => {
      createPropertyEl({
        clientWidth: 100,
        rect: { bottom: 850, left: 10, top: 750, width: 300 },
        scrollWidth: 200
      });

      scrollbar.update();

      const track = getTrack();
      expect(track.classList.contains('is-visible')).toBe(true);
      expect(track.style.getPropertyValue('--track-left')).toBe('10px');
      expect(track.style.getPropertyValue('--track-width')).toBe('300px');
    });

    it('should skip element fully above visible bottom', () => {
      createPropertyEl({
        clientWidth: 100,
        rect: { bottom: 700, top: 600 },
        scrollWidth: 200
      });

      scrollbar.update();

      expect(getTrack().classList.contains('is-visible')).toBe(false);
    });

    it('should remove activeEl when no best element found', () => {
      const el = createPropertyEl({
        clientWidth: 100,
        rect: { bottom: 850, left: 0, top: 750, width: 100 },
        scrollWidth: 200
      });
      scrollbar.update();

      // The element became the active element: scrolling it now syncs the thumb.
      const track = getTrack();
      expect(track.classList.contains('is-visible')).toBe(true);

      el.remove();
      scrollbar.update();

      expect(track.classList.contains('is-visible')).toBe(false);
    });

    it('should swap activeEl listeners when best changes', () => {
      const el1 = createPropertyEl({
        clientWidth: 100,
        rect: { bottom: 850, left: 0, top: 750, width: 100 },
        scrollLeft: 50,
        scrollWidth: 200
      });
      scrollbar.update();
      const track = getTrack();
      Object.defineProperty(track, 'clientWidth', { configurable: true, value: 200 });
      const thumb = getThumb();
      expect(track.style.getPropertyValue('--track-width')).toBe('100px');

      el1.remove();
      const el2 = createPropertyEl({
        clientWidth: 100,
        rect: { bottom: 850, left: 0, top: 750, width: 250 },
        scrollLeft: 50,
        scrollWidth: 200
      });
      scrollbar.update();
      expect(track.style.getPropertyValue('--track-width')).toBe('250px');

      // The old element's scroll listener was removed, so scrolling it no longer updates the thumb.
      thumb.style.removeProperty('--thumb-left');
      el1.dispatchEvent(new Event('scroll'));
      expect(thumb.style.getPropertyValue('--thumb-left')).toBe('');

      // The new element's scroll listener was added, so scrolling it updates the thumb.
      el2.dispatchEvent(new Event('scroll'));
      expect(thumb.style.getPropertyValue('--thumb-left')).not.toBe('');
    });
  });

  describe('track wheel handler', () => {
    it('should do nothing without activeEl', () => {
      const event = new WheelEvent('wheel', { cancelable: true, deltaY: 10 });

      getTrack().dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('should do nothing when activeEl is not scrollable', () => {
      createPropertyEl({ clientWidth: 100, scrollWidth: 100 });
      scrollbar.update();

      const event = new WheelEvent('wheel', { cancelable: true, deltaY: 10 });
      getTrack().dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('should scroll activeEl by deltaY', () => {
      const activeEl = createPropertyEl({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      scrollbar.update();

      const event = new WheelEvent('wheel', { cancelable: true, deltaX: 0, deltaY: 50 });
      getTrack().dispatchEvent(event);

      expect(activeEl.scrollLeft).toBe(50);
      expect(event.defaultPrevented).toBe(true);
    });

    it('should scroll activeEl by deltaX when present', () => {
      const activeEl = createPropertyEl({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      scrollbar.update();

      const event = new WheelEvent('wheel', { cancelable: true, deltaX: 30, deltaY: 50 });
      getTrack().dispatchEvent(event);

      expect(activeEl.scrollLeft).toBe(30);
    });
  });

  describe('keydown handler', () => {
    it('should do nothing without activeEl', () => {
      const event = new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowLeft' });

      activeDocument.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('should do nothing for non-arrow keys', () => {
      createPropertyEl({ clientWidth: 100, scrollWidth: 200 });
      scrollbar.update();

      const event = new KeyboardEvent('keydown', { cancelable: true, key: 'Enter' });
      activeDocument.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('should do nothing when an input is focused', () => {
      const activeEl = createPropertyEl({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      scrollbar.update();

      const input = activeDocument.createElement('input');
      activeDocument.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowLeft' });
      activeDocument.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(activeEl.scrollLeft).toBe(0);
    });

    it('should do nothing when a textarea is focused', () => {
      const activeEl = createPropertyEl({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      scrollbar.update();

      const textarea = activeDocument.createElement('textarea');
      activeDocument.body.appendChild(textarea);
      textarea.focus();

      const event = new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowLeft' });
      activeDocument.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(activeEl.scrollLeft).toBe(0);
    });

    it('should do nothing when a contentEditable element is focused', () => {
      const activeEl = createPropertyEl({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      scrollbar.update();

      const editableEl = activeDocument.createElement('div');
      // Jsdom does not compute `isContentEditable`, so make the real element report it directly.
      Object.defineProperty(editableEl, 'isContentEditable', { configurable: true, value: true });
      editableEl.tabIndex = 0;
      activeDocument.body.appendChild(editableEl);
      editableEl.focus();

      const event = new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowLeft' });
      activeDocument.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(activeEl.scrollLeft).toBe(0);
    });

    it('should scroll left on ArrowLeft', () => {
      const ARROW_SCROLL_PX = 40;
      const INITIAL_SCROLL_LEFT = 100;
      const activeEl = createPropertyEl({ clientWidth: 100, scrollLeft: INITIAL_SCROLL_LEFT, scrollWidth: 200 });
      scrollbar.update();

      const event = new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowLeft' });
      activeDocument.dispatchEvent(event);

      expect(activeEl.scrollLeft).toBe(INITIAL_SCROLL_LEFT - ARROW_SCROLL_PX);
      expect(event.defaultPrevented).toBe(true);
    });

    it('should scroll right on ArrowRight', () => {
      const ARROW_SCROLL_PX = 40;
      const activeEl = createPropertyEl({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      scrollbar.update();

      const event = new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowRight' });
      activeDocument.dispatchEvent(event);

      expect(activeEl.scrollLeft).toBe(ARROW_SCROLL_PX);
      expect(event.defaultPrevented).toBe(true);
    });

    it('should allow arrow keys when a non-editable HTMLElement is focused', () => {
      const ARROW_SCROLL_PX = 40;
      const activeEl = createPropertyEl({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      scrollbar.update();

      const nonEditableEl = activeDocument.createElement('div');
      nonEditableEl.tabIndex = 0;
      activeDocument.body.appendChild(nonEditableEl);
      nonEditableEl.focus();

      const event = new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowRight' });
      activeDocument.dispatchEvent(event);

      expect(activeEl.scrollLeft).toBe(ARROW_SCROLL_PX);
    });
  });

  describe('native scrollbar wheel', () => {
    it('should do nothing when target is not HTMLElement', () => {
      const event = new WheelEvent('wheel', { cancelable: true, deltaY: 10 });
      // Dispatching on the document with no element target keeps `e.target` as the document.
      activeDocument.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('should do nothing when no matching property element', () => {
      const target = activeDocument.createElement('div');
      activeDocument.body.appendChild(target);

      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true });
      target.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('should do nothing when property element is not scrollable', () => {
      const propEl = createPropertyEl({ clientWidth: 100, scrollWidth: 100 });
      const inner = activeDocument.createElement('span');
      propEl.appendChild(inner);

      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true });
      inner.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('should do nothing when not near scrollbar', () => {
      const propEl = createPropertyEl({
        clientWidth: 100,
        rect: { bottom: 500, left: 0, right: 100, top: 400 },
        scrollWidth: 200
      });
      const inner = activeDocument.createElement('span');
      propEl.appendChild(inner);

      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientY: 400 });
      inner.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('should scroll when near scrollbar', () => {
      const propEl = createPropertyEl({
        clientWidth: 100,
        rect: { bottom: 500, left: 0, right: 100, top: 400 },
        scrollLeft: 0,
        scrollWidth: 200
      });
      const inner = activeDocument.createElement('span');
      propEl.appendChild(inner);

      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientY: 495, deltaY: 20 });
      inner.dispatchEvent(event);

      expect(propEl.scrollLeft).toBe(20);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('native scrollbar cursor', () => {
    it('should do nothing when target is not HTMLElement', () => {
      const event = new MouseEvent('mousemove', { cancelable: true });
      activeDocument.dispatchEvent(event);

      // No error thrown, no class toggled.
      expect(getTrack().classList.contains('is-visible')).toBe(false);
    });

    it('should do nothing when no matching property element', () => {
      const target = activeDocument.createElement('div');
      activeDocument.body.appendChild(target);

      const event = new MouseEvent('mousemove', { bubbles: true });
      target.dispatchEvent(event);

      expect(target.classList.contains('nested-properties-ew-resize')).toBe(false);
    });

    it('should do nothing when property element is not scrollable', () => {
      const propEl = createPropertyEl({ clientWidth: 100, scrollWidth: 100 });
      const inner = activeDocument.createElement('span');
      propEl.appendChild(inner);

      const event = new MouseEvent('mousemove', { bubbles: true });
      inner.dispatchEvent(event);

      expect(propEl.classList.contains('nested-properties-ew-resize')).toBe(false);
    });

    it('should toggle ew-resize class based on proximity', () => {
      const propEl = createPropertyEl({
        clientWidth: 100,
        rect: { bottom: 500 },
        scrollWidth: 200
      });
      const inner = activeDocument.createElement('span');
      propEl.appendChild(inner);

      const event = new MouseEvent('mousemove', { bubbles: true, clientY: 495 });
      inner.dispatchEvent(event);

      expect(propEl.classList.contains('nested-properties-ew-resize')).toBe(true);
    });

    it('should toggle off when not near scrollbar', () => {
      const propEl = createPropertyEl({
        clientWidth: 100,
        rect: { bottom: 500 },
        scrollWidth: 200
      });
      const inner = activeDocument.createElement('span');
      propEl.appendChild(inner);

      const event = new MouseEvent('mousemove', { bubbles: true, clientY: 400 });
      inner.dispatchEvent(event);

      expect(propEl.classList.contains('nested-properties-ew-resize')).toBe(false);
    });
  });

  describe('track mousedown (drag)', () => {
    it('should do nothing without activeEl', () => {
      const event = new MouseEvent('mousedown', { cancelable: true });

      getTrack().dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('should scroll to clicked position and set up drag listeners', () => {
      const activeEl = createPropertyEl({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      scrollbar.update();
      const track = getTrack();
      track.getBoundingClientRect = (): DOMRect => castTo<DOMRect>({ left: 0, width: 200 });

      const event = new MouseEvent('mousedown', { cancelable: true, clientX: 100 });
      track.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      // Click at ratio 0.5 over a maxScroll of 100 => scrollLeft 50.
      expect(activeEl.scrollLeft).toBe(50);

      // Drag listeners were registered on the document: a mousemove now scrolls.
      activeDocument.dispatchEvent(new MouseEvent('mousemove', { clientX: 150 }));
      expect(activeEl.scrollLeft).toBe(75);
    });

    it('should scroll on mousemove during drag', () => {
      const activeEl = createPropertyEl({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      scrollbar.update();
      const track = getTrack();
      track.getBoundingClientRect = (): DOMRect => castTo<DOMRect>({ left: 0, width: 200 });

      track.dispatchEvent(new MouseEvent('mousedown', { cancelable: true, clientX: 100 }));
      activeDocument.dispatchEvent(new MouseEvent('mousemove', { clientX: 150 }));

      expect(activeEl.scrollLeft).toBe(75);
    });

    it('should remove drag listeners on mouseup', () => {
      const activeEl = createPropertyEl({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      scrollbar.update();
      const track = getTrack();
      track.getBoundingClientRect = (): DOMRect => castTo<DOMRect>({ left: 0, width: 200 });

      track.dispatchEvent(new MouseEvent('mousedown', { cancelable: true, clientX: 100 }));
      activeDocument.dispatchEvent(new MouseEvent('mouseup'));

      // After mouseup the drag listeners are removed, so a subsequent mousemove does not scroll.
      activeEl.scrollLeft = 10;
      activeDocument.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }));

      expect(activeEl.scrollLeft).toBe(10);
    });

    it('should clamp scroll ratio to valid range', () => {
      const MAX_SCROLL_PX = 100;
      const activeEl = createPropertyEl({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      scrollbar.update();
      const track = getTrack();
      track.getBoundingClientRect = (): DOMRect => castTo<DOMRect>({ left: 0, width: 200 });

      track.dispatchEvent(new MouseEvent('mousedown', { cancelable: true, clientX: -50 }));
      expect(activeEl.scrollLeft).toBe(0);

      track.dispatchEvent(new MouseEvent('mousedown', { cancelable: true, clientX: 500 }));
      expect(activeEl.scrollLeft).toBe(MAX_SCROLL_PX);
    });
  });

  describe('syncThumb', () => {
    it('should set thumb position based on scroll', () => {
      const activeEl = createPropertyEl({ clientWidth: 100, scrollLeft: 50, scrollWidth: 200 });
      const track = getTrack();
      Object.defineProperty(track, 'clientWidth', { configurable: true, value: 200 });
      const thumb = getThumb();

      scrollbar.update();

      expect(thumb.style.getPropertyValue('--thumb-width')).not.toBe('');
      expect(thumb.style.getPropertyValue('--thumb-left')).not.toBe('');
      expect(activeEl.scrollLeft).toBe(50);
    });

    it('should early return when activeEl is null', () => {
      // The component is loaded (track and thumb exist) but `update()` never ran, so `activeEl` is
      // Null. `syncThumb` must guard against that and leave the thumb untouched.
      const thumb = getThumb();
      thumb.style.removeProperty('--thumb-width');

      castTo<ScrollbarInternals>(scrollbar).syncThumb();

      expect(thumb.style.getPropertyValue('--thumb-width')).toBe('');
    });

    it('should early return when maxScroll is zero', () => {
      const activeEl = createPropertyEl({ clientWidth: 100, scrollWidth: 200 });
      scrollbar.update();
      const thumb = getThumb();

      // The active element no longer overflows (scrollWidth == clientWidth), so maxScroll is zero and
      // `syncThumb` must return before touching the thumb.
      Object.defineProperty(activeEl, 'scrollWidth', { configurable: true, value: 100 });
      thumb.style.removeProperty('--thumb-width');

      castTo<ScrollbarInternals>(scrollbar).syncThumb();

      expect(thumb.style.getPropertyValue('--thumb-width')).toBe('');
    });
  });

  describe('scroll and windows handler callbacks', () => {
    it('should call update on scroll event', () => {
      // A document scroll triggers update(), which makes the overflowing property element active.
      // Update() then shows the track.
      createPropertyEl({
        clientWidth: 100,
        rect: { bottom: 850, left: 0, top: 750, width: 100 },
        scrollWidth: 200
      });

      activeDocument.dispatchEvent(new Event('scroll'));

      expect(getTrack().classList.contains('is-visible')).toBe(true);
    });

    it('should call update on windows handler', () => {
      // The registered all-windows handler runs update() for the main window at load time.
      // Create the overflowing property element first, then load a fresh component.
      // Its windows handler then picks the element up and shows the track.
      scrollbar.unload();
      loadedScrollbars.pop();
      createPropertyEl({
        clientWidth: 100,
        rect: { bottom: 850, left: 0, top: 750, width: 100 },
        scrollWidth: 200
      });

      const freshScrollbar = createScrollbar(app);

      expect(freshScrollbar).toBeInstanceOf(FloatingScrollbarComponent);
      expect(getTrack().classList.contains('is-visible')).toBe(true);
    });
  });

  function getTrackOrNull(): HTMLDivElement | null {
    return activeDocument.body.querySelector<HTMLDivElement>('.nested-properties-floating-scrollbar');
  }

  function getTrack(): HTMLDivElement {
    const track = getTrackOrNull();
    if (!track) {
      throw new Error('Track element not found');
    }
    return track;
  }

  function getThumb(): HTMLDivElement {
    const thumb = getTrack().querySelector<HTMLDivElement>('.nested-properties-floating-scrollbar-thumb');
    if (!thumb) {
      throw new Error('Thumb element not found');
    }
    return thumb;
  }
});
