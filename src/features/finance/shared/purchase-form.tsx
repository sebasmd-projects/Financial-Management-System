"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Account, Category, Named, SharedMode, SharedPurchase } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { todayBogota } from "@/lib/dates";
import { formatCop } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { movementAccounts } from "../helpers";
import { useAll, useSubmit } from "../hooks";
import { AmountField, Banner, FormActions, Segmented, SelectField, TextField } from "../kit";
import { MAX_PEOPLE, previewSplit, purchaseBody, SHARED_MODES, type PersonDraft } from "./logic";

/**
 * «Dividir» (§3.14): quién paga (una cuenta de activo o una tarjeta de crédito), el total, y entre quiénes: por partes iguales,
 * por porcentaje o por monto. Mi parte es gasto; la de cada persona queda como una cuenta por cobrar. La vista previa usa las mismas
 * reglas del servidor (lo de los demás hacia abajo al centavo; lo que sobra es mío); el que decide es el servidor.
 */
export function PurchaseForm({ onDone, onCancel }: { onDone: (purchase: SharedPurchase) => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.shared;
  const submit = useSubmit();
  const accounts = useAll<Account>(paths.accounts());
  const categories = useAll<Category>(paths.categories({ archived: false }));
  const people = useAll<Named>(paths.counterparties());
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [total, setTotal] = useState("");
  const [date, setDate] = useState(todayBogota());
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<SharedMode>("equal");
  const [rows, setRows] = useState<PersonDraft[]>([{ counterpartyId: "", value: "" }]);
  const [touched, setTouched] = useState(false);

  const usable = movementAccounts(accounts.items);
  const account = accountId || usable[0]?.id || "";
  const split = previewSplit(total, mode, rows);
  const result = purchaseBody({ accountId: account, categoryId, total, date, mode, people: rows, description });
  const names = new Map(people.items.map((p) => [p.id, p.name]));
  const taken = new Set(rows.map((r) => r.counterpartyId));

  function setRow(index: number, patch: Partial<PersonDraft>) {
    setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!result.ok) return;
    const body = result.body;
    const created = await submit.run(body, (key) => api.post<SharedPurchase>(roots.sharedPurchases, body, { idempotencyKey: key, locale }));
    if (created.ok) onDone(created.data);
  }

  const problem = !result.ok && touched ? result.problem : null;
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <SelectField
        label={t.payFrom}
        hint={t.payFromHint}
        value={account}
        onChange={setAccountId}
        options={usable.map((a) => ({ value: a.id, label: a.kind === "credit_card" ? `${a.name} · ${t.card}` : a.name }))}
        error={problem === "account" ? t.problems.account : null}
      />
      <AmountField label={t.total} value={total} onChange={setTotal} required error={problem === "total" ? t.problems.total : null} apiCode={submit.errorCode} />
      <div className="fin-grid-2">
        <TextField label={t.date} type="date" value={date} onChange={setDate} required error={problem === "date" ? dict.fin.common.requiredField : null} />
        <SelectField label={t.category} value={categoryId} onChange={setCategoryId} placeholder={t.noCategory} options={categories.items.filter((c) => c.kind === "expense").map((c) => ({ value: c.id, label: c.path.join(" › ") }))} />
      </div>
      <TextField label={t.description} value={description} onChange={setDescription} maxLength={280} />

      <Segmented legend={t.mode} value={mode} onChange={(v) => setMode(v as SharedMode)} options={SHARED_MODES.map((m) => ({ value: m, label: t.modes[m] }))} />
      <p className="hint">{t.modeHints[mode]}</p>

      <fieldset className="fin-details auto-block">
        <legend>{t.people}</legend>
        {people.items.length === 0 && !people.loading && <p className="muted">{t.noPeople}</p>}
        {rows.map((row, index) => (
          <div key={index} className="auto-condition" role="group" aria-label={t.personN.replace("{n}", String(index + 1))}>
            <SelectField
              label={t.person}
              value={row.counterpartyId}
              onChange={(value) => setRow(index, { counterpartyId: value })}
              placeholder={t.choosePerson}
              options={people.items.filter((p) => !p.archived && (p.id === row.counterpartyId || !taken.has(p.id))).map((p) => ({ value: p.id, label: p.name }))}
              error={problem === "duplicate" && row.counterpartyId === "" ? t.problems.person : null}
            />
            {mode === "percent" && <TextField label={t.percent} hint={t.percentHint} value={row.value} onChange={(value) => setRow(index, { value })} inputMode="decimal" required error={problem === "value" || problem === "percentages" ? (problem === "percentages" ? t.problems.percentages : t.problems.percent) : null} />}
            {mode === "amount" && <AmountField label={t.amount} value={row.value} onChange={(value) => setRow(index, { value })} required error={problem === "value" || problem === "exceeds" ? (problem === "exceeds" ? t.problems.exceeds : dict.fin.common.invalidAmount) : null} apiCode={submit.errorCode} />}
            {split.ok && row.counterpartyId && (
              <p className="muted" aria-live="polite">
                {t.owesYou.replace("{name}", names.get(row.counterpartyId) ?? t.person)} {formatCop(split.split.shares[index])}
              </p>
            )}
            {rows.length > 1 && (
              <button type="button" className="button button--ghost" onClick={() => setRows((list) => list.filter((_, i) => i !== index))}>
                {t.removePerson}
                <span className="visually-hidden"> {index + 1}</span>
              </button>
            )}
          </div>
        ))}
        {rows.length < MAX_PEOPLE && (
          <button type="button" className="button button--ghost" onClick={() => setRows((list) => [...list, { counterpartyId: "", value: "" }])}>
            {t.addPerson}
          </button>
        )}
        <NewPerson onCreated={(person) => { people.reload(); setRows((list) => { const empty = list.findIndex((r) => r.counterpartyId === ""); return empty === -1 ? [...list, { counterpartyId: person.id, value: "" }] : list.map((r, i) => (i === empty ? { ...r, counterpartyId: person.id } : r)); }); }} />
        {problem === "people" && <p className="field__error" role="alert">{t.problems.people}</p>}
        {problem === "tooSmall" && <p className="field__error" role="alert">{t.problems.tooSmall}</p>}
      </fieldset>

      {split.ok && (
        <p className="fin-phrase" aria-live="polite" data-testid="my-share">
          {t.myShare} <strong>{formatCop(split.split.mine)}</strong> · {t.restOwed}
        </p>
      )}
      <p className="hint">{t.effectHint}</p>
      {submit.error && submit.errorCode !== "too_many_decimals" && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : t.create}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

/** Una persona nueva (contacto propio de la aplicación; el nombre va cifrado en el servidor). */
function NewPerson({ onCreated }: { onCreated: (person: Named) => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.shared;
  const submit = useSubmit();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  async function create() {
    const trimmed = name.trim();
    if (trimmed === "") return;
    const body = { name: trimmed };
    const result = await submit.run(body, (key) => api.post<Named>(roots.counterparties, body, { idempotencyKey: key, locale }));
    if (result.ok) {
      setName("");
      setOpen(false);
      onCreated(result.data);
    }
  }
  if (!open) {
    return (
      <button type="button" className="button button--ghost" onClick={() => setOpen(true)}>
        {t.newPerson}
      </button>
    );
  }
  return (
    <div className="fin-window">
      <TextField label={t.newPersonName} value={name} onChange={setName} maxLength={80} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <div className="actions">
        <button type="button" className="button button--primary" disabled={submit.pending || name.trim() === ""} onClick={() => void create()}>
          {submit.pending ? dict.fin.common.saving : t.savePerson}
        </button>
        <button type="button" className="button button--ghost" onClick={() => setOpen(false)}>
          {dict.common.cancel}
        </button>
      </div>
    </div>
  );
}
