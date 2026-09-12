import {
  App,
  Component
} from 'obsidian';
import { AllWindowsEventComponent } from 'obsidian-dev-utils/obsidian/components/all-windows-event-component';
import { getAllDomWindows } from 'obsidian-dev-utils/obsidian/workspace';

const ARROW_SCROLL_PX = 40;
const MIN_THUMB_WIDTH_PX = 30;
const SCROLLBAR_HIT_ZONE_PX = 16;

// Obsidian's Properties editor root. It is the smallest stable element that contains every property,
// And unlike a property row it does not come and go as rows collapse, overflow or are edited.
const PROPERTIES_CONTAINER_SELECTOR = '.metadata-container';

// A wheel listener that calls `preventDefault()` cannot be passive.
// Chromium makes every wheel event in the app wait for a non-passive wheel listener on a document.
// Scoping these to the Properties editor keeps that cost off the rest of the app.
const WHEEL_LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: false };

const ROOT_PROPERTY_SELECTOR = '.metadata-property:not(.nested-properties-container .metadata-property):has(> .metadata-property-value > .nested-properties-container):not(.is-collapsed)';

interface PendingUpdate {
  animationFrameId: number;
  ownerWindow: Window;
}

export class FloatingScrollbarComponent extends Component {
  private activeEl: HTMLElement | null = null;
  private pendingUpdate: null | PendingUpdate = null;
  private thumb: HTMLDivElement | null = null;
  private track: HTMLDivElement | null = null;
  private readonly wheelTargetEls = new Set<HTMLElement>();

  public constructor(private readonly app: App) {
    super();
  }

  public override onload(): void {
    super.onload();
    this.track = createDiv('nested-properties-floating-scrollbar');
    this.thumb = this.track.createDiv('nested-properties-floating-scrollbar-thumb');
    activeDocument.body.append(this.track);

    this.registerDomEvent(this.track, 'wheel', ($event) => {
      if (!this.activeEl || this.activeEl.scrollWidth <= this.activeEl.clientWidth) {
        return;
      }
      const delta = $event.deltaX || $event.deltaY;
      this.activeEl.scrollLeft += delta;
      $event.preventDefault();
      $event.stopPropagation();
    }, { passive: false });

    this.registerDomEvent(this.track, 'mousedown', ($event) => {
      this.handleTrackMousedown($event);
    });

    const allWindowsEventComponent = this.addChild(new AllWindowsEventComponent(this.app));
    allWindowsEventComponent.registerAllDocumentsDomEvent({
      callback: ($event) => {
        if (!this.activeEl || ($event.key !== 'ArrowLeft' && $event.key !== 'ArrowRight')) {
          return;
        }
        if (
          activeDocument.activeElement instanceof HTMLInputElement
          || activeDocument.activeElement instanceof HTMLTextAreaElement
          || (activeDocument.activeElement instanceof HTMLElement && activeDocument.activeElement.isContentEditable)
        ) {
          return;
        }
        this.activeEl.scrollLeft += $event.key === 'ArrowLeft' ? -ARROW_SCROLL_PX : ARROW_SCROLL_PX;
        $event.preventDefault();
      },
      type: 'keydown'
    });

    allWindowsEventComponent.registerAllDocumentsDomEvent({
      callback: () => {
        this.scheduleUpdate();
      },
      options: true,
      type: 'scroll'
    });
    allWindowsEventComponent.registerAllDocumentsDomEvent({
      callback: ($event) => {
        this.handleNativeScrollbarCursor($event);
      },
      type: 'mousemove'
    });
    allWindowsEventComponent.registerAllWindowsHandler(() => {
      this.update();
    });
  }

  public override onunload(): void {
    super.onunload();
    this.cancelPendingUpdate();
    this.syncWheelTargets(new Set());
    if (this.activeEl) {
      this.activeEl.removeEventListener('scroll', this.syncThumb);
      this.activeEl = null;
    }
    this.track?.remove();
    this.track = null;
    this.thumb = null;
  }

  public update(): void {
    if (!this.track) {
      return;
    }

    // Any queued frame is redundant now, and clearing it keeps the guard from sticking if the
    // Window that scheduled it never runs the callback.
    this.cancelPendingUpdate();
    this.syncWheelTargets(this.collectWheelTargets());

    // Selector matching costs far less than the layout the reads below force, so query first.
    // Most notes have no nested properties, and this returns before touching layout at all.
    const propertyEls = activeDocument.querySelectorAll<HTMLElement>(ROOT_PROPERTY_SELECTOR);
    if (propertyEls.length === 0) {
      this.setActiveEl(null);
      this.track.classList.remove('is-visible');
      return;
    }

    const statusBar = activeDocument.querySelector('.status-bar');
    const bottomOffset = statusBar instanceof HTMLElement ? statusBar.offsetHeight : 0;
    const visibleBottom = activeWindow.innerHeight - bottomOffset;

    let best: HTMLElement | null = null;
    for (const el of propertyEls) {
      if (el.scrollWidth <= el.clientWidth) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.bottom > visibleBottom && rect.top < visibleBottom) {
        best = el;
        break;
      }
    }

    this.setActiveEl(best);

    if (!this.activeEl) {
      this.track.classList.remove('is-visible');
      return;
    }

