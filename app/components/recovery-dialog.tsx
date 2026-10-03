"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Native modal keeps keyboard focus inside and makes the background inert. */
export function RecoveryDialog({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previousFocus?.focus();
    };
  }, []);
  return <dialog ref={dialogRef} className="recovery-gate"
    aria-labelledby="recovery-dialog-title" aria-describedby="recovery-dialog-description"
    onCancel={(event) => event.preventDefault()}>
    {children}
  </dialog>;
}
