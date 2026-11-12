import * as Application from "expo-application";
import * as Device from "expo-device";

/**
 * Lo que la app declara de sí misma al entrar (`X-Device-*`, `X-App-Version`): el servidor lo muestra en «Dispositivos».
 * El modelo es `modelName` (p. ej. «Pixel 8»), nunca el nombre que la persona le puso al teléfono.
 */
export function deviceHeaders(remember: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Device-Platform": "android",
    "X-Device-Model": (Device.modelName ?? "Android").slice(0, 80),
    "X-App-Version": (Application.nativeApplicationVersion ?? "0").slice(0, 32),
  };
  if (remember) headers["X-Remember-Me"] = "1";
  return headers;
}
