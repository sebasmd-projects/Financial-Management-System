import { useState } from "react";
import { View } from "react-native";
import { Redirect } from "expo-router";
import { usePhase, useSession } from "@/auth/use-session";
import { es } from "@/i18n/es";
import { AppText, Button, Check, Field, Notice, Screen, Title } from "@/ui/primitives";

export default function Login() {
  const phase = usePhase();
  const session = useSession();
  const t = es.login;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (phase.name === "second_factor") return <Redirect href="/otp" />;
  const notice = phase.name === "signed_out" && phase.notice ? es.notices[phase.notice] : null;

  async function submit() {
    if (!email.trim() || !password) return setError(t.missing);
    setBusy(true);
    setError(null);
    const result = await session.signIn(email.trim(), password, remember);
    setBusy(false);
    // La contraseña no se queda en el estado de la pantalla: tras el intento se borra siempre.
    setPassword("");
    if (!result.ok) setError(es.failures[result.reason]);
  }

  return (
    <Screen>
      <Title>{t.title}</Title>
      <AppText tone="secondary">{t.intro}</AppText>
      {notice ? <Notice tone="secondary">{notice}</Notice> : null}
      <Field label={t.email} value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="username" textContentType="username" />
      <Field label={t.password} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={() => void submit()} />
      <Check label={t.remember} hint={t.rememberHint} value={remember} onChange={setRemember} />
      {error ? <Notice>{error}</Notice> : null}
      <View>
        <Button label={busy ? t.submitting : t.submit} busy={busy} onPress={() => void submit()} />
      </View>
    </Screen>
  );
}
