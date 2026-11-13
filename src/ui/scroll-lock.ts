"use client";

import { useEffect } from "react";

let locks = 0;
let saved: { overflow: string; paddingRight: string } | null = null;

/** Bloquea el desplazamiento de la página (conserva la posición y compensa el ancho de la barra: sin salto de diseño). */
export function lockPageScroll(): () => void {
  const root = document.documentElement;
  if (locks++ === 0) {
    const bar = Math.max(0, window.innerWidth - root.clientWidth);
    saved = { overflow: root.style.overflow, paddingRight: root.style.paddingRight };
    if (bar > 0) root.style.paddingRight = `calc(${getComputedStyle(root).paddingRight} + ${bar}px)`;
    root.style.overflow = "hidden";
    root.dataset.scrollLocked = "";
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0 && saved) {
      root.style.overflow = saved.overflow;
      root.style.paddingRight = saved.paddingRight;
      delete root.dataset.scrollLocked;
      saved = null;
    }
  };
}

/** Mientras `locked` sea verdadero la página de detrás no se desplaza (hojas y modales). */
export function useScrollLock(locked: boolean) {
  useEffect(() => (locked ? lockPageScroll() : undefined), [locked]);
}
