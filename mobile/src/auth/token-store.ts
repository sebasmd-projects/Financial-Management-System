import * as SecureStore from "expo-secure-store";

/**
 * EL ÚNICO módulo que toca `expo-secure-store` (lo vigila `guards.test.ts`) y la única cosa que la app deja en disco: el token
 * de sesión, en el llavero de Android (Keystore), sin copia de seguridad ni migración a otro teléfono
 * (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). Solo se guarda con «Recordarme».
 */
const KEY = "fms.session";
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export interface TokenStore {
  read(): Promise<string | null>;
  save(token: string): Promise<boolean>;
  clear(): Promise<void>;
}

export const tokenStore: TokenStore = {
  async read() {
    try {
      return await SecureStore.getItemAsync(KEY, OPTIONS);
    } catch {
      return null;
    }
  },
  async save(token) {
    try {
      await SecureStore.setItemAsync(KEY, token, OPTIONS);
      return true;
    } catch {
      return false;
    }
  },
  async clear() {
    try {
      await SecureStore.deleteItemAsync(KEY, OPTIONS);
    } catch {
      // Sin llavero no hay nada que borrar.
    }
  },
};
