/** Aquí se conectan las piezas reales de la app: llavero, memoria, huella, HTTP y sesión. Un solo ejemplar por proceso. */
import { createHttp } from "@/api/http";
import { apiOrigin } from "@/config";
import { biometric } from "@/lock/biometric";
import { createAllauthApi } from "./allauth";
import { memoryToken } from "./memory-token";
import { createReauth } from "./reauth";
import { createSession } from "./session";
import { tokenStore } from "./token-store";

export const reauth = createReauth();

let built: { session: ReturnType<typeof createSession>; http: ReturnType<typeof createHttp>; allauth: ReturnType<typeof createAllauthApi> } | null = null;

function build() {
  const http = createHttp({
    origin: apiOrigin(),
    getToken: memoryToken.get,
    onSessionEnded: (reason) => runtime().session.expire(reason),
    reauthenticate: () => reauth.request(),
  });
  const allauth = createAllauthApi(http);
  const session = createSession({ store: tokenStore, token: memoryToken, biometric, api: () => ({ fms: http.fms, allauth }) });
  // Si la sesión termina con el aviso de reautenticación abierto, se cierra sin confirmar.
  session.subscribe(() => {
    const phase = session.getPhase().name;
    if (reauth.isOpen() && phase !== "ready" && phase !== "setup") reauth.settle(false);
  });
  return { session, http, allauth };
}

export function runtime() {
  built ??= build();
  return built;
}
