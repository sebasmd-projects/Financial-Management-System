import { Linking } from "react-native";
import {
  AndroidImportance,
  addNotificationResponseReceivedListener,
  addPushTokenListener,
  clearLastNotificationResponse,
  getDevicePushTokenAsync,
  getLastNotificationResponse,
  getPermissionsAsync,
  requestPermissionsAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
} from "expo-notifications";

/**
 * EL ÚNICO módulo que toca `expo-notifications` (lo vigila `guards.test.ts`). Es una capa fina: permisos, canales de Android, el
 * token NATIVO de FCM (`getDevicePushTokenAsync`; no el de Expo: la app no usa el servicio de push de Expo) y los toques sobre un
 * aviso. El token y la carga de un aviso no se escriben en ninguna parte: pasan a quien los pide y se descartan.
 */
export type Permission = "granted" | "denied" | "undetermined";

export interface PushNative {
  permission(): Promise<{ status: Permission; canAskAgain: boolean }>;
  request(): Promise<Permission>;
  ensureChannels(): Promise<void>;
  /** El token de FCM de este teléfono, o `null` si no se pudo obtener. */
  token(): Promise<string | null>;
  onTokenChange(listener: (token: string) => void): () => void;
  /** Un toque sobre un aviso (con la app abierta o en segundo plano). Entrega solo `data` (ids), nunca el texto. */
  onTap(listener: (data: Record<string, unknown>) => void): () => void;
  /** El aviso que abrió la app en frío, si la abrió uno. Se consume. */
  launchedBy(): Record<string, unknown> | null;
  openSettings(): void;
}

/** Los cinco canales del diseño §3.16. El servidor manda por `due` (vencimientos) o `security`. */
export const CHANNELS = [
  { id: "due", importance: AndroidImportance.HIGH },
  { id: "confirm", importance: AndroidImportance.DEFAULT },
  { id: "alerts", importance: AndroidImportance.DEFAULT },
  { id: "digest", importance: AndroidImportance.LOW },
  { id: "security", importance: AndroidImportance.HIGH },
] as const;

function status(value: string): Permission {
  return value === "granted" ? "granted" : value === "denied" ? "denied" : "undetermined";
}

export function createPushNative(names: Record<(typeof CHANNELS)[number]["id"], string>): PushNative {
  return {
    async permission() {
      const result = await getPermissionsAsync();
      return { status: status(result.status), canAskAgain: result.canAskAgain };
    },
    async request() {
      return status((await requestPermissionsAsync()).status);
    },
    async ensureChannels() {
      for (const channel of CHANNELS) {
        await setNotificationChannelAsync(channel.id, { name: names[channel.id], importance: channel.importance });
      }
    },
    async token() {
      try {
        const result = await getDevicePushTokenAsync();
        return typeof result.data === "string" && result.data !== "" ? result.data : null;
      } catch {
        return null;
      }
    },
    onTokenChange(listener) {
      const subscription = addPushTokenListener((token) => {
        if (typeof token.data === "string" && token.data !== "") listener(token.data);
      });
      return () => subscription.remove();
    },
    onTap(listener) {
      const subscription = addNotificationResponseReceivedListener((response) => {
        listener((response.notification.request.content.data ?? {}) as Record<string, unknown>);
        clearLastNotificationResponse();
      });
      return () => subscription.remove();
    },
    launchedBy() {
      const response = getLastNotificationResponse();
      if (!response) return null;
      clearLastNotificationResponse();
      return (response.notification.request.content.data ?? {}) as Record<string, unknown>;
    },
    openSettings() {
      void Linking.openSettings();
    },
  };
}

/** Con la app abierta el aviso se muestra igual (banner); el texto lo decide el servidor. */
export function showForegroundNotifications(): void {
  setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}
