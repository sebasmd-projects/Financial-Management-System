"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Rule } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { useHref, useResource, useSubmit } from "../hooks";
import { Banner, Checkbox, ErrorState, FormActions, Loading, ScreenHeader, TextField } from "../kit";
import { isTime, offsetsText, parseOffsets, timeInput } from "./logic";

interface Draft {
  key: Rule["key"];
  enabled: boolean;
  offsets: string;
  sendTime: string;
  email: boolean;
  push: boolean;
}

const toDraft = (r: Rule): Draft => ({ key: r.key, enabled: r.enabled, offsets: offsetsText(r.offsets), sendTime: timeInput(r.send_time), email: r.channels.includes("email"), push: r.channels.includes("push") });

/** Reglas de avisos (`/configuración/reglas`, diseño §3.16): interruptor, días de anticipación, hora de envío y canales de cada regla. */
export function RulesScreen() {
  const { dict } = useI18n();
  const t = dict.fin.notif;
  const rules = useResource<Rule[]>(paths.notificationRules());
  const href = useHref();
  return (
    <div className="screen screen--form">
      <ScreenHeader title={dict.screens["config-reglas"]} eyebrow={dict.nav.sections.config} back={{ href: href("notificaciones"), label: dict.screens.notificaciones }} />
      {rules.loading && !rules.data && <Loading />}
      {rules.failure && <ErrorState message={dict.fin.errors.generic} onRetry={rules.reload} />}
      {rules.data && <RulesForm rules={rules.data} onSaved={rules.reload} />}
      <p className="muted">{t.rulesIntro}</p>
    </div>
  );
}

function RulesForm({ rules, onSaved }: { rules: readonly Rule[]; onSaved: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.notif;
  const submit = useSubmit();
  const [drafts, setDrafts] = useState<Draft[]>(() => rules.map(toDraft));
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  const patch = (key: string, change: Partial<Draft>) => setDrafts((all) => all.map((d) => (d.key === key ? { ...d, ...change } : d)));

  const problems = drafts.map((d) => ({ offsets: parseOffsets(d.offsets) === null, time: !isTime(d.sendTime) }));
  const valid = problems.every((p) => !p.offsets && !p.time);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    setSaved(false);
    if (!valid) return;
    const body = {
      rules: drafts.map((d) => ({ key: d.key, enabled: d.enabled, offsets: parseOffsets(d.offsets) ?? [], send_time: d.sendTime, channels: ["app", ...(d.email ? ["email"] : []), ...(d.push ? ["push"] : [])] as ("app" | "email" | "push")[] })),
    };
    const result = await submit.run(body, (key) => api.patch<Rule[]>(paths.notificationRules(), body, { idempotencyKey: key, locale }));
    if (result.ok) {
      setSaved(true);
      onSaved();
    }
  }

  return (
    <form onSubmit={save} noValidate className="fin-form">
      {drafts.map((d, index) => {
        const info = t.rules[d.key];
        return (
          <fieldset key={d.key} className="fin-window">
            <legend className="title-s">{info?.title ?? d.key}</legend>
            {info && <p className="muted">{info.body}</p>}
            <Checkbox label={t.ruleEnabled} checked={d.enabled} onChange={(v) => patch(d.key, { enabled: v })} />
            <div className="fin-grid-2">
              <TextField label={d.key === "overdue" ? t.ruleOffsetsOverdue : t.ruleOffsets} hint={t.ruleOffsetsHint} value={d.offsets} onChange={(v) => patch(d.key, { offsets: v })} inputMode="numeric" error={touched && problems[index].offsets ? t.invalidOffsets : null} />
              <TextField label={t.ruleTime} type="time" value={d.sendTime} onChange={(v) => patch(d.key, { sendTime: v })} error={touched && problems[index].time ? t.invalidTime : null} />
            </div>
            <fieldset className="fin-months">
              <legend className="field__label">{t.ruleChannels}</legend>
              <div className="fin-months__grid">
                <label className="fin-months__item">
                  <input type="checkbox" checked disabled />
                  <span>{t.channels.app}</span>
                </label>
                <label className="fin-months__item">
                  <input type="checkbox" checked={d.email} onChange={(e) => patch(d.key, { email: e.target.checked })} />
                  <span>{t.channels.email}</span>
                </label>
                <label className="fin-months__item">
                  <input type="checkbox" checked={d.push} onChange={(e) => patch(d.key, { push: e.target.checked })} />
                  <span>{t.channels.push}</span>
                </label>
              </div>
            </fieldset>
          </fieldset>
        );
      })}
      {saved && <Banner tone="positive"><p>{t.rulesSaved}</p></Banner>}
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : dict.fin.common.save}
        </button>
      </FormActions>
    </form>
  );
}
