/** Aquí se conectan las piezas reales de la app: llavero, memoria, huella, HTTP y sesión. Un solo ejemplar por proceso. */
import { createHttp } from "@/api/http";
import { apiOrigin } from "@/config";
import { wipeMemory } from "@/features/common/memory";
import { createPushNative } from "@/features/notifications/native";
import { clearPending } from "@/features/notifications/pending";
import { createPushRegistration } from "@/features/notifications/registration";
import { pushStateStore } from "@/features/notifications/state";
import { es } from "@/i18n/es";
import { biometric } from "@/lock/biometric";
import { createAllauthApi } from "./allauth";
import { memoryToken } from "./memory-token";
import { createReauth } from "./reauth";
import { createSession } from "./session";
import { tokenStore } from "./token-store";

export const reauth = createReauth();

let built: {
  session: ReturnType<typeof createSession>;
  http: ReturnType<typeof createHttp>;
  allauth: ReturnType<typeof createAllauthApi>;
  push: ReturnType<typeof createPushRegistration>;
  native: ReturnType<typeof createPushNative>;
} | null = null;

/** Revocar el destino de push no puede retener el cierre de sesión más de unos segundos. */
const REVOKE_TIMEOUT_MS = 5000;

function build() {
  const http = createHttp({
    origin: apiOrigin(),
    getToken: memoryToken.get,
    onSessionEnded: (reason) => runtime().session.expire(reason),
    reauthenticate: () => reauth.request(),
  });
  const allauth = createAllauthApi(http);
  const native = createPushNative(es.notif.channels);
  const push = createPushRegistration({
    native,
    api: http.fms,
    deviceId: () => {
      const phase = session.getPhase();
      return phase.name === "ready" ? phase.me.device_id : null;
    },
    active: () => session.getPhase().name === "ready",
    onState: (state) => pushStateStore.set(state),
  });
  const session = createSession({
    store: tokenStore,
    token: memoryToken,
    biometric,
    api: () => ({ fms: http.fms, allauth }),
    beforeLogout: async () => {
      clearPending();
      await Promise.race([push.revoke(), new Promise<void>((resolve) => setTimeout(resolve, REVOKE_TIMEOUT_MS))]);
    },
  });
  // Lo que la app guarda en memoria (ámbito, borrador, ojo de «ocultar montos»…) se borra al bloquear y al cerrar sesión.
  session.onWipe(wipeMemory);
  // Si la sesión termina con el aviso de reautenticación abierto, se cierra sin confirmar.
  session.subscribe(() => {
    const phase = session.getPhase().name;
    if (reauth.isOpen() && phase !== "ready" && phase !== "setup") reauth.settle(false);
  });
  return { session, http, allauth, push, native };
}

export function runtime() {
  built ??= build();
  return built;
}
