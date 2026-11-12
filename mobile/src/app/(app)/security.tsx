import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useAllauth, usePhase, useSession } from "@/auth/use-session";
import { es } from "@/i18n/es";
import { AppText, Button, Card, Notice, Screen, Title } from "@/ui/primitives";

/** Seguridad de la cuenta: estado del segundo factor, códigos de recuperación (piden reautenticación) y cerrar sesión. */
export default function Security() {
  const phase = usePhase();
  const session = useSession();
  const allauth = useAllauth();
  const router = useRouter();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState(false);

  async function show() {
    setError(false);
    const result = await allauth.recoveryCodes();
    if (result) setCodes(result);
    else setError(true);
  }

  return (
    <Screen>
      <Title>{es.home.security}</Title>
      {phase.name === "ready" ? (
        <Card>
          <AppText>{phase.me.user.email}</AppText>
          <AppText tone="positive">{phase.me.mfa_verified ? "Segundo factor verificado en esta sesión" : "Segundo factor pendiente"}</AppText>
        </Card>
      ) : null}
      <Button label="Ver códigos de recuperación" kind="secondary" onPress={() => void show()} />
      {error ? <Notice>{es.common.generic}</Notice> : null}
      {codes ? (
        <Card>
          {codes.length === 0 ? <AppText tone="secondary">No quedan códigos sin usar.</AppText> : codes.map((code) => <AppText key={code}>{code}</AppText>)}
        </Card>
      ) : null}
      <View style={{ gap: 8 }}>
        <Button label={es.devices.title} kind="secondary" onPress={() => router.push("/devices")} />
        <Button label={es.home.signOut} kind="ghost" onPress={() => void session.logout()} />
        <Button label={es.common.back} kind="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
