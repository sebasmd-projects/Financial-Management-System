"use client";

import { useMemo, useState } from "react";
import { api } from "@/api";
import type { Account, Category } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { CategoryCombobox } from "../category-combobox";
import { accountGroup, disambiguate } from "../helpers";
import { useAll, useSubmit } from "../hooks";
import { AmountField, Banner, FormActions, Segmented, SelectField, TextArea, TextField } from "../kit";
import { buildModify, draftFromEvent, editableFields, syncApi, type ModifyDraft, type ModifyProblem, type SyncEvent } from "../../../../core/sync";

const sync = syncApi(api);

/**
 * «Modificar y aprobar»: todos los campos son editables, el monto incluido (propietario, 2026-11-14). Se envía SOLO lo que cambió y el servidor
 * deja en la auditoría lo de antes y lo de después. Si la propuesta cruzó con un pago pendiente, el tipo y la cuenta no cambian.
 */
export function ModifyForm({ event, onDone, onCancel }: { event: SyncEvent; onDone: (saved: SyncEvent) => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.sync.review;
  const submit = useSubmit();
  const fields = editableFields(event);
  const accounts = useAll<Account>(paths.accounts());
  const categories = useAll<Category>(paths.categories({ archived: false }));
  const [draft, setDraft] = useState<ModifyDraft>(() => draftFromEvent(event));
  const [problems, setProblems] = useState<ModifyProblem[]>([]);
  const options = useMemo(() => disambiguate(accounts.items.filter((a) => a.status !== "closed" && (accountGroup(a) === "bancos" || accountGroup(a) === "efectivo" || a.id === event.account_id))), [accounts.items, event.account_id]);
  const set = <K extends keyof ModifyDraft>(key: K, value: ModifyDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const problem = (key: ModifyProblem) => (problems.includes(key) ? t.problems[key] : null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const built = buildModify(event, draft);
    if (!built.ok) {
      setProblems(built.problems);
      return;
    }
    setProblems([]);
    const result = await submit.run({ id: event.id, ...built.body }, (key) => sync.modify(event.id, built.body, key, { locale }));
    if (result.ok) onDone(result.data);
  }

  return (
    <form className="fin-form" onSubmit={(e) => void onSubmit(e)} noValidate>
      <p>{t.modifyIntro}</p>
      {!fields.type && <p className="hint">{t.modifyLimited}</p>}
      {fields.type && (draft.type === "income" || draft.type === "expense") && event.kind !== "transfer_in" && event.kind !== "transfer_out" && (
        <Segmented legend={t.type} variant="chips" value={draft.type} onChange={(v) => set("type", v as "income" | "expense")} options={[{ value: "expense", label: t.types.expense }, { value: "income", label: t.types.income }]} />
      )}
      <AmountField label={t.amount} value={draft.amount} onChange={(v) => set("amount", v)} required error={problem("amount")} apiCode={submit.errorCode} />
      <TextField label={t.date} type="date" value={draft.date} onChange={(v) => set("date", v)} required error={problem("date")} />
      {fields.account && <SelectField label={t.accountField} value={draft.accountId} onChange={(v) => set("accountId", v)} options={options.map((a) => ({ value: a.id, label: a.name }))} />}
      {event.kind !== "transfer_in" && event.kind !== "transfer_out" && (
        <CategoryCombobox label={t.category} kind={draft.type} categories={categories} value={draft.categoryId} onChange={(v) => set("categoryId", v)} placeholder={t.noCategory} />
      )}
      <TextField label={t.counterparty} value={draft.counterparty} onChange={(v) => set("counterparty", v)} maxLength={120} error={problem("counterparty")} />
      <TextField label={t.description} value={draft.description} onChange={(v) => set("description", v)} maxLength={200} error={problem("description")} />
      <TextArea label={t.notes} value={draft.notes} onChange={(v) => set("notes", v)} maxLength={280} error={problem("notes")} />
      {problems.includes("no_changes") && (
        <Banner tone="warning" live="assertive">
          {t.problems.no_changes}
        </Banner>
      )}
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
        </Banner>
      )}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? t.working : t.saveApprove}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}
