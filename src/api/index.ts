import { createApiClient, readBrowserCookie } from "./client";
import { scopedPath } from "@/features/household/scope";
import { getScope } from "@/features/household/scope-store";
import { loginRedirectUrl, localeFromPath } from "./login";

/** El cliente del navegador: 401 → `window.location` al inicio de sesión del CV, con `?next=<la página actual>`. */
export const api = createApiClient({
  fetch: (input, init) => globalThis.fetch(input, init),
  readCookie: readBrowserCookie,
  rewritePath: (path) => scopedPath(path, getScope()),
  onUnauthorized: () => {
    if (typeof window === "undefined") return;
    const { pathname } = window.location;
    window.location.replace(loginRedirectUrl(localeFromPath(pathname), pathname));
  },
});
