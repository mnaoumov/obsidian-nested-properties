import type { Plugin } from './plugin.ts';

const ARROW_SCROLL_PX = 40;
const SCROLLBAR_HIT_ZONE_PX = 16;

const ROOT_PROPERTY_SELECTOR =
  '.metadata-property:not(.nested-properties-container .metadata-property):has(> .metadata-property-value > .nested-properties-container):not(.is-collapsed)';

let track: HTMLDivElement | null = null;
let thumb: HTMLDivElement | null = null;
let activeEl: HTMLElement | null = null;

export function initFloatingScrollbar(plugin: Plugin): void {
  track = createDiv('nested-properties-floating-scrollbar');
  thumb = track.createDiv('nested-properties-floating-scrollbar-thumb');
  document.body.appendChild(track);

  plugin.registerDomEvent(track, 'wheel', (e) => {
    if (!activeEl || activeEl.scrollWidth <= activeEl.clientWidth) {
      return;
    }
    const delta = e.deltaX || e.deltaY;
    activeEl.scrollLeft += delta;
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });

  plugin.registerDomEvent(track, 'mousedown', handleTrackMousedown);

  plugin.registerPopupDocumentDomEvent('keydown', (e) => {
    if (!activeEl || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) {
      return;
    }
    if (
      document.activeElement instanceof HTMLInputElement
      || document.activeElement instanceof HTMLTextAreaElement
      || (document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable)
    ) {
      return;
    }
    activeEl.scrollLeft += e.key === 'ArrowLeft' ? -ARROW_SCROLL_PX : ARROW_SCROLL_PX;
    e.preventDefault();
  });

  plugin.registerPopupDocumentDomEvent('scroll', updateFloatingScrollbar, true);
  plugin.registerPopupDocumentDomEvent('wheel', handleNativeScrollbarWheel, { capture: true, passive: false });
  plugin.registerPopupDocumentDomEvent('mousemove', handleNativeScrollbarCursor);
  plugin.registerPopupWindowDomEvent('resize', updateFloatingScrollbar);

  plugin.register(() => {
    if (activeEl) {
      activeEl.removeEventListener('scroll', syncThumb);
      activeEl = null;
    }
    track?.remove();
    track = null;
    thumb = null;
  });
}

export function updateFloatingScrollbar(): void {
  if (!track) {
    return;
  }

  const statusBar = document.querySelector('.status-bar');
  const bottomOffset = statusBar instanceof HTMLElement ? statusBar.offsetHeight : 0;
  const visibleBottom = window.innerHeight - bottomOffset;

  let best: HTMLElement | null = null;
  for (const el of document.querySelectorAll<HTMLElement>(ROOT_PROPERTY_SELECTOR)) {
    if (el.scrollWidth <= el.clientWidth) {
      continue;
    }
    const rect = el.getBoundingClientRect();
    if (rect.bottom > visibleBottom && rect.top < visibleBottom) {
      best = el;
      break;
    }
  }

  if (best !== activeEl) {
    if (activeEl) {
      activeEl.removeEventListener('scroll', syncThumb);
    }
    activeEl = best;
    if (activeEl) {
      activeEl.addEventListener('scroll', syncThumb);
    }
  }

  if (!activeEl) {
    track.classList.remove('is-visible');
    return;
  }

  const rect = activeEl.getBoundingClientRect();
  track.style.setProperty('--track-left', `${String(rect.left)}px`);
  track.style.setProperty('--track-width', `${String(rect.width)}px`);
  track.style.setProperty('--track-bottom', `${String(bottomOffset)}px`);
  track.classList.add('is-visible');
  syncThumb();
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

function handleNativeScrollbarCursor(e: MouseEvent): void {
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

function handleNativeScrollbarWheel(e: WheelEvent): void {
  const propEl = findScrollbarTarget(e);
  if (!propEl) {
    return;
  }
  const delta = e.deltaX || e.deltaY;
  propEl.scrollLeft += delta;
  e.preventDefault();
  e.stopPropagation();
}

function handleTrackMousedown(e: MouseEvent): void {
  if (!activeEl || !track) {
    return;
  }
  e.preventDefault();
  const trackRect = track.getBoundingClientRect();

  function toRatio(mouseEvent: MouseEvent): number {
    return (mouseEvent.clientX - trackRect.left) / trackRect.width;
  }

  function onMouseMove(moveEvent: MouseEvent): void {
    scrollToRatio(toRatio(moveEvent));
  }

  function onMouseUp(): void {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  scrollToRatio(toRatio(e));
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

function isNearScrollbar(el: HTMLElement, e: MouseEvent): boolean {
  const rect = el.getBoundingClientRect();
  return e.clientY >= rect.bottom - SCROLLBAR_HIT_ZONE_PX && e.clientY <= rect.bottom;
}

function scrollToRatio(ratio: number): void {
  if (!activeEl) {
    return;
  }
  const maxScroll = activeEl.scrollWidth - activeEl.clientWidth;
  activeEl.scrollLeft = Math.max(0, Math.min(1, ratio)) * maxScroll;
}

function syncThumb(): void {
  if (!track || !thumb || !activeEl) {
    return;
  }
  const maxScroll = activeEl.scrollWidth - activeEl.clientWidth;
  if (maxScroll <= 0) {
    return;
  }
  const trackWidth = track.clientWidth;
  const MIN_THUMB_WIDTH_PX = 30;
  const thumbWidth = Math.max(MIN_THUMB_WIDTH_PX, (activeEl.clientWidth / activeEl.scrollWidth) * trackWidth);
  const thumbLeft = (activeEl.scrollLeft / maxScroll) * (trackWidth - thumbWidth);
  thumb.style.setProperty('--thumb-width', `${String(thumbWidth)}px`);
  thumb.style.setProperty('--thumb-left', `${String(thumbLeft)}px`);
}
