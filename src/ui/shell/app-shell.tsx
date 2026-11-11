"use client";

import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { MeResponse } from "@/api/types";
import { NEW_MOVEMENT_HREF } from "@/nav/routes";
import { BottomTabBar } from "./bottom-tab-bar";
import { MoreSheet } from "./more-sheet";
import { resolveShortcut } from "./shortcuts";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

const TYPING = /^(input|textarea|select)$/i;

/**
 * La cáscara de la app (diseño §1): barra inferior en teléfono, barra lateral desde 600 dp, cabecera, hoja «Más» y
 * `<main id="contenido">` (destino del enlace «Saltar al contenido»). Al navegar, el foco pasa al contenido para que un
 * lector de pantalla lo anuncie y quien usa teclado no empiece desde la cabecera.
 */
export function AppShell({ children }: { me: MeResponse; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const previousPath = useRef(pathname);
  const pendingG = useRef<number | null>(null);

  // Gestión de foco al cambiar de pantalla (no en la primera).
  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      mainRef.current?.focus({ preventScroll: false });
    }
  }, [pathname]);

  const openMore = useCallback(() => setMoreOpen(true), []);
  const closeMore = useCallback(() => setMoreOpen(false), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (TYPING.test(target.tagName) || target.isContentEditable || target.closest("dialog") !== null);
      const waiting = pendingG.current !== null && Date.now() - pendingG.current < 1500;
      const result = resolveShortcut({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey, typing }, waiting);
      pendingG.current = result.pendingG ? Date.now() : null;
      if (result.preventDefault) event.preventDefault();
      const action = result.action;
      if (!action) return;
      if (action.type === "search") setMoreOpen(true);
      else if (action.type === "new") router.push(NEW_MOVEMENT_HREF);
      else router.push(action.to);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return (
    <div className="shell">
      <Suspense fallback={null}>
        <Sidebar />
      </Suspense>
      <div className="shell__body">
        <TopBar onSearch={openMore} />
        <main id="contenido" ref={mainRef} tabIndex={-1} className="shell__main">
          {children}
        </main>
      </div>
      <BottomTabBar onMore={openMore} moreOpen={moreOpen} />
      <MoreSheet open={moreOpen} onClose={closeMore} />
    </div>
  );
}
