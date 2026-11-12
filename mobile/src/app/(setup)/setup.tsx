import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { WEB_PAGES, apiOrigin } from "@/config";
import { usePhase, useAllauth, useFms, useSession } from "@/auth/use-session";
import type { Me } from "@/auth/session";
import type { TotpStatus } from "@/auth/allauth";
import { activationErrorKey, otpauthUrl } from "@/features/setup/logic";
import { es } from "@/i18n/es";
import { AppText, Button, Card, Check, Field, Notice, Screen, Title } from "@/ui/primitives";

export default function Setup() {
  const phase = usePhase();
  if (phase.name !== "setup") return null;
  return phase.me.mfa_verified ? <Activation me={phase.me} /> : <TotpEnrollment me={phase.me} />;
}

function TotpEnrollment({ me }: { me: Me }) {
  const allauth = useAllauth();
  const session = useSession();
  const t = es.setup;
  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [relogin, setRelogin] = useState(false);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void allauth.totp.status().then((next) => alive && setStatus(next));
    return () => {
      alive = false;
    };
  }, [allauth, attempt]);

  async function confirm() {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await allauth.totp.activate(code.trim());
    setBusy(false);
    setCode("");
    if (outcome === "invalid_code") return setError(t.mfaInvalid);
    if (outcome !== "ok") return setError(es.common.generic);
    setRecovery(await allauth.recoveryCodes());
    setRelogin(true);
  }

  async function proceed() {
    setRecovery(null);
    // Si el servidor ya cuenta esta sesión como verificada, `refresh` pasa a la activación; si no, hay que volver a entrar.
    await session.refresh();
  }

  if (recovery || relogin) {
    return (
      <Screen>
        <Title>{t.mfaTitle}</Title>
        <AppText tone="secondary">{t.mfaRelogin}</AppText>
        {recovery && recovery.length > 0 ? (
          <Card>
            <AppText kind="titleS">Códigos de recuperación</AppText>
            <AppText kind="caption" tone="secondary">
              Guárdalos fuera de este teléfono. Cada uno sirve una sola vez si pierdes tu autenticador.
            </AppText>
            {recovery.map((item) => (
              <AppText key={item} selectable>
                {item}
              </AppText>
            ))}
          </Card>
        ) : null}
        <Button label={es.common.continue} onPress={() => void proceed()} />
        <Button label={t.signOut} kind="ghost" onPress={() => void session.logout()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{t.mfaTitle}</Title>
      <AppText tone="secondary">{t.mfaIntro}</AppText>
      {status === null ? <AppText>{es.common.loading}</AppText> : null}
      {status?.kind === "forbidden" ? <Notice>{t.mfaStaff}</Notice> : null}
      {status?.kind === "active" ? <Notice tone="secondary">{t.mfaAlready}</Notice> : null}
      {status?.kind === "error" ? (
        <>
          <Notice>{status.network ? es.common.network : es.common.generic}</Notice>
          <Button label={es.common.retry} onPress={() => setAttempt((n) => n + 1)} />
        </>
      ) : null}
      {status?.kind === "inactive" ? (
        <>
          <Card>
            <AppText kind="label" tone="secondary">
              {t.mfaSecret}
            </AppText>
            <AppText kind="titleS" selectable>
              {status.secret}
            </AppText>
            <AppText kind="caption" tone="secondary">
              {t.mfaSecretHint}
            </AppText>
          </Card>
          <Button label={t.mfaOpen} kind="secondary" onPress={() => void Linking.openURL(otpauthUrl(status.secret, me.user.email)).catch(() => undefined)} />
          <Field label={t.mfaCode} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="off" importantForAutofill="no" maxLength={8} onSubmitEditing={() => void confirm()} />
          {error ? <Notice>{error}</Notice> : null}
          <Button label={t.mfaConfirm} busy={busy} onPress={() => void confirm()} />
        </>
      ) : null}
      <Button label={t.signOut} kind="ghost" onPress={() => void session.logout()} />
    </Screen>
  );
}

function Activation({ me }: { me: Me }) {
  const fms = useFms();
  const session = useSession();
  const t = es.setup;
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = me.consent.required_version;

  async function activate() {
    if (!consent || busy) return;
    setBusy(true);
    setError(null);
    const result = await fms.post("/activation", { accept_version: version });
    setBusy(false);
    if (result.ok) return void (await session.refresh());
    const key = activationErrorKey(result.status, result.code);
    setError(key ? t[key] : result.status === 0 ? es.common.network : es.common.generic);
    if (key === "consent_mismatch") {
      setConsent(false);
      await session.refresh();
    }
  }

  const open = (path: string) => void Linking.openURL(`${apiOrigin()}${path}`).catch(() => undefined);

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Title>{t.title}</Title>
        <Card>
          <AppText kind="titleS">{t.consentTitle}</AppText>
          <Button label={t.consentTerms} kind="secondary" onPress={() => open(WEB_PAGES.terms)} />
          <Button label={t.consentPrivacy} kind="secondary" onPress={() => open(WEB_PAGES.privacy)} />
          <AppText kind="caption" tone="secondary">
            {t.consentVersion} {version}
          </AppText>
        </Card>
        <Check label={t.consentLabel} value={consent} onChange={setConsent} />
        {error ? <Notice>{error}</Notice> : null}
        <Button label={busy ? t.activating : t.activate} busy={busy} disabled={!consent} onPress={() => void activate()} />
        <Button label={t.signOut} kind="ghost" onPress={() => void session.logout()} />
      </Screen>
    </View>
  );
}
