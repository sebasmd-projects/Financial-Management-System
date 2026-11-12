/**
 * Reautenticación: una acción sensible (cerrar otros dispositivos, borrar un hogar…) pide haber confirmado la contraseña o el
 * código hace poco. `request()` abre el aviso (`ReauthPrompt`) y espera; varias peticiones a la vez comparten UN solo aviso.
 * Nada de lo que se escribe se guarda: la contraseña o el código van del campo al servidor.
 */
export type ReauthRequest = { id: number };

export function createReauth() {
  let pending: Promise<boolean> | null = null;
  let resolve: ((done: boolean) => void) | null = null;
  let counter = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  return {
    /** Abre el aviso (si no estaba abierto) y resuelve `true` cuando la persona confirma, `false` si cancela o la sesión termina. */
    request(): Promise<boolean> {
      if (!pending) {
        counter += 1;
        pending = new Promise<boolean>((done) => {
          resolve = done;
        });
        notify();
      }
      return pending;
    },
    settle(done: boolean) {
      const finish = resolve;
      pending = null;
      resolve = null;
      notify();
      finish?.(done);
    },
    isOpen: () => pending !== null,
    version: () => counter * 2 + (pending ? 1 : 0),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type Reauth = ReturnType<typeof createReauth>;
