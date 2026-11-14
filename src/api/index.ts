import { createApiClient, readBrowserCookie } from "./client";
import { scopedPath } from "@/features/household/scope";
import { getScope } from "@/features/household/scope-store";
import { loginRedirectUrl, localeFromPath } from "./login";
import { reauth, withReauth } from "./reauth";

/**
 * El cliente del navegador: 401 → `window.location` al inicio de sesión del CV, con `?next=<la página actual>`; 403 `reauthentication_required` →
 * el aviso de confirmar la contraseña o el código y, si se confirma, la misma petición se repite una vez (`reauth.ts`).
 */
export const api = withReauth(
  createApiClient({
    fetch: (input, init) => globalThis.fetch(input, init),
    readCookie: readBrowserCookie,
    rewritePath: (path) => scopedPath(path, getScope()),
    onUnauthorized: () => {
      if (typeof window === "undefined") return;
      const { pathname } = window.location;
      window.location.replace(loginRedirectUrl(localeFromPath(pathname), pathname));
    },
  }),
  () => reauth.request(),
);
