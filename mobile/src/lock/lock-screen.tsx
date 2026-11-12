import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useSession } from "@/auth/use-session";
import { es } from "@/i18n/es";
import { AppText, Button, Notice, Screen, Title } from "@/ui/primitives";

/** Pantalla de bloqueo: pide la huella (o el PIN del teléfono) al abrirse y mientras no se confirme no hay nada más a la vista. */
export function LockScreen() {
  const session = useSession();
  const t = es.lock;
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const asked = useRef(false);

  const ask = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    const result = await session.unlock(t.prompt);
    setBusy(false);
    if (result === "failed") setMessage(t.failed);
    if (result === "unavailable") setMessage(t.unavailable);
  }, [session, t]);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void ask();
  }, [ask]);

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: "center", gap: 16 }}>
        <Title>{t.title}</Title>
        <AppText tone="secondary">{t.intro}</AppText>
        {message ? <Notice>{message}</Notice> : null}
        <Button label={t.button} busy={busy} onPress={() => void ask()} />
        <Button label={t.signOut} kind="ghost" onPress={() => void session.logout()} />
      </View>
    </Screen>
  );
}
