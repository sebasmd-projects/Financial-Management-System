"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Category, DryRun } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { CategoryCombobox } from "../category-combobox";
import { useAll, useSubmit } from "../hooks";
import { AmountField, Banner, Checkbox, FormActions, Segmented, SelectField, TextField } from "../kit";
import { SyncDryResult } from "./dry-result";
import { buildAutoRule, syncApi, TEXT_OPS, type AutoRuleDraft, type AutoRuleProblem, type CustomRule, type SyncInstitution, type TextOp } from "../../../../core/sync";

const sync = syncApi(api);
const KINDS = ["income", "expense", "transfer_in", "transfer_out"] as const;

/**
 * Crear o editar una regla de autoconfirmación (W3). Todas las condiciones son opcionales —también el monto— pero tiene que haber al menos una; el texto
 * se compara literal (sin expresiones regulares). «Probar» la evalúa contra los correos de los últimos 90 días sin efectos. Crear o cambiarla pide
 * reautenticación (el cliente abre el aviso y repite la petición).
 */
export function AutoRuleForm({ rule, initial, institutions, onDone, onCancel }: { rule: CustomRule | null; initial: AutoRuleDraft; institutions: readonly SyncInstitution[]; onDone: (saved: CustomRule) => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.sync.rules;
  const submit = useSubmit();
  const preview = useSubmit();
  const categories = useAll<Category>(paths.categories({ archived: false }));
  const [draft, setDraft] = useState<AutoRuleDraft>(initial);
  const [problems, setProblems] = useState<AutoRuleProblem[]>([]);
  const [dry, setDry] = useState<DryRun | null>(null);
  const set = <K extends keyof AutoRuleDraft>(key: K, value: AutoRuleDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDry(null);
  };
  const problem = (...keys: AutoRuleProblem[]) => {
    const found = keys.find((key) => problems.includes(key));
    return found ? t.problems[found] : null;
  };

  async function onTest() {
    const built = buildAutoRule({ ...draft, name: draft.name.trim() || "-" });
    if (!built.ok) {
      setProblems(built.problems);
      return;
    }
    setProblems([]);
    const body = { trigger: "sync_event" as const, conditions: built.conditions };
    const result = await preview.run(body, () => sync.previewRule(body, { locale }));
    if (result.ok) setDry(result.data);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const built = buildAutoRule(draft);
    if (!built.ok) {
      setProblems(built.problems);
      return;
    }
    setProblems([]);
    const result = rule
      ? await submit.run({ id: rule.id, ...built.body }, () => sync.patchRule(rule.id, { name: built.body.name, conditions: built.body.conditions, action_category_id: built.body.action_category_id, action_counterparty: built.body.action_counterparty, enabled: built.body.enabled }, { locale }))
      : await submit.run(built.body, (key) => sync.createRule(built.body, key, { locale }));
    if (result.ok) onDone(result.data);
  }

  const categoryKind = draft.kind === "income" || draft.kind === "transfer_in" ? "income" : "expense";
  return (
    <form className="fin-form" onSubmit={(event) => void onSubmit(event)} noValidate>
      <TextField label={t.name} hint={t.nameHint} value={draft.name} onChange={(v) => set("name", v)} maxLength={80} required error={problem("name")} />

      <fieldset className="fin-details auto-block">
        <legend>{t.conditionsTitle}</legend>
        <p className="hint">{t.conditionsHint}</p>
        {problems.includes("no_conditions") && (
          <p className="field__error" role="alert">
            {t.problems.no_conditions}
          </p>
        )}
        <SelectField label={t.institution} value={draft.institution} onChange={(v) => set("institution", v)} placeholder={t.anyInstitution} options={institutions.map((i) => ({ value: i.code, label: i.name }))} />
        <SelectField label={t.kind} value={draft.kind} onChange={(v) => set("kind", v as AutoRuleDraft["kind"])} placeholder={t.anyKind} options={KINDS.map((k) => ({ value: k, label: dict.fin.sync.review.kinds[k] }))} />
        <Segmented legend={t.textOp} variant="chips" value={draft.textOp} onChange={(v) => set("textOp", v as TextOp)} options={TEXT_OPS.map((op) => ({ value: op, label: t.textOps[op] }))} />
        <TextField label={t.text} hint={t.textHint} value={draft.text} onChange={(v) => set("text", v)} maxLength={60} error={problem("text")} />
        <AmountField label={t.amountMin} value={draft.amountMin} onChange={(v) => set("amountMin", v)} error={problem("amount_min", "amount_range")} apiCode={submit.errorCode} />
        <AmountField label={t.amountMax} value={draft.amountMax} onChange={(v) => set("amountMax", v)} error={problem("amount_max")} />
        <TextField label={t.dayMin} hint={t.dayHint} value={draft.dayMin} onChange={(v) => set("dayMin", v)} inputMode="numeric" maxLength={2} error={problem("day_min", "day_range")} />
        <TextField label={t.dayMax} hint={t.dayHint} value={draft.dayMax} onChange={(v) => set("dayMax", v)} inputMode="numeric" maxLength={2} error={problem("day_max")} />
      </fieldset>

      <fieldset className="fin-details auto-block">
        <legend>{t.actionTitle}</legend>
        <CategoryCombobox label={t.category} kind={categoryKind} categories={categories} value={draft.categoryId} onChange={(v) => set("categoryId", v)} placeholder={dict.fin.sync.review.noCategory} />
        <TextField label={t.counterparty} hint={t.counterpartyHint} value={draft.counterparty} onChange={(v) => set("counterparty", v)} maxLength={120} error={problem("counterparty")} />
        <Checkbox label={t.enabled} checked={draft.enabled} onChange={(v) => set("enabled", v)} />
      </fieldset>

      <section aria-label={t.testTitle}>
        <p className="hint">{t.testIntro}</p>
        <button type="button" className="button button--ghost" disabled={preview.pending} onClick={() => void onTest()}>
          {preview.pending ? t.testing : t.testRun}
        </button>
        {preview.error && (
          <Banner tone="negative" live="assertive">
            {preview.error}
          </Banner>
        )}
        {dry && <SyncDryResult dry={dry} />}
      </section>

      <p className="hint">{t.reauthNote}</p>
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
        </Banner>
      )}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? t.saving : rule ? t.save : t.create}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}
