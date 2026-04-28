import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

interface CapturedCallbacks {
  docKeydown: ((e: Partial<KeyboardEvent>) => void) | null;
  docMousemove: ((e: Partial<MouseEvent>) => void) | null;
  docScroll: (() => void) | null;
  docWheel: ((e: Partial<WheelEvent>) => void) | null;
  trackMousedown: ((e: Partial<MouseEvent>) => void) | null;
  trackWheel: ((e: Partial<WheelEvent>) => void) | null;
  windowsHandler: (() => void) | null;
}

interface MockClassList {
  add: MockFn;
  remove: MockFn;
  toggle: MockFn;
}

interface MockDocumentBody {
  appendChild: MockFn;
}

interface MockDomElement {
  addEventListener: MockFn;
  appendChild: MockFn;
  classList: MockClassList;
  clientWidth: number;
  closest: MockFn;
  createDiv: MockFn;
  getBoundingClientRect: MockFn;
  isContentEditable: boolean;
  offsetHeight: number;
  remove: MockFn;
  removeEventListener: MockFn;
  scrollLeft: number;
  scrollWidth: number;
  style: MockStyle;
}

type MockFn = ReturnType<typeof vi.fn>;

interface MockStyle {
  setProperty: MockFn;
}

class MockHTMLElementClass {
  public isContentEditable = false;
}
class MockHTMLInputElementClass extends MockHTMLElementClass {}
class MockHTMLTextAreaElementClass extends MockHTMLElementClass {}

const hoisted = vi.hoisted(() => {
  type EventHandler = (...args: unknown[]) => void;

  const capturedCallbacks: CapturedCallbacks = {
    docKeydown: null,
    docMousemove: null,
    docScroll: null,
    docWheel: null,
    trackMousedown: null,
    trackWheel: null,
    windowsHandler: null
  };

  class ComponentBase {
    public register(_fn: () => void): void {
      /* Cleanup callback storage */
    }

    public registerDomEvent(_el: unknown, event: string, handler: EventHandler, _options?: unknown): void {
      if (event === 'wheel') {
        capturedCallbacks.trackWheel = handler;
      } else if (event === 'mousedown') {
        capturedCallbacks.trackMousedown = handler;
      }
    }
  }

  class AllWindowsEventHandlerBase {
    public registerAllDocumentsDomEvent(event: string, handler: EventHandler, _options?: unknown): void {
      if (event === 'keydown') {
        capturedCallbacks.docKeydown = handler;
      } else if (event === 'scroll') {
        capturedCallbacks.docScroll = handler;
      } else if (event === 'wheel') {
        capturedCallbacks.docWheel = handler;
      } else if (event === 'mousemove') {
        capturedCallbacks.docMousemove = handler;
      }
    }

    public registerAllWindowsHandler(handler: () => void): void {
      capturedCallbacks.windowsHandler = handler;
    }
  }

  return { AllWindowsEventHandlerBase, capturedCallbacks, ComponentBase };
});

vi.mock('obsidian', () => ({
  App: vi.fn(),
  Component: hoisted.ComponentBase
}));

