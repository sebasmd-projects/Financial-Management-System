import { createApiClient, readBrowserCookie } from "./client";
import { loginRedirectUrl } from "./login";

/** El cliente del navegador: 401 → `window.location` al inicio de sesión del CV (con `?next=/finanzas`). */
export const api = createApiClient({
  fetch: (input, init) => globalThis.fetch(input, init),
  readCookie: readBrowserCookie,
  onUnauthorized: (loginUrl) => {
    if (typeof window !== "undefined") window.location.replace(loginRedirectUrl(loginUrl));
  },
});