    const rect = this.activeEl.getBoundingClientRect();
    this.track.style.setProperty('--track-left', `${String(rect.left)}px`);
    this.track.style.setProperty('--track-width', `${String(rect.width)}px`);
    this.track.style.setProperty('--track-bottom', `${String(bottomOffset)}px`);
    this.track.classList.add('is-visible');
    this.syncThumb();
  }

  private cancelPendingUpdate(): void {
    if (!this.pendingUpdate) {
      return;
    }
    this.pendingUpdate.ownerWindow.cancelAnimationFrame(this.pendingUpdate.animationFrameId);
    this.pendingUpdate = null;
  }

  private collectWheelTargets(): ReadonlySet<HTMLElement> {
    // Every window, not just the active one: a Properties editor in a background pop-out has to keep
    // Working, and reconciling against only the active document would strip its listeners.
    // The active document is included outright, so this holds even before the workspace reports it.
    const documents = new Set<Document>([activeDocument]);
    for (const win of getAllDomWindows(this.app)) {
      documents.add(win.document);
    }
    const containerEls = new Set<HTMLElement>();
    for (const doc of documents) {
      for (const el of doc.querySelectorAll<HTMLElement>(PROPERTIES_CONTAINER_SELECTOR)) {
        containerEls.add(el);
      }
    }
    return containerEls;
  }

  private handleNativeScrollbarCursor($event: MouseEvent): void {
    const target = $event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const propertyEl = target.closest<HTMLElement>(ROOT_PROPERTY_SELECTOR);
    if (!propertyEl || propertyEl.scrollWidth <= propertyEl.clientWidth) {
      return;
    }
    propertyEl.classList.toggle('nested-properties-ew-resize', isNearScrollbar(propertyEl, $event));
  }

  private readonly handleNativeScrollbarWheel = ($event: WheelEvent): void => {
    const propertyEl = findScrollbarTarget($event);
    if (!propertyEl) {
      return;
    }
    const delta = $event.deltaX || $event.deltaY;
    propertyEl.scrollLeft += delta;
    $event.preventDefault();
    $event.stopPropagation();
  };

  private handleTrackMousedown($event: MouseEvent): void {
    if (!this.activeEl || !this.track) {
      return;
    }
    $event.preventDefault();
    const trackRect = this.track.getBoundingClientRect();
    const scrollTarget = this.activeEl;

    function toRatio(mouseEvent: MouseEvent): number {
      return (mouseEvent.clientX - trackRect.left) / trackRect.width;
    }

    function scrollToRatio(ratio: number): void {
      const maxScroll = scrollTarget.scrollWidth - scrollTarget.clientWidth;
      scrollTarget.scrollLeft = Math.max(0, Math.min(1, ratio)) * maxScroll;
    }

    function onMouseMove(moveEvent: MouseEvent): void {
      scrollToRatio(toRatio(moveEvent));
    }

    function onMouseUp(): void {
      activeDocument.removeEventListener('mousemove', onMouseMove);
      activeDocument.removeEventListener('mouseup', onMouseUp);
    }

    scrollToRatio(toRatio($event));
    activeDocument.addEventListener('mousemove', onMouseMove);
    activeDocument.addEventListener('mouseup', onMouseUp);
  }

  private scheduleUpdate(): void {
    // Split panes and nested scroll containers can each fire scroll in the same frame, and every
    // Update() forces layout. Only the frame that gets painted needs the work.
    if (this.pendingUpdate) {
      return;
    }
    // Owned by the window the scroll happened in, which is on screen and so will run the frame.
    const ownerWindow = activeWindow;
    this.pendingUpdate = {
      animationFrameId: ownerWindow.requestAnimationFrame(() => {
        this.pendingUpdate = null;
        this.update();
      }),
      ownerWindow
    };
  }

  private setActiveEl(el: HTMLElement | null): void {
    if (el === this.activeEl) {
      return;
    }
    this.activeEl?.removeEventListener('scroll', this.syncThumb);
    this.activeEl = el;
    this.activeEl?.addEventListener('scroll', this.syncThumb);
  }

  private readonly syncThumb = (): void => {
    if (!this.track || !this.thumb || !this.activeEl) {
      return;
    }
    const maxScroll = this.activeEl.scrollWidth - this.activeEl.clientWidth;
    if (maxScroll <= 0) {
      return;
    }
    const trackWidth = this.track.clientWidth;
    const thumbWidth = Math.max(MIN_THUMB_WIDTH_PX, (this.activeEl.clientWidth / this.activeEl.scrollWidth) * trackWidth);
    const thumbLeft = (this.activeEl.scrollLeft / maxScroll) * (trackWidth - thumbWidth);
    this.thumb.style.setProperty('--thumb-width', `${String(thumbWidth)}px`);
    this.thumb.style.setProperty('--thumb-left', `${String(thumbLeft)}px`);
  };

  private syncWheelTargets(wanted: ReadonlySet<HTMLElement>): void {
    for (const el of this.wheelTargetEls) {
      if (wanted.has(el)) {
        continue;
      }
      el.removeEventListener('wheel', this.handleNativeScrollbarWheel, WHEEL_LISTENER_OPTIONS);
      this.wheelTargetEls.delete(el);
    }
    for (const el of wanted) {
      if (this.wheelTargetEls.has(el)) {
        continue;
      }
      el.addEventListener('wheel', this.handleNativeScrollbarWheel, WHEEL_LISTENER_OPTIONS);
      this.wheelTargetEls.add(el);
    }
  }
}

function findScrollbarTarget($event: MouseEvent): HTMLElement | null {
  const target = $event.target;
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const propertyEl = target.closest<HTMLElement>(ROOT_PROPERTY_SELECTOR);
  if (!propertyEl || propertyEl.scrollWidth <= propertyEl.clientWidth) {
    return null;
  }
  if (!isNearScrollbar(propertyEl, $event)) {
    return null;
  }
  return propertyEl;
}

function isNearScrollbar(el: HTMLElement, $event: MouseEvent): boolean {
  const rect = el.getBoundingClientRect();
  return $event.clientY >= rect.bottom - SCROLLBAR_HIT_ZONE_PX && $event.clientY <= rect.bottom;
}
