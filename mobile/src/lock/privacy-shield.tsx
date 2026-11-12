import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { usePreventScreenCapture } from "expo-screen-capture";
import { useSession } from "@/auth/use-session";
import { useTheme } from "@/theme/use-theme";
import { shouldCover, shouldLock } from "./policy";

/**
 * Privacidad de toda la app (se monta en la raíz, así que cubre también el inicio de sesión y los códigos):
 *  - Captura de pantalla, grabación y miniatura del selector de aplicaciones bloqueadas (`FLAG_SECURE` en Android).
 *  - Velo opaco cuando la app no está en primer plano.
 *  - Bloqueo biométrico tras 60 s en segundo plano (`policy.ts`).
 * El único módulo que toca `expo-screen-capture` (lo vigila `guards.test.ts`).
 */
export function PrivacyShield({ children }: { children: ReactNode }) {
  usePreventScreenCapture("fms-app");
  const session = useSession();
  const c = useTheme();
  const [state, setState] = useState<string>(AppState.currentState ?? "active");
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      setState(next);
      if (next === "background" && backgroundedAt.current === null) backgroundedAt.current = Date.now();
      if (next === "active") {
        if (shouldLock(backgroundedAt.current, Date.now())) session.lock();
        backgroundedAt.current = null;
      }
    });
    return () => subscription.remove();
  }, [session]);

  return (
    <View style={styles.fill}>
      {children}
      {shouldCover(state) ? <View accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { backgroundColor: c.primary }]} testID="privacy-veil" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
