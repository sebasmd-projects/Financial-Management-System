import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ReauthPrompt } from "@/auth/reauth-prompt";
import { usePhase, useSession } from "@/auth/use-session";
import { LockScreen } from "@/lock/lock-screen";
import { PrivacyShield } from "@/lock/privacy-shield";
import { useTheme } from "@/theme/use-theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PrivacyShield>
        <StatusBar style="auto" />
        <Gate />
        <ReauthPrompt />
      </PrivacyShield>
    </SafeAreaProvider>
  );
}

/** Bloqueado o arrancando: no se monta ninguna ruta (y con ellas, ninguna pantalla con datos). */
function Gate() {
  const session = useSession();
  const phase = usePhase();
  const c = useTheme();
  useEffect(() => {
    void session.boot();
  }, [session]);

  if (phase.name === "locked") return <LockScreen />;
  if (phase.name === "booting" || phase.name === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.canvas }}>
        <ActivityIndicator color={c.primary} accessibilityLabel="Cargando" />
      </View>
    );
  }
  return <Slot />;
}
