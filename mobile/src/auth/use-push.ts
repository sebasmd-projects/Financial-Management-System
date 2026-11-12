import { useEffect } from "react";
import { useRouter } from "expo-router";
import { markRouted, openFromTap, usePending } from "@/features/notifications/pending";
import { NOTIFICATION_ROUTE, parsePushData } from "@/features/notifications/routing";
import { showForegroundNotifications } from "@/features/notifications/native";
import { runtime } from "./runtime";
import { usePhase } from "./use-session";

/** En la raíz (siempre montada): escucha los toques sobre avisos y el que abrió la app en frío. Solo guarda ids en memoria. */
export function useNotificationTaps(): void {
  useEffect(() => {
    const { native } = runtime();
    showForegroundNotifications();
    const launched = parsePushData(native.launchedBy());
    if (launched) openFromTap(launched);
    return native.onTap((data) => {
      const target = parsePushData(data);
      if (target) openFromTap(target);
    });
  }, []);
}

/** Con la sesión lista: sincroniza el token de FCM (solo si ya hay permiso) y, si hay un aviso tocado, abre el centro de avisos. */
export function usePushWhenReady(): void {
  const phase = usePhase();
  const pending = usePending();
  const router = useRouter();
  const ready = phase.name === "ready";

  useEffect(() => {
    if (ready) void runtime().push.sync();
  }, [ready]);

  useEffect(() => {
    if (ready && pending && !pending.routed) {
      markRouted();
      router.navigate(NOTIFICATION_ROUTE);
    }
  }, [ready, pending, router]);
}
