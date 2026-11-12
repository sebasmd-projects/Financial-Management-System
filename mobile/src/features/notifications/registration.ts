/**
 * Registro del token de FCM en el servidor, sin React ni Expo (se prueba con dobles). Reglas:
 *
 *  - SOLO con el permiso concedido por la persona. Pedirlo es una acción suya (`enable()`), nunca automático.
 *  - `PUT push/endpoints/fcm` es idempotente (un token por dispositivo); si el token rota, se vuelve a registrar.
 *  - El token no se guarda ni se escribe en ningún lado: vive en la memoria de esta función el tiempo de la llamada. De la respuesta
 *    solo se recuerda el id del destino, para revocarlo al cerrar sesión.
 *  - Al cerrar sesión se REVOCA el destino (`DELETE push/endpoints/{id}`); si el id no está en memoria (sesión recordada), se
 *    busca en `GET push/endpoints` el de este dispositivo.
 */
import type { ApiResult } from "@core/api/client";
import { paths } from "@/features/common/paths";
import type { PushNative } from "./native";

interface Endpoint {
  id: string;
  kind: "webpush" | "fcm";
  device_id: string | null;
}
interface Prefs {
  push_enabled: boolean;
  fcm_available: boolean;
}

export interface RegistrationApi {
  get: <T>(path: string) => Promise<ApiResult<T>>;
  put: <T>(path: string, body?: unknown) => Promise<ApiResult<T>>;
  patch: <T>(path: string, body?: unknown) => Promise<ApiResult<T>>;
  delete: <T>(path: string) => Promise<ApiResult<T>>;
}

export type PushState = "unknown" | "unavailable" | "off" | "blocked" | "on" | "failed";

export function createPushRegistration(deps: { native: PushNative; api: RegistrationApi; deviceId: () => string | null; active: () => boolean; onState?: (state: PushState) => void }) {
  let endpointId: string | null = null;
  let stopTokens: (() => void) | null = null;
  let state: PushState = "unknown";
  const set = (next: PushState) => {
    state = next;
    deps.onState?.(next);
    return next;
  };

  async function put(token: string): Promise<boolean> {
    const result = await deps.api.put<Endpoint>(paths.pushFcm, { token, locale: "es" });
    if (!result.ok) return false;
    endpointId = result.data.id;
    return true;
  }

  async function register(): Promise<PushState> {
    const token = await deps.native.token();
    if (!token) return set("failed");
    if (!(await put(token))) return set("failed");
    // Un token nuevo con la app bloqueada no llama al servidor (sin sesión daría 401): `sync()` lo registra al desbloquear.
    stopTokens ??= deps.native.onTokenChange((next) => (deps.active() ? void put(next) : undefined));
    return set("on");
  }

  return {
    state: () => state,

    /** Al abrir la app: si la persona ya concedió el permiso, registra (o actualiza) el token. Si no, no pregunta nada. */
    async sync(): Promise<PushState> {
      await deps.native.ensureChannels();
      const permission = await deps.native.permission();
      if (permission.status === "granted") return register();
      return set(permission.status === "denied" && !permission.canAskAgain ? "blocked" : "off");
    },

    /** La persona tocó «Activar avisos»: pide el permiso del sistema y, si lo concede, registra y enciende `push_enabled`. */
    async enable(): Promise<PushState> {
      const prefs = await deps.api.get<Prefs>(paths.notificationPrefs);
      if (prefs.ok && !prefs.data.fcm_available) return set("unavailable");
      await deps.native.ensureChannels();
      const granted = await deps.native.request();
      if (granted !== "granted") return set("blocked");
      const next = await register();
      if (next === "on" && prefs.ok && !prefs.data.push_enabled) await deps.api.patch(paths.notificationPrefs, { push_enabled: true });
      return next;
    },

    /** Cerrar sesión: borra el destino de ESTE teléfono en el servidor. Va antes de invalidar la sesión; un fallo no la retiene. */
    async revoke(): Promise<void> {
      stopTokens?.();
      stopTokens = null;
      let id = endpointId;
      if (!id) {
        const device = deps.deviceId();
        const list = await deps.api.get<{ endpoints: Endpoint[] }>(paths.pushEndpoints);
        if (list.ok && device) id = list.data.endpoints.find((endpoint) => endpoint.kind === "fcm" && endpoint.device_id === device)?.id ?? null;
      }
      endpointId = null;
      state = "unknown";
      if (id) await deps.api.delete(paths.pushEndpoint(id));
    },
  };
}

export type PushRegistration = ReturnType<typeof createPushRegistration>;
