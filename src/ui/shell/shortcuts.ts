/**
 * Atajos de teclado de la web (diseño §6): `N` nuevo movimiento, `Ctrl/⌘+K` buscar pantalla, `G` y luego `R`/`M`/`P`
 * para ir a Resumen, Movimientos y Pagos. Puro para poder probarlo; `useShortcuts` lo conecta al documento.
 */
export type ShortcutAction = { type: "new" } | { type: "search" } | { type: "go"; to: "/" | "/movimientos" | "/pagos" };

export interface KeyInfo {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** La tecla se pulsó escribiendo en un campo, en un diálogo o en un elemento editable. */
  typing: boolean;
}

export interface ShortcutResult {
  action: ShortcutAction | null;
  /** `true` si la tecla fue la `G` que espera su pareja. */
  pendingG: boolean;
  preventDefault: boolean;
}

const GO: Record<string, "/" | "/movimientos" | "/pagos"> = { r: "/", m: "/movimientos", p: "/pagos" };

export function resolveShortcut(event: KeyInfo, pendingG: boolean): ShortcutResult {
  const none: ShortcutResult = { action: null, pendingG: false, preventDefault: false };
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && !event.altKey && key === "k") {
    return { action: { type: "search" }, pendingG: false, preventDefault: true };
  }
  if (event.typing || event.ctrlKey || event.metaKey || event.altKey) return none;
  if (pendingG && key in GO) return { action: { type: "go", to: GO[key] }, pendingG: false, preventDefault: true };
  if (key === "g" && !event.shiftKey) return { action: null, pendingG: true, preventDefault: false };
  if (key === "n" && !event.shiftKey) return { action: { type: "new" }, pendingG: false, preventDefault: true };
  return none;
}
