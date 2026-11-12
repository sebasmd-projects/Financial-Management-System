import { runtime } from "@/auth/runtime";

/** Lo que el centro de avisos puede pedirle al registro de push (el real, de `runtime`). */
export function usePushActions() {
  const { push, native } = runtime();
  return { enable: () => push.enable(), openSettings: () => native.openSettings() };
}
