import { View } from "react-native";
import { useRouter } from "expo-router";
import { usePhase, useSession } from "@/auth/use-session";
import { es } from "@/i18n/es";
import { AppText, Button, Notice, Screen, Title } from "@/ui/primitives";

/** Marcador de posición: el Resumen, el alta rápida y los movimientos llegan en la siguiente entrega. */
export default function Home() {
  const phase = usePhase();
  const session = useSession();
  const router = useRouter();
  const t = es.home;
  return (
    <Screen>
      <Title>{t.title}</Title>
      {phase.name === "ready" ? <AppText tone="secondary">{`${t.hello} ${phase.me.user.display_name}`}</AppText> : null}
      {phase.name === "load_failed" ? (
        <>
          <Notice>{phase.network ? es.common.network : t.loadFailed}</Notice>
          <Button label={es.common.retry} onPress={() => void session.refresh()} />
        </>
      ) : (
        <AppText tone="secondary">{t.soon}</AppText>
      )}
      <View style={{ gap: 8 }}>
        <Button label={t.devices} kind="secondary" onPress={() => router.push("/devices")} />
        <Button label={t.security} kind="secondary" onPress={() => router.push("/security")} />
        <Button label={t.signOut} kind="ghost" onPress={() => void session.logout()} />
      </View>
    </Screen>
  );
}
