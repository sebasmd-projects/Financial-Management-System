import { useSyncExternalStore } from "react";
import { createMemoryStore } from "@/features/common/memory";

export type QuickType = "expense" | "income";

/**
 * El borrador del alta rápida: SOLO en memoria (se borra al guardar, al cerrar la hoja, al bloquear y al cerrar sesión). Va de
 * una pantalla a otra por este módulo y no por la ruta: las rutas de la app no llevan montos (`guards.test.ts`).
 */
export interface QuickDraft {
  type: QuickType;
  /** El monto como lo escribe el teclado propio (`"180000"`, `"1800.5"`); vacío si aún no hay. */
  amount: string;
  description: string;
  categoryId: string | null;
  accountId: string | null;
}

export const EMPTY_DRAFT: QuickDraft = { type: "expense", amount: "", description: "", categoryId: null, accountId: null };

export const draftStore = createMemoryStore<QuickDraft | null>(null);
export const useDraft = (): QuickDraft | null => useSyncExternalStore(draftStore.subscribe, draftStore.get, draftStore.get);
export const startQuickAdd = (draft: Partial<QuickDraft> = {}): void => draftStore.set({ ...EMPTY_DRAFT, ...draft });
export const clearQuickAdd = (): void => draftStore.set(null);
