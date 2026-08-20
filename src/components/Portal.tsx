"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Render outside the tree, at the end of `<body>`.
 *
 * The bug that bought this: the nav bar used to carry `backdrop-filter`, and a filter of
 * any kind makes an element the containing block for `position: fixed` descendants — so a
 * panel opened from the wallet button was positioned against the bar rather than the
 * window, and appeared trapped inside it.
 *
 * The bar is plain now, so that particular trap is gone. This stays anyway, because the
 * lesson generalises and the fix does not: `filter`, `transform`, `perspective`,
 * `will-change` and `contain` all do the same thing, any of them can arrive later in a
 * component that has no idea an overlay opens beneath it, and the failure looks like a
 * positioning mistake rather than a stacking one. Rendering at `<body>` costs nothing and
 * makes the whole class of it impossible.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  // There is no document during the static export, so nothing renders until the client
  // takes over.
  useEffect(() => setMounted(true), []);

  return mounted ? createPortal(children, document.body) : null;
}
