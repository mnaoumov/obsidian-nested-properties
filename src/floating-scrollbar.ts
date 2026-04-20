import {
  App,
  Component
} from 'obsidian';
import { AllWindowsEventHandler } from 'obsidian-dev-utils/obsidian/components/all-windows-event-handler';

const ARROW_SCROLL_PX = 40;
const MIN_THUMB_WIDTH_PX = 30;
const SCROLLBAR_HIT_ZONE_PX = 16;

const ROOT_PROPERTY_SELECTOR =
  '.metadata-property:not(.nested-properties-container .metadata-property):has(> .metadata-property-value > .nested-properties-container):not(.is-collapsed)';

export class FloatingScrollbar extends Component {
  private activeEl: HTMLElement | null = null;
  private thumb: HTMLDivElement | null = null;
  private track: HTMLDivElement | null = null;

  public constructor(private readonly app: App) {
    super();
  }

  public override onload(): void {
    this.track = createDiv('nested-properties-floating-scrollbar');
    this.thumb = this.track.createDiv('nested-properties-floating-scrollbar-thumb');
    activeDocument.body.appendChild(this.track);

    this.registerDomEvent(this.track, 'wheel', (e) => {
      if (!this.activeEl || this.activeEl.scrollWidth <= this.activeEl.clientWidth) {
        return;
      }
      const delta = e.deltaX || e.deltaY;
      this.activeEl.scrollLeft += delta;
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });

    this.registerDomEvent(this.track, 'mousedown', (e) => {
      this.handleTrackMousedown(e);
    });

    const allWindowsEventHandler = new AllWindowsEventHandler(this.app, this);
    allWindowsEventHandler.registerAllDocumentsDomEvent('keydown', (e) => {
      if (!this.activeEl || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) {
        return;
      }
      if (
        activeDocument.activeElement instanceof HTMLInputElement
        || activeDocument.activeElement instanceof HTMLTextAreaElement
        || (activeDocument.activeElement instanceof HTMLElement && activeDocument.activeElement.isContentEditable)
      ) {
        return;
      }
      this.activeEl.scrollLeft += e.key === 'ArrowLeft' ? -ARROW_SCROLL_PX : ARROW_SCROLL_PX;
      e.preventDefault();
    });

    allWindowsEventHandler.registerAllDocumentsDomEvent('scroll', () => {
      this.update();
    }, true);
    allWindowsEventHandler.registerAllDocumentsDomEvent('wheel', (e) => {
      this.handleNativeScrollbarWheel(e);
    }, { capture: true, passive: false });
    allWindowsEventHandler.registerAllDocumentsDomEvent('mousemove', (e) => {
      this.handleNativeScrollbarCursor(e);
    });
    allWindowsEventHandler.registerAllWindowsHandler(() => {
      this.update();
    });
  }

  public override onunload(): void {
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

    const statusBar = activeDocument.querySelector('.status-bar');
    const bottomOffset = statusBar instanceof HTMLElement ? statusBar.offsetHeight : 0;
    const visibleBottom = activeWindow.innerHeight - bottomOffset;

    let best: HTMLElement | null = null;
    for (const el of activeDocument.querySelectorAll<HTMLElement>(ROOT_PROPERTY_SELECTOR)) {
      if (el.scrollWidth <= el.clientWidth) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.bottom > visibleBottom && rect.top < visibleBottom) {
        best = el;
        break;
      }
    }

    if (best !== this.activeEl) {
      if (this.activeEl) {
        this.activeEl.removeEventListener('scroll', this.syncThumb);
      }
      this.activeEl = best;
      if (this.activeEl) {
        this.activeEl.addEventListener('scroll', this.syncThumb);
      }
    }

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

  private handleNativeScrollbarCursor(e: MouseEvent): void {
    const target = e.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const propEl = target.closest<HTMLElement>(ROOT_PROPERTY_SELECTOR);
    if (!propEl || propEl.scrollWidth <= propEl.clientWidth) {
      return;
    }
    propEl.classList.toggle('nested-properties-ew-resize', isNearScrollbar(propEl, e));
  }

  private handleNativeScrollbarWheel(e: WheelEvent): void {
    const propEl = findScrollbarTarget(e);
    if (!propEl) {
      return;
    }
    const delta = e.deltaX || e.deltaY;
    propEl.scrollLeft += delta;
    e.preventDefault();
    e.stopPropagation();
  }

  private handleTrackMousedown(e: MouseEvent): void {
    if (!this.activeEl || !this.track) {
      return;
    }
    e.preventDefault();
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

    scrollToRatio(toRatio(e));
    activeDocument.addEventListener('mousemove', onMouseMove);
    activeDocument.addEventListener('mouseup', onMouseUp);
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
}

function findScrollbarTarget(e: MouseEvent): HTMLElement | null {
  const target = e.target;
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const propEl = target.closest<HTMLElement>(ROOT_PROPERTY_SELECTOR);
  if (!propEl || propEl.scrollWidth <= propEl.clientWidth) {
    return null;
  }
  if (!isNearScrollbar(propEl, e)) {
    return null;
  }
  return propEl;
}

function isNearScrollbar(el: HTMLElement, e: MouseEvent): boolean {
  const rect = el.getBoundingClientRect();
  return e.clientY >= rect.bottom - SCROLLBAR_HIT_ZONE_PX && e.clientY <= rect.bottom;
}
