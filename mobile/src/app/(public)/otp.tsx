import { useState } from "react";
import { View } from "react-native";
import { Redirect } from "expo-router";
import { usePhase, useSession } from "@/auth/use-session";
import { es } from "@/i18n/es";
import { AppText, Button, Field, Notice, Screen, Title } from "@/ui/primitives";

export default function Otp() {
  const phase = usePhase();
  const session = useSession();
  const t = es.otp;
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (phase.name !== "second_factor") return phase.name === "signed_out" ? <Redirect href="/login" /> : null;

  async function submit() {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    const result = await session.submitCode(code.trim());
    setBusy(false);
    setCode("");
    if (!result.ok) setError(es.failures[result.reason]);
  }

  return (
    <Screen>
      <Title>{t.title}</Title>
      <AppText tone="secondary">{t.intro}</AppText>
      <Field label={t.label} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="off" importantForAutofill="no" maxLength={32} autoFocus onSubmitEditing={() => void submit()} />
      {error ? <Notice>{error}</Notice> : null}
      <View style={{ gap: 8 }}>
        <Button label={busy ? t.submitting : t.submit} busy={busy} onPress={() => void submit()} />
        <Button label={t.useOtherAccount} kind="ghost" onPress={() => session.cancelSecondFactor()} />
      </View>
    </Screen>
  );
}
