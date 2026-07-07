/**
 * Shared modal-overlay controller for bottom sheets and fullscreen viewers.
 *
 * Generalises the dialog behaviour BlogSearch already implements inline
 * (focus save/restore, Tab trap, Escape, body scroll lock) so every new
 * overlay ships the same accessibility contract:
 *
 * - closed overlays are `hidden` + `inert` (out of the tab order and the
 *   accessibility tree)
 * - Escape closes; Tab wraps within the panel
 * - focus moves into the panel on open and back to the trigger on close
 * - `.is-open` is toggled a frame after unhiding so CSS transforms can
 *   animate; close waits for the transition unless reduced motion is set
 *
 * Markup contract: the root carries role="dialog" aria-modal="true" and an
 * aria-label(ledby), starts with `hidden`, and contains the focusable panel.
 * Elements with [data-overlay-close] inside the root close it (backdrops,
 * close buttons).
 */

interface OverlayOptions {
  root: HTMLElement;
  /** Focus-trap boundary; defaults to root. */
  panel?: HTMLElement;
  /** Receives focus on open; defaults to the first focusable in the panel. */
  initialFocus?: () => HTMLElement | null;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface OverlayController {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
}

const OPEN_CLASS = 'is-open';
const CLOSE_FALLBACK_MS = 400;

function focusables(scope: HTMLElement): HTMLElement[] {
  const nodes = scope.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]):not([hidden]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  return Array.prototype.filter.call(nodes, (el: HTMLElement) => {
    return el.offsetParent !== null && !el.hasAttribute('hidden');
  });
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function createOverlay(opts: OverlayOptions): OverlayController {
  const root = opts.root;
  const panel = opts.panel || root;
  let lastFocus: Element | null = null;
  let closeTimer: number | undefined;

  root.setAttribute('inert', '');

  function isOpen(): boolean {
    return !root.hasAttribute('hidden');
  }

  function onKeydown(e: KeyboardEvent): void {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      const f = focusables(panel);
      if (!f.length) {
        e.preventDefault();
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function open(): void {
    if (isOpen()) return;
    window.clearTimeout(closeTimer);
    lastFocus = document.activeElement;
    root.removeAttribute('hidden');
    root.removeAttribute('inert');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeydown, true);
    // Class lands a frame after unhiding so transform transitions run.
    requestAnimationFrame(() => {
      root.classList.add(OPEN_CLASS);
      const target = (opts.initialFocus && opts.initialFocus()) || focusables(panel)[0] || panel;
      target.focus();
    });
    if (opts.onOpen) opts.onOpen();
  }

  function finishClose(): void {
    root.setAttribute('hidden', '');
    root.setAttribute('inert', '');
    if (lastFocus && (lastFocus as HTMLElement).focus) (lastFocus as HTMLElement).focus();
  }

  function close(): void {
    if (!isOpen()) return;
    root.classList.remove(OPEN_CLASS);
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKeydown, true);
    if (reducedMotion()) {
      finishClose();
    } else {
      // Wait for the sheet's transform transition; fall back on a timer so a
      // missing transition can never leave the overlay stuck half-closed.
      let done = false;
      const settle = () => {
        if (done) return;
        done = true;
        root.removeEventListener('transitionend', settle);
        finishClose();
      };
      root.addEventListener('transitionend', settle);
      closeTimer = window.setTimeout(settle, CLOSE_FALLBACK_MS);
    }
    if (opts.onClose) opts.onClose();
  }

  root.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-overlay-close]');
    if (target && root.contains(target)) close();
  });

  return { open, close, isOpen };
}
