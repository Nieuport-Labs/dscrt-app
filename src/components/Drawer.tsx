"use client";

import { useEffect, type ReactNode } from "react";

import { Portal } from "./Portal";

/**
 * The shell both side panels share: the account panel and the settings dialog.
 *
 * It exists for the way out. These panels deliberately do not block the page — you open
 * one to check a balance while doing something else, and the something else has to stay
 * usable — and closing on a click anywhere else was the wrong bargain for that: every
 * click meant for the page behind the panel was spent dismissing it instead, which is the
 * one thing a non-blocking panel must not do.
 *
 * So dismissal gets a surface of its own. The spine is a strip peeking out from behind the
 * panel, and it and Escape are the only things that close it. That also settles a question
 * the full-height panel raised: it covers the button that opened it, so the button can no
 * longer serve as the toggle back.
 *
 * Both panels had a copy of this effect and a ref that existed solely to answer "was that
 * click inside me?". Neither needs one now.
 */
export function Drawer({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Portal>
      <div className="drawer-dock">
        <button
          className="drawer-spine"
          onClick={onClose}
          aria-label={`Close ${label.toLowerCase()}`}
          title="Close"
        />
        <div className="drawer" role="dialog" aria-label={label}>
          {children}
        </div>
      </div>
    </Portal>
  );
}
