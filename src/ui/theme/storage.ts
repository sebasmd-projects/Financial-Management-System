/**
 * La preferencia de tema: LO ÚNICO que esta app guarda en `localStorage` (regla de AGENTS.md: nada financiero en el
 * navegador). Un valor, tres posibles, ningún dato de la persona. `src/guards.test.ts` verifica que ningún otro fichero
 * de `src/` toque el almacenamiento.
 */
export const THEME_KEY = "fms-theme";
export type ThemePreference = "system" | "light" | "dark";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/** Lee la preferencia; ante cualquier fallo (modo privado, almacenamiento bloqueado) o valor raro, «system». */
export function readThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return isThemePreference(value) ? value : "system";
  } catch {
    return "system";
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, preference);
  } catch {
    // Sin almacenamiento: el tema vale para esta visita.
  }
}

/** Fija `data-theme` en <html>; «system» lo quita y manda `prefers-color-scheme`. */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
}

/** Siguiente en el ciclo sistema → claro → oscuro. */
export function nextTheme(current: ThemePreference): ThemePreference {
  return current === "system" ? "light" : current === "light" ? "dark" : "system";
}

/**
 * El script de bloqueo del <head>: aplica el tema guardado antes del primer fotograma (sin parpadeo). Va con el nonce
 * de la CSP. Solo acepta «light» y «dark».
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
