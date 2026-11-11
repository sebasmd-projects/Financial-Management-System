"use client";

import { useState } from "react";
import { api } from "@/api";
import type { CustomRule, DryRun, RuleCatalog, RuleChannel, RuleOperator, RuleSeverity, RuleTrigger, RuleTriggerKey } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { formatCop } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { useSubmit } from "../hooks";
import { Banner, Checkbox, FormActions, Segmented, SelectField, TextField } from "../kit";
import { DryRunView } from "./dry-run";
import { choiceLabel, fieldLabel, triggerLabel } from "./labels";
import { buildConditions, defaultCondition, fieldOf, OPERATOR_SYMBOLS, parseConditionValue, parseCooldown, ruleProblems, toDraft, withField, type DraftCondition } from "./logic";

const DEFAULT_COOLDOWN = "7";

/**
 * El constructor: CUANDO (disparador) · SI (condiciones, unidas con «y») · ENTONCES (acción) · POR (canales). Todo sale del catálogo
 * cerrado del servidor; el título y el nombre se guardan tal cual (nada se ejecuta: ni plantillas ni expresiones). «Probar ahora»
 * evalúa la definición con los datos de hoy SIN guardar ni crear avisos.
 */
export function RuleForm({ catalog, rule, onDone, onCancel }: { catalog: RuleCatalog; rule: CustomRule | null; onDone: (saved: CustomRule) => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.auto;
  const submit = useSubmit();
  const preview = useSubmit();
  const first = catalog.triggers[0];
  const [name, setName] = useState(rule?.name ?? "");
  const [triggerKey, setTriggerKey] = useState<string>(rule?.trigger ?? first?.key ?? "");
  const trigger: RuleTrigger | undefined = catalog.triggers.find((x) => x.key === triggerKey);
  const [conditions, setConditions] = useState<DraftCondition[]>(() => (rule ? rule.conditions.map(toDraft) : first ? [defaultCondition(first)] : []));
  const [action, setAction] = useState(rule?.action ?? catalog.actions[0] ?? "notify");
  const [title, setTitle] = useState(rule?.title ?? "");
  const [channels, setChannels] = useState<RuleChannel[]>(rule?.channels ?? ["app"]);
  const [severity, setSeverity] = useState<RuleSeverity>(rule?.severity ?? "info");
  const [cooldown, setCooldown] = useState(String(rule?.cooldown_days ?? DEFAULT_COOLDOWN));
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [touched, setTouched] = useState(false);
  const [dry, setDry] = useState<DryRun | null>(null);

  const built = buildConditions(trigger, conditions, catalog.max_conditions);
  const cooldownValue = parseCooldown(cooldown, catalog.cooldown_days);
  const problems = ruleProblems({ name, trigger: triggerKey, conditionsOk: built.conditions !== null, channels, cooldownOk: cooldownValue !== null, titleLength: title.length, maxTitle: catalog.max_title });

  function changeTrigger(key: string) {
    setTriggerKey(key);
    const next = catalog.triggers.find((x) => x.key === key);
    if (next) setConditions([defaultCondition(next)]);
    setDry(null);
  }
  function setCondition(index: number, patch: Partial<DraftCondition>) {
    setConditions((list) => list.map((c, i) => (i === index ? { ...c, ...patch } : c)));
    setDry(null);
  }
  function toggleChannel(channel: RuleChannel, on: boolean) {
    setChannels((list) => (on ? [...list.filter((c) => c !== channel), channel] : list.filter((c) => c !== channel)));
  }

  async function onTest() {
    setTouched(true);
    if (!built.conditions) return;
    const body = { trigger: triggerKey as RuleTriggerKey, conditions: built.conditions };
    const result = await preview.run(body, () => api.post<DryRun>(paths.automationPreview(), body, { locale }));
    if (result.ok) setDry(result.data);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (problems.length > 0 || !built.conditions || cooldownValue === null) return;
    const body = {
      name: name.trim(),
      trigger: triggerKey as RuleTriggerKey,
      conditions: built.conditions,
      channels,
      severity,
      title: title.trim() === "" ? null : title.trim(),
      cooldown_days: cooldownValue,
      enabled,
    };
    const result = rule
      ? await submit.run({ id: rule.id, ...body }, () => api.patch<CustomRule>(paths.automationRule(rule.id), body, { locale }))
      : await submit.run(body, (key) => api.post<CustomRule>(roots.automationRules, body, { idempotencyKey: key, locale }));
    if (result.ok) onDone(result.data);
  }

  const has = (problem: (typeof problems)[number]) => touched && problems.includes(problem);
  const req = dict.fin.common.requiredField;
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={t.name} value={name} onChange={setName} maxLength={80} required error={has("name") ? req : null} />

      <fieldset className="fin-details auto-block">
        <legend>{t.when}</legend>
        <SelectField label={t.trigger} value={triggerKey} onChange={changeTrigger} options={catalog.triggers.map((x) => ({ value: x.key, label: triggerLabel(t, x.key, x.label) }))} />
      </fieldset>

      <fieldset className="fin-details auto-block">
        <legend>{t.ifThen}</legend>
        <p className="hint">{t.conditionsHint}</p>
        {trigger &&
          conditions.map((condition, index) => {
            const field = fieldOf(trigger, condition.field);
            const invalid = touched && built.invalid.includes(index);
            return (
              <div key={index} className="auto-condition" role="group" aria-label={t.conditionN.replace("{n}", String(index + 1))}>
                <SelectField label={t.field} value={condition.field} onChange={(key) => setConditions((list) => list.map((c, i) => (i === index ? withField(trigger, c, key) : c)))} options={trigger.condition_fields.map((f) => ({ value: f.key, label: fieldLabel(t, f.key, f.label) }))} />
                <SelectField label={t.operator} value={condition.op} onChange={(op) => setCondition(index, { op: op as RuleOperator })} options={(field?.operators ?? []).map((op) => ({ value: op, label: `${OPERATOR_SYMBOLS[op as RuleOperator]} ${t.operators[op as RuleOperator]}` }))} />
                {field?.kind === "option" ? (
                  <SelectField label={t.value} value={condition.value} onChange={(value) => setCondition(index, { value })} options={field.choices.map((c) => ({ value: c, label: choiceLabel(t, c) }))} error={invalid ? t.invalidValue[field.kind] : null} />
                ) : (
                  <TextField
                    label={`${t.value} (${field ? t.kinds[field.kind] : ""})`}
                    value={condition.value}
                    onChange={(value) => setCondition(index, { value })}
                    inputMode={field?.kind === "count" ? "numeric" : "decimal"}
                    maxLength={20}
                    required
                    error={invalid && field ? t.invalidValue[field.kind] : null}
                    hint={field?.kind === "amount" ? valueHint(condition.value, field, t.amountRead) : undefined}
                  />
                )}
                {conditions.length > 1 && (
                  <button type="button" className="button button--ghost" onClick={() => { setConditions((list) => list.filter((_, i) => i !== index)); setDry(null); }}>
                    {t.removeCondition}
                    <span className="visually-hidden"> {index + 1}</span>
                  </button>
                )}
              </div>
            );
          })}
        {has("conditions") && built.invalid.length === 0 && <p className="field__error" role="alert">{t.needsCondition}</p>}
        {conditions.length < catalog.max_conditions && trigger && (
          <button type="button" className="button button--ghost" onClick={() => { setConditions((list) => [...list, defaultCondition(trigger)]); setDry(null); }}>
            {t.addCondition}
          </button>
        )}
      </fieldset>

      <fieldset className="fin-details auto-block">
        <legend>{t.then}</legend>
        <SelectField label={t.action} value={action} onChange={setAction} options={catalog.actions.map((a) => ({ value: a, label: (t.actions as Record<string, string>)[a] ?? a }))} />
        <TextField label={t.noticeTitle} hint={t.titleHint.replace("{max}", String(catalog.max_title))} value={title} onChange={setTitle} maxLength={catalog.max_title} error={has("title") ? t.titleTooLong : null} />
        <Segmented legend={t.severity} variant="chips" value={severity} onChange={(v) => setSeverity(v as RuleSeverity)} options={catalog.severities.map((s) => ({ value: s, label: (t.severities as Record<string, string>)[s] ?? s }))} />
      </fieldset>

      <fieldset className="fin-details auto-block">
        <legend>{t.by}</legend>
        {catalog.channels.map((channel) => (
          <Checkbox key={channel} label={(t.channels as Record<string, string>)[channel] ?? channel} checked={channels.includes(channel as RuleChannel)} onChange={(on) => toggleChannel(channel as RuleChannel, on)} hint={channel === "email" || channel === "push" ? t.channelHint : undefined} />
        ))}
        {has("channels") && <p className="field__error" role="alert">{t.needsChannel}</p>}
        <TextField label={t.cooldown} hint={t.cooldownHint.replace("{min}", String(catalog.cooldown_days[0] ?? 1)).replace("{max}", String(catalog.cooldown_days[catalog.cooldown_days.length - 1] ?? 90))} value={cooldown} onChange={setCooldown} inputMode="numeric" maxLength={3} error={has("cooldown") ? t.invalidCooldown : null} />
        <Checkbox label={t.enabled} checked={enabled} onChange={setEnabled} />
      </fieldset>

      <section aria-label={t.testNow}>
        <button type="button" className="button button--ghost" disabled={preview.pending} onClick={() => void onTest()}>
          {preview.pending ? t.testing : t.testNow}
        </button>
        <p className="hint">{t.testHint}</p>
        {preview.error && <Banner tone="negative" live="assertive">{preview.error}</Banner>}
        {dry && <DryRunView dry={dry} trigger={trigger} />}
      </section>

      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : rule ? t.saveChanges : t.create}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

/** El monto tal como se leyó («= $850.000»), para que la persona confirme lo que se va a guardar. */
function valueHint(text: string, field: { kind: "amount" | "percent" | "count" | "option"; choices: string[] }, template: string): string | undefined {
  const value = parseConditionValue(field, text);
  return value === null || text.trim() === "" ? undefined : template.replace("{amount}", formatCop(value));
}
