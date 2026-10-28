"use client";

import { useCallback, useEffect, useEffectEvent, useRef } from "react";

import { UNAUTHORIZED_EVENT } from "@/api/client";

const isPlainClick = (event: MouseEvent): boolean =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

// The same origin page a click is about to open, or null when the click is not
// a plain in app navigation (new tab, download, another site, this same page).
const internalTarget = (event: MouseEvent): string | null => {
  if (event.defaultPrevented || !isPlainClick(event)) return null;
  const anchor =
    event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (
    (anchor.target && anchor.target !== "_self") ||
    anchor.hasAttribute("download")
  ) {
    return null;
  }
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (
    url.pathname === window.location.pathname &&
    url.search === window.location.search
  ) {
    return null;
  }
  return `${url.pathname}${url.search}${url.hash}`;
};

// While `active`, closing or reloading the tab triggers the browser's own
// prompt, and a click on any same origin link is held and handed to
// `onAttempt` (spec 0005, AC-9). Back and Forward are not intercepted.
// Call the returned `release` right before a navigation that must not ask
// (a successful create); a 401 redirect releases it on its own.
export function useLeaveGuard(
  active: boolean,
  onAttempt: (href: string) => void,
): () => void {
  const released = useRef(false);
  const attempt = useEffectEvent(onAttempt);

  useEffect(() => {
    const release = () => {
      released.current = true;
    };
    window.addEventListener(UNAUTHORIZED_EVENT, release);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, release);
  }, []);

  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (released.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    // Capture on document runs before Next.js' Link handler, so stopping the
    // event here keeps the client side navigation from starting.
    const onClick = (event: MouseEvent) => {
      if (released.current) return;
      const href = internalTarget(event);
      if (href === null) return;
      event.preventDefault();
      event.stopPropagation();
      attempt(href);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [active]);

  return useCallback(() => {
    released.current = true;
  }, []);
}