vi.mock('obsidian-dev-utils/obsidian/components/all-windows-event-handler', () => ({
  AllWindowsEventHandler: hoisted.AllWindowsEventHandlerBase
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { FloatingScrollbar } from './floating-scrollbar.ts';

function createMockElement(overrides?: Partial<MockDomElement>): MockDomElement {
  const el: MockDomElement = {
    addEventListener: vi.fn(),
    appendChild: vi.fn(),
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      toggle: vi.fn()
    },
    clientWidth: 100,
    closest: vi.fn(() => null),
    createDiv: vi.fn(),
    getBoundingClientRect: vi.fn(() => ({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 100 })),
    isContentEditable: false,
    offsetHeight: 0,
    remove: vi.fn(),
    removeEventListener: vi.fn(),
    scrollLeft: 0,
    scrollWidth: 100,
    style: {
      setProperty: vi.fn()
    }
  };
  if (overrides) {
    Object.assign(el, overrides);
  }
  return el;
}

function createMockEvent(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    clientX: 0,
    clientY: 0,
    deltaX: 0,
    deltaY: 0,
    key: '',
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: null,
    ...overrides
  };
}

describe('FloatingScrollbar', () => {
  let scrollbar: FloatingScrollbar;
  let mockTrack: MockDomElement;
  let mockThumb: MockDomElement;
  let mockDocument: Record<string, unknown>;
  let documentEventListeners: Map<string, ((...args: never[]) => void)[]>;

  beforeEach(() => {
    vi.stubGlobal('HTMLElement', MockHTMLElementClass);
    vi.stubGlobal('HTMLInputElement', MockHTMLInputElementClass);
    vi.stubGlobal('HTMLTextAreaElement', MockHTMLTextAreaElementClass);

    mockThumb = createMockElement();
    mockTrack = createMockElement({
      createDiv: vi.fn(() => mockThumb)
    });

    vi.stubGlobal('createDiv', vi.fn(() => mockTrack));

    documentEventListeners = new Map();
    mockDocument = {
      activeElement: null,
      addEventListener: vi.fn((event: string, handler: (...args: never[]) => void) => {
        if (!documentEventListeners.has(event)) {
          documentEventListeners.set(event, []);
        }
        documentEventListeners.get(event)?.push(handler);
      }),
      body: { appendChild: vi.fn() },
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      removeEventListener: vi.fn((event: string, handler: (...args: never[]) => void) => {
        const handlers = documentEventListeners.get(event);
        if (handlers) {
          const idx = handlers.indexOf(handler);
          if (idx >= 0) {
            handlers.splice(idx, 1);
          }
        }
      })
    };
    vi.stubGlobal('activeDocument', mockDocument);
    vi.stubGlobal('activeWindow', { innerHeight: 800 });

    scrollbar = new FloatingScrollbar({} as never);

    hoisted.capturedCallbacks.docKeydown = null;
    hoisted.capturedCallbacks.docMousemove = null;
    hoisted.capturedCallbacks.docScroll = null;
    hoisted.capturedCallbacks.docWheel = null;
    hoisted.capturedCallbacks.trackMousedown = null;
    hoisted.capturedCallbacks.trackWheel = null;
    hoisted.capturedCallbacks.windowsHandler = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('onload', () => {
    it('should create track and thumb elements', () => {
      scrollbar.onload();

      expect(createDiv).toHaveBeenCalledWith('nested-properties-floating-scrollbar');
      expect(mockTrack.createDiv).toHaveBeenCalledWith('nested-properties-floating-scrollbar-thumb');
      expect((mockDocument['body'] as MockDocumentBody).appendChild).toHaveBeenCalledWith(mockTrack);
    });

    it('should register all event handlers', () => {
      scrollbar.onload();

      expect(hoisted.capturedCallbacks.trackWheel).not.toBeNull();
      expect(hoisted.capturedCallbacks.trackMousedown).not.toBeNull();
      expect(hoisted.capturedCallbacks.docKeydown).not.toBeNull();
      expect(hoisted.capturedCallbacks.docScroll).not.toBeNull();
      expect(hoisted.capturedCallbacks.docWheel).not.toBeNull();
      expect(hoisted.capturedCallbacks.docMousemove).not.toBeNull();
      expect(hoisted.capturedCallbacks.windowsHandler).not.toBeNull();
    });
  });

  describe('onunload', () => {
    it('should clean up track and thumb', () => {
      scrollbar.onload();
      scrollbar.onunload();

      expect(mockTrack.remove).toHaveBeenCalled();
    });

    it('should remove scroll listener from activeEl', () => {
      scrollbar.onload();

      const activeEl = createMockElement({ scrollWidth: 200 });
      setupActiveElement(activeEl);

      scrollbar.onunload();

      expect(activeEl.removeEventListener).toHaveBeenCalledWith('scroll', expect.anything());
    });

    it('should handle onunload when no activeEl exists', () => {
      scrollbar.onload();
      scrollbar.onunload();

      // Should not throw
      expect(mockTrack.remove).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should return early when track is null', () => {
      scrollbar.update();

      // No errors, no querySelector calls
      expect(mockDocument['querySelector']).not.toHaveBeenCalled();
    });

    it('should use status bar offset height', () => {
      scrollbar.onload();
      const statusBar = new MockHTMLElementClass();
      Object.assign(statusBar, { offsetHeight: 30 });
      (mockDocument['querySelector'] as ReturnType<typeof vi.fn>).mockReturnValue(statusBar);
      (mockDocument['querySelectorAll'] as ReturnType<typeof vi.fn>).mockReturnValue([]);

      scrollbar.update();

      expect(mockTrack.classList.remove).toHaveBeenCalledWith('is-visible');
    });

    it('should use zero offset when no status bar', () => {
      scrollbar.onload();
      (mockDocument['querySelector'] as ReturnType<typeof vi.fn>).mockReturnValue(null);
      (mockDocument['querySelectorAll'] as ReturnType<typeof vi.fn>).mockReturnValue([]);

      scrollbar.update();

      expect(mockTrack.classList.remove).toHaveBeenCalledWith('is-visible');
    });

    it('should skip elements with no overflow', () => {
      scrollbar.onload();
      (mockDocument['querySelector'] as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const noOverflow = createMockElement({ clientWidth: 100, scrollWidth: 100 });
      (mockDocument['querySelectorAll'] as ReturnType<typeof vi.fn>).mockReturnValue([noOverflow]);

      scrollbar.update();

      expect(mockTrack.classList.remove).toHaveBeenCalledWith('is-visible');
    });

    it('should find element partially below visible bottom', () => {
      scrollbar.onload();
      (mockDocument['querySelector'] as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const overflowEl = createMockElement({ clientWidth: 100, scrollWidth: 200 });
      overflowEl.getBoundingClientRect.mockReturnValue({ bottom: 850, left: 10, top: 750, width: 300 });
      (mockDocument['querySelectorAll'] as ReturnType<typeof vi.fn>).mockReturnValue([overflowEl]);

      scrollbar.update();

      expect(mockTrack.classList.add).toHaveBeenCalledWith('is-visible');
      expect(mockTrack.style.setProperty).toHaveBeenCalledWith('--track-left', '10px');
      expect(mockTrack.style.setProperty).toHaveBeenCalledWith('--track-width', '300px');
    });

    it('should skip element fully above visible bottom', () => {
      scrollbar.onload();
      (mockDocument['querySelector'] as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const el = createMockElement({ clientWidth: 100, scrollWidth: 200 });
      el.getBoundingClientRect.mockReturnValue({ bottom: 700, top: 600 });
      (mockDocument['querySelectorAll'] as ReturnType<typeof vi.fn>).mockReturnValue([el]);

      scrollbar.update();

      expect(mockTrack.classList.remove).toHaveBeenCalledWith('is-visible');
    });

    it('should remove activeEl when no best element found', () => {
      scrollbar.onload();
      (mockDocument['querySelector'] as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const el = createMockElement({ clientWidth: 100, scrollWidth: 200 });
      el.getBoundingClientRect.mockReturnValue({ bottom: 850, left: 0, top: 750, width: 100 });
      (mockDocument['querySelectorAll'] as ReturnType<typeof vi.fn>).mockReturnValue([el]);
      scrollbar.update();

      expect(el.addEventListener).toHaveBeenCalledWith('scroll', expect.anything());

      (mockDocument['querySelectorAll'] as ReturnType<typeof vi.fn>).mockReturnValue([]);
      scrollbar.update();

      expect(el.removeEventListener).toHaveBeenCalledWith('scroll', expect.anything());
      expect(mockTrack.classList.remove).toHaveBeenCalledWith('is-visible');
    });

    it('should swap activeEl listeners when best changes', () => {
      scrollbar.onload();
      (mockDocument['querySelector'] as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const el1 = createMockElement({ clientWidth: 100, scrollWidth: 200 });
      el1.getBoundingClientRect.mockReturnValue({ bottom: 850, left: 0, top: 750, width: 100 });
      (mockDocument['querySelectorAll'] as ReturnType<typeof vi.fn>).mockReturnValue([el1]);
      scrollbar.update();

      expect(el1.addEventListener).toHaveBeenCalledWith('scroll', expect.anything());

      const el2 = createMockElement({ clientWidth: 100, scrollWidth: 200 });
      el2.getBoundingClientRect.mockReturnValue({ bottom: 850, left: 0, top: 750, width: 100 });
      (mockDocument['querySelectorAll'] as ReturnType<typeof vi.fn>).mockReturnValue([el2]);
      scrollbar.update();

      expect(el1.removeEventListener).toHaveBeenCalledWith('scroll', expect.anything());
      expect(el2.addEventListener).toHaveBeenCalledWith('scroll', expect.anything());
    });
  });

  describe('track wheel handler', () => {
    it('should do nothing without activeEl', () => {
      scrollbar.onload();
      const event = createMockEvent({ deltaY: 10 });

      hoisted.capturedCallbacks.trackWheel?.(event);

      expect(event['preventDefault']).not.toHaveBeenCalled();
    });

    it('should do nothing when activeEl is not scrollable', () => {
      scrollbar.onload();
      const activeEl = createMockElement({ clientWidth: 100, scrollWidth: 100 });
      setupActiveElement(activeEl);

      const event = createMockEvent({ deltaY: 10 });
      hoisted.capturedCallbacks.trackWheel?.(event);

      expect(event['preventDefault']).not.toHaveBeenCalled();
    });

    it('should scroll activeEl by deltaY', () => {
      scrollbar.onload();
      const activeEl = createMockElement({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      setupActiveElement(activeEl);

      const event = createMockEvent({ deltaX: 0, deltaY: 50 });
      hoisted.capturedCallbacks.trackWheel?.(event);

      expect(activeEl.scrollLeft).toBe(50);
      expect(event['preventDefault']).toHaveBeenCalled();
      expect(event['stopPropagation']).toHaveBeenCalled();
    });

    it('should scroll activeEl by deltaX when present', () => {
      scrollbar.onload();
      const activeEl = createMockElement({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      setupActiveElement(activeEl);

      const event = createMockEvent({ deltaX: 30, deltaY: 50 });
      hoisted.capturedCallbacks.trackWheel?.(event);

      expect(activeEl.scrollLeft).toBe(30);
    });
  });

  describe('keydown handler', () => {
    it('should do nothing without activeEl', () => {
      scrollbar.onload();
      const event = createMockEvent({ key: 'ArrowLeft' });

      hoisted.capturedCallbacks.docKeydown?.(event);

      expect(event['preventDefault']).not.toHaveBeenCalled();
    });

    it('should do nothing for non-arrow keys', () => {
      scrollbar.onload();
      const activeEl = createMockElement({ clientWidth: 100, scrollWidth: 200 });
      setupActiveElement(activeEl);

      const event = createMockEvent({ key: 'Enter' });
      hoisted.capturedCallbacks.docKeydown?.(event);

      expect(event['preventDefault']).not.toHaveBeenCalled();
    });

    it('should do nothing when an input is focused', () => {
      scrollbar.onload();
      const activeEl = createMockElement({ clientWidth: 100, scrollWidth: 200 });
      setupActiveElement(activeEl);

      mockDocument['activeElement'] = new MockHTMLInputElementClass();
      const event = createMockEvent({ key: 'ArrowLeft' });
      hoisted.capturedCallbacks.docKeydown?.(event);

      expect(event['preventDefault']).not.toHaveBeenCalled();
    });

    it('should do nothing when a textarea is focused', () => {
      scrollbar.onload();
      const activeEl = createMockElement({ clientWidth: 100, scrollWidth: 200 });
      setupActiveElement(activeEl);

      mockDocument['activeElement'] = new MockHTMLTextAreaElementClass();
      const event = createMockEvent({ key: 'ArrowLeft' });
      hoisted.capturedCallbacks.docKeydown?.(event);

      expect(event['preventDefault']).not.toHaveBeenCalled();
    });

    it('should do nothing when a contentEditable element is focused', () => {
      scrollbar.onload();
      const activeEl = createMockElement({ clientWidth: 100, scrollWidth: 200 });
      setupActiveElement(activeEl);

      const editableEl = new MockHTMLElementClass();
      editableEl.isContentEditable = true;
      mockDocument['activeElement'] = editableEl;

      const event = createMockEvent({ key: 'ArrowLeft' });
      hoisted.capturedCallbacks.docKeydown?.(event);

      expect(event['preventDefault']).not.toHaveBeenCalled();
    });

    it('should scroll left on ArrowLeft', () => {
      scrollbar.onload();
      const activeEl = createMockElement({ clientWidth: 100, scrollLeft: 100, scrollWidth: 200 });
      setupActiveElement(activeEl);

      mockDocument['activeElement'] = null;
      const event = createMockEvent({ key: 'ArrowLeft' });
      hoisted.capturedCallbacks.docKeydown?.(event);

      expect(activeEl.scrollLeft).toBe(60);
      expect(event['preventDefault']).toHaveBeenCalled();
    });

    it('should scroll right on ArrowRight', () => {
      scrollbar.onload();
      const activeEl = createMockElement({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      setupActiveElement(activeEl);

      mockDocument['activeElement'] = null;
      const event = createMockEvent({ key: 'ArrowRight' });
      hoisted.capturedCallbacks.docKeydown?.(event);

      expect(activeEl.scrollLeft).toBe(40);
      expect(event['preventDefault']).toHaveBeenCalled();
    });

    it('should allow arrow keys when a non-editable HTMLElement is focused', () => {
      scrollbar.onload();
      const activeEl = createMockElement({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      setupActiveElement(activeEl);

      const nonEditableEl = new MockHTMLElementClass();
      nonEditableEl.isContentEditable = false;
      mockDocument['activeElement'] = nonEditableEl;

      const event = createMockEvent({ key: 'ArrowRight' });
      hoisted.capturedCallbacks.docKeydown?.(event);

      expect(activeEl.scrollLeft).toBe(40);
    });
  });

  describe('native scrollbar wheel', () => {
    it('should do nothing when target is not HTMLElement', () => {
      scrollbar.onload();
      const event = createMockEvent({ target: null });

      hoisted.capturedCallbacks.docWheel?.(event);

      expect(event['preventDefault']).not.toHaveBeenCalled();
    });

    it('should do nothing when no matching property element', () => {
      scrollbar.onload();
      const target = new MockHTMLElementClass();
      Object.assign(target, { closest: vi.fn(() => null) });

      const event = createMockEvent({ target });
      hoisted.capturedCallbacks.docWheel?.(event);

      expect(event['preventDefault']).not.toHaveBeenCalled();
    });

    it('should do nothing when property element is not scrollable', () => {
      scrollbar.onload();
      const propEl = createMockElement({ clientWidth: 100, scrollWidth: 100 });
      const target = new MockHTMLElementClass();
      Object.assign(target, { closest: vi.fn(() => propEl) });

      const event = createMockEvent({ target });
      hoisted.capturedCallbacks.docWheel?.(event);

      expect(event['preventDefault']).not.toHaveBeenCalled();
    });

    it('should do nothing when not near scrollbar', () => {
      scrollbar.onload();
      const propEl = createMockElement({ clientWidth: 100, scrollWidth: 200 });
      propEl.getBoundingClientRect.mockReturnValue({ bottom: 500, left: 0, right: 100, top: 400 });
      const target = new MockHTMLElementClass();
      Object.assign(target, { closest: vi.fn(() => propEl) });

      const event = createMockEvent({ clientY: 400, target });
      hoisted.capturedCallbacks.docWheel?.(event);

      expect(event['preventDefault']).not.toHaveBeenCalled();
    });

    it('should scroll when near scrollbar', () => {
      scrollbar.onload();
      const propEl = createMockElement({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      propEl.getBoundingClientRect.mockReturnValue({ bottom: 500, left: 0, right: 100, top: 400 });
      const target = new MockHTMLElementClass();
      Object.assign(target, { closest: vi.fn(() => propEl) });

      const event = createMockEvent({ clientY: 495, deltaY: 20, target });
      hoisted.capturedCallbacks.docWheel?.(event);

      expect(propEl.scrollLeft).toBe(20);
      expect(event['preventDefault']).toHaveBeenCalled();
      expect(event['stopPropagation']).toHaveBeenCalled();
    });
  });

  describe('native scrollbar cursor', () => {
    it('should do nothing when target is not HTMLElement', () => {
      scrollbar.onload();
      const event = createMockEvent({ target: null });

      hoisted.capturedCallbacks.docMousemove?.(event);

      // No error thrown
    });

    it('should do nothing when no matching property element', () => {
      scrollbar.onload();
      const target = new MockHTMLElementClass();
      Object.assign(target, { closest: vi.fn(() => null) });

      const event = createMockEvent({ target });
      hoisted.capturedCallbacks.docMousemove?.(event);
    });

    it('should do nothing when property element is not scrollable', () => {
      scrollbar.onload();
      const propEl = createMockElement({ clientWidth: 100, scrollWidth: 100 });
      const target = new MockHTMLElementClass();
      Object.assign(target, { closest: vi.fn(() => propEl) });

      const event = createMockEvent({ target });
      hoisted.capturedCallbacks.docMousemove?.(event);

      expect(propEl.classList.toggle).not.toHaveBeenCalled();
    });

    it('should toggle ew-resize class based on proximity', () => {
      scrollbar.onload();
      const propEl = createMockElement({ clientWidth: 100, scrollWidth: 200 });
      propEl.getBoundingClientRect.mockReturnValue({ bottom: 500 });
      const target = new MockHTMLElementClass();
      Object.assign(target, { closest: vi.fn(() => propEl) });

      const event = createMockEvent({ clientY: 495, target });
      hoisted.capturedCallbacks.docMousemove?.(event);

      expect(propEl.classList.toggle).toHaveBeenCalledWith('nested-properties-ew-resize', true);
    });

    it('should toggle off when not near scrollbar', () => {
      scrollbar.onload();
      const propEl = createMockElement({ clientWidth: 100, scrollWidth: 200 });
      propEl.getBoundingClientRect.mockReturnValue({ bottom: 500 });
      const target = new MockHTMLElementClass();
      Object.assign(target, { closest: vi.fn(() => propEl) });

      const event = createMockEvent({ clientY: 400, target });
      hoisted.capturedCallbacks.docMousemove?.(event);

      expect(propEl.classList.toggle).toHaveBeenCalledWith('nested-properties-ew-resize', false);
    });
  });

  describe('track mousedown (drag)', () => {
    it('should do nothing without activeEl', () => {
      scrollbar.onload();
      const event = createMockEvent();

      hoisted.capturedCallbacks.trackMousedown?.(event);

      expect(event['preventDefault']).not.toHaveBeenCalled();
    });

    it('should scroll to clicked position and set up drag listeners', () => {
      scrollbar.onload();
      const activeEl = createMockElement({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      setupActiveElement(activeEl);

      mockTrack.getBoundingClientRect.mockReturnValue({ left: 0, width: 200 });

      const event = createMockEvent({ clientX: 100 });
      hoisted.capturedCallbacks.trackMousedown?.(event);

      expect(event['preventDefault']).toHaveBeenCalled();
      expect(activeEl.scrollLeft).toBe(50);
      expect(mockDocument['addEventListener']).toHaveBeenCalledWith('mousemove', expect.anything());
      expect(mockDocument['addEventListener']).toHaveBeenCalledWith('mouseup', expect.anything());
    });

    it('should scroll on mousemove during drag', () => {
      scrollbar.onload();
      const activeEl = createMockElement({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      setupActiveElement(activeEl);

      mockTrack.getBoundingClientRect.mockReturnValue({ left: 0, width: 200 });

      const mousedownEvent = createMockEvent({ clientX: 100 });
      hoisted.capturedCallbacks.trackMousedown?.(mousedownEvent);

      const mousemoveHandlers = documentEventListeners.get('mousemove');
      expect(mousemoveHandlers).toBeDefined();
      const moveHandler = mousemoveHandlers?.at(0);
      moveHandler?.({ clientX: 150 } as never);

      expect(activeEl.scrollLeft).toBe(75);
    });

    it('should remove drag listeners on mouseup', () => {
      scrollbar.onload();
      const activeEl = createMockElement({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      setupActiveElement(activeEl);

      mockTrack.getBoundingClientRect.mockReturnValue({ left: 0, width: 200 });

      const mousedownEvent = createMockEvent({ clientX: 100 });
      hoisted.capturedCallbacks.trackMousedown?.(mousedownEvent);

      const mouseupHandlers = documentEventListeners.get('mouseup');
      expect(mouseupHandlers).toBeDefined();
      const upHandler = mouseupHandlers?.at(0);
      upHandler?.({} as never);

      expect(mockDocument['removeEventListener']).toHaveBeenCalledWith('mousemove', expect.anything());
      expect(mockDocument['removeEventListener']).toHaveBeenCalledWith('mouseup', expect.anything());
    });

    it('should clamp scroll ratio to valid range', () => {
      scrollbar.onload();
      const activeEl = createMockElement({ clientWidth: 100, scrollLeft: 0, scrollWidth: 200 });
      setupActiveElement(activeEl);

      mockTrack.getBoundingClientRect.mockReturnValue({ left: 0, width: 200 });

      const event = createMockEvent({ clientX: -50 });
      hoisted.capturedCallbacks.trackMousedown?.(event);

      expect(activeEl.scrollLeft).toBe(0);

      const event2 = createMockEvent({ clientX: 500 });
      hoisted.capturedCallbacks.trackMousedown?.(event2);

      expect(activeEl.scrollLeft).toBe(100);
    });
  });

  describe('syncThumb', () => {
    it('should set thumb position based on scroll', () => {
      scrollbar.onload();
      const activeEl = createMockElement({ clientWidth: 100, scrollLeft: 50, scrollWidth: 200 });
      setupActiveElement(activeEl);

      Object.defineProperty(mockTrack, 'clientWidth', { configurable: true, value: 200 });

      scrollbar.update();

      expect(mockThumb.style.setProperty).toHaveBeenCalledWith('--thumb-width', expect.any(String));
      expect(mockThumb.style.setProperty).toHaveBeenCalledWith('--thumb-left', expect.any(String));
    });

    it('should early return when track/thumb/activeEl is null', () => {
      scrollbar.onload();
      const activeEl = createMockElement({ clientWidth: 100, scrollWidth: 200 });
      setupActiveElement(activeEl);

      const syncThumbFn = getScrollListener(activeEl);
      scrollbar.onunload();
      mockThumb.style.setProperty.mockClear();

      syncThumbFn();

      expect(mockThumb.style.setProperty).not.toHaveBeenCalled();
    });

    it('should early return when maxScroll is zero', () => {
      scrollbar.onload();
      const activeEl = createMockElement({ clientWidth: 100, scrollWidth: 200 });
      setupActiveElement(activeEl);

      const syncThumbFn = getScrollListener(activeEl);
      activeEl.scrollWidth = 100;
      activeEl.clientWidth = 100;
      mockThumb.style.setProperty.mockClear();

      syncThumbFn();

      expect(mockThumb.style.setProperty).not.toHaveBeenCalled();
    });
  });

  describe('scroll and windows handler callbacks', () => {
    it('should call update on scroll event', () => {
      scrollbar.onload();
      const updateSpy = vi.spyOn(scrollbar, 'update');

      hoisted.capturedCallbacks.docScroll?.();

      expect(updateSpy).toHaveBeenCalled();
    });

    it('should call update on windows handler', () => {
      scrollbar.onload();
      const updateSpy = vi.spyOn(scrollbar, 'update');

      hoisted.capturedCallbacks.windowsHandler?.();

      expect(updateSpy).toHaveBeenCalled();
    });
  });

  function getScrollListener(activeEl: MockDomElement): () => void {
    const scrollCall = activeEl.addEventListener.mock.calls.find(
      (call: unknown[]) => call[0] === 'scroll'
    ) as [string, () => void] | undefined;
    if (!scrollCall) {
      throw new Error('No scroll listener found on activeEl');
    }
    return scrollCall[1];
  }

  function setupActiveElement(activeEl: MockDomElement): void {
    (mockDocument['querySelector'] as ReturnType<typeof vi.fn>).mockReturnValue(null);
    activeEl.getBoundingClientRect.mockReturnValue({ bottom: 850, left: 0, top: 750, width: 100 });
    (mockDocument['querySelectorAll'] as ReturnType<typeof vi.fn>).mockReturnValue([activeEl]);
    scrollbar.update();
  }
});
