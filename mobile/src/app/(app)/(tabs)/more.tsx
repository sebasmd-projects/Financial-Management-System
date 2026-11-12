import { View } from "react-native";
import { useRouter } from "expo-router";
import { usePhase, useSession } from "@/auth/use-session";
import { es } from "@/i18n/es";
import { AppText, Button, Card, Screen, Title } from "@/ui/primitives";

/**
 * «Más»: lo que la app aún no trae dice «Disponible en la web» (nada de botones muertos ni datos de mentira), más seguridad,
 * dispositivos y cerrar sesión.
 */
export default function More() {
  const phase = usePhase();
  const session = useSession();
  const router = useRouter();
  const t = es.more;
  return (
    <Screen>
      <Title>{t.title}</Title>
      {phase.name === "ready" ? <AppText tone="secondary">{phase.me.user.display_name}</AppText> : null}
      <Card>
        <AppText kind="titleS">{t.webOnly}</AppText>
        <AppText tone="secondary" kind="bodyS">
          {t.webOnlyBody}
        </AppText>
        {t.items.map((item) => (
          <View key={item} accessible accessibilityLabel={`${item}. ${t.webOnly}`} style={{ minHeight: 40, justifyContent: "center" }}>
            <AppText>{item}</AppText>
            <AppText kind="caption" tone="secondary">
              {t.webOnly}
            </AppText>
          </View>
        ))}
      </Card>
      <View style={{ gap: 8 }}>
        <Button label={t.profile} kind="secondary" onPress={() => router.push("/security")} />
        <Button label={es.home.devices} kind="secondary" onPress={() => router.push("/devices")} />
        <Button label={es.home.signOut} kind="ghost" onPress={() => void session.logout()} />
      </View>
    </Screen>
  );
}
