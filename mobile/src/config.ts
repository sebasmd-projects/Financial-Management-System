import Constants from "expo-constants";

/**
 * El origen del sitio al que habla la app. Se fija al compilar (`FMS_API_ORIGIN`, ver `app.config.ts`). HTTPS siempre; el único
 * `http` admitido es el del emulador de Android (`10.0.2.2`) o `localhost`, y solo en depuración.
 */
export function resolveApiOrigin(raw: unknown, dev: boolean): string {
  if (typeof raw !== "string") throw new Error("Falta extra.apiOrigin en app.config.ts");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("extra.apiOrigin no es una URL");
  }
  const local = ["10.0.2.2", "localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(dev && local && url.protocol === "http:")) throw new Error("extra.apiOrigin debe ser https");
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) throw new Error("extra.apiOrigin es solo el origen");
  return url.origin;
}

let origin: string | null = null;

/** Se resuelve la primera vez que se pide (no al importar), para que las pruebas no dependan de `app.config.ts`. */
export function apiOrigin(): string {
  origin ??= resolveApiOrigin(Constants.expoConfig?.extra?.apiOrigin, __DEV__);
  return origin;
}

export const FMS_PATH = "/api/fms/v1";
export const ALLAUTH_PATH = "/_allauth/app/v1";
/** Páginas del CV que se abren en el navegador (términos y privacidad). */
export const WEB_PAGES = { terms: "/es/terms", privacy: "/es/privacy" } as const;
