"use client";

import { useState, useSyncExternalStore } from "react";
import { api } from "@/api";
import type { Prefs, PrefsPatch } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { useResource, useSubmit } from "../hooks";
import { Banner, Checkbox, ErrorState, FormActions, Loading, Section, TextField } from "../kit";
import { isTime, timeInput } from "./logic";
import { pushPermission, pushSupport, subscribeBrowser, unsubscribeBrowser } from "./push";

/** Preferencias de avisos: canales, horas de silencio, «mostrar montos fuera de la app» y, si el servidor tiene VAPID, Web Push. */
export function PrefsPanel() {
  const { dict } = useI18n();
  const t = dict.fin.notif;
  const prefs = useResource<Prefs>(paths.notificationPrefs());
  return (
    <Section title={t.prefsTitle}>
      {prefs.loading && !prefs.data && <Loading />}
      {prefs.failure && <ErrorState message={dict.fin.errors.generic} onRetry={prefs.reload} />}
      {prefs.data && <PrefsForm prefs={prefs.data} onSaved={prefs.reload} />}
    </Section>
  );
}

const subscribeNothing = () => () => undefined;

function PrefsForm({ prefs, onSaved }: { prefs: Prefs; onSaved: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.notif;
  const submit = useSubmit();
  const push = useSubmit();
  const [email, setEmail] = useState(prefs.email_enabled);
  const [showAmounts, setShowAmounts] = useState(prefs.show_amounts_outside_app);
  const [quietStart, setQuietStart] = useState(timeInput(prefs.quiet_start));
  const [quietEnd, setQuietEnd] = useState(timeInput(prefs.quiet_end));
  const [pushOn, setPushOn] = useState(prefs.push_enabled);
  const [saved, setSaved] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  // El navegador no existe en el servidor: allí «comprobando»; ya hidratado, lo que el navegador dice (sin efectos).
  const support = useSyncExternalStore(subscribeNothing, pushSupport, () => "checking" as const);
  const initialPermission = useSyncExternalStore(subscribeNothing, pushPermission, () => "default" as const);
  const [asked, setAsked] = useState<"granted" | "denied" | "default" | null>(null);
  const permission = asked ?? initialPermission;

  const timesValid = isTime(quietStart) && isTime(quietEnd);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    setSaved(false);
    if (!timesValid) return;
    const body: PrefsPatch = { email_enabled: email, show_amounts_outside_app: showAmounts, quiet_start: quietStart, quiet_end: quietEnd };
    const result = await submit.run(body, (key) => api.patch<Prefs>(paths.notificationPrefs(), body, { idempotencyKey: key, locale }));
    if (result.ok) {
      setSaved(true);
      onSaved();
    }
  }

  /** Activar: permiso → service worker → suscripción → servidor → preferencia. Desactivar: servidor → navegador → preferencia. */
  async function togglePush(next: boolean) {
    setPushMessage(null);
    if (next) {
      let result;
      try {
        result = await subscribeBrowser(locale, prefs.vapid_public_key);
      } catch {
        setPushMessage(t.pushFailed);
        return;
      }
      setAsked(pushPermission());
      if (!result.ok) {
        setPushMessage(result.reason === "denied" ? t.pushDenied : result.reason === "unsupported" ? t.pushUnsupported : t.pushFailed);
        return;
      }
      const payload = result.payload;
      const sub = await push.run(payload, (key) => api.post(roots.pushSubscription, payload, { idempotencyKey: key, locale }));
      if (!sub.ok) return;
      const pref = await push.run({ push_enabled: true }, (key) => api.patch<Prefs>(paths.notificationPrefs(), { push_enabled: true }, { idempotencyKey: key, locale }));
      if (pref.ok) {
        setPushOn(true);
        setPushMessage(t.pushOn);
        onSaved();
      }
      return;
    }
    const endpoint = await unsubscribeBrowser(locale).catch(() => null);
    if (endpoint) {
      const gone = await push.run({ unsubscribe: endpoint }, () => api.delete(roots.pushSubscription, { body: { endpoint } }));
      if (!gone.ok) return;
    }
    const pref = await push.run({ push_enabled: false }, (key) => api.patch<Prefs>(paths.notificationPrefs(), { push_enabled: false }, { idempotencyKey: key, locale }));
    if (pref.ok) {
      setPushOn(false);
      onSaved();
    }
  }

  const pushVisible = prefs.push_available;

  return (
    <form onSubmit={save} noValidate className="fin-form">
      <p className="muted">{t.prefsIntro}</p>
      <Checkbox label={t.channelEmail} checked={email} onChange={setEmail} />
      {pushVisible && (
        <div className="fin-form">
          <Checkbox label={t.channelPush} checked={pushOn} onChange={(v) => void togglePush(v)} hint={t.pushNotice} />
          {support === "unsupported" && <Banner tone="warning"><p>{t.pushUnsupported}</p></Banner>}
          {support === "supported" && permission === "denied" && (
            <Banner tone="warning">
              <p><strong>{t.pushOffTitle}</strong></p>
              <p>{t.pushDenied}</p>
            </Banner>
          )}
          {pushMessage && <Banner tone={pushMessage === t.pushOn ? "positive" : "warning"}><p>{pushMessage}</p></Banner>}
          {push.error && <Banner tone="negative" live="assertive">{push.error}</Banner>}
        </div>
      )}
      <div className="fin-grid-2">
        <TextField label={t.quietStart} help={dict.fin.help.texts.quietHours} type="time" value={quietStart} onChange={setQuietStart} error={touched && !isTime(quietStart) ? t.invalidTime : null} />
        <TextField label={t.quietEnd} help={dict.fin.help.texts.quietHours} type="time" value={quietEnd} onChange={setQuietEnd} error={touched && !isTime(quietEnd) ? t.invalidTime : null} />
      </div>
      <p className="hint">{t.quietHint}</p>
      <Checkbox label={t.showAmounts} hint={t.showAmountsHint} checked={showAmounts} onChange={setShowAmounts} />
      {saved && <Banner tone="positive"><p>{t.prefsSaved}</p></Banner>}
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : dict.fin.common.save}
        </button>
      </FormActions>
    </form>
  );
}
