import * as LocalAuthentication from "expo-local-authentication";

/**
 * EL ÚNICO módulo que toca `expo-local-authentication` (lo vigila `guards.test.ts`). Huella o rostro, con el PIN, patrón o
 * contraseña del teléfono como respaldo. Si el teléfono no tiene NINGÚN bloqueo de pantalla la app no se usa: el llavero de
 * Android tampoco protegería el token, y un candado que no existe no es un candado.
 */
export type BiometricResult = "success" | "cancelled" | "failed" | "unavailable";

export interface Biometric {
  /** `none`: el teléfono no tiene bloqueo de pantalla. */
  capability(): Promise<"ok" | "none">;
  authenticate(reason: string): Promise<BiometricResult>;
}

export const biometric: Biometric = {
  async capability() {
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      return level === LocalAuthentication.SecurityLevel.NONE ? "none" : "ok";
    } catch {
      return "none";
    }
  },
  async authenticate(reason) {
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: reason, cancelLabel: "Cancelar", disableDeviceFallback: false });
      if (result.success) return "success";
      if (result.error === "user_cancel" || result.error === "system_cancel" || result.error === "app_cancel") return "cancelled";
      if (result.error === "not_enrolled" || result.error === "not_available" || result.error === "passcode_not_set") return "unavailable";
      return "failed";
    } catch {
      return "unavailable";
    }
  },
};
