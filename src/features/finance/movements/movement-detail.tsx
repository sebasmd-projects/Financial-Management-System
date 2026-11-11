"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/api";
import type { Account, Movement, MovementEntries } from "@/api/models";
import { paths } from "@/api/paths";
import { parsePositiveAmount } from "@/lib/amount-input";
import { formatCop } from "@/lib/money";
import { formatDateLong, todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { setDraft } from "../draft-store";
import { effectPhrase, movementAccounts, signedAmount } from "../helpers";
import { useAll, useHref, useResource, useSubmit } from "../hooks";
import { AmountField, Badge, Banner, DefinitionList, Empty, ErrorState, FormActions, Loading, Modal, Money, ScreenHeader, Section, Segmented, SelectField, TextArea, TextField } from "../kit";
import { EntryTable } from "./entry-table";
import { amountToInput } from "./movement-form";

type Action = "confirm" | "annul" | "adjust" | "edit" | null;

/** Detalle de un movimiento (diseño §3.3): monto, estado, frase de efecto, clasificación y acciones. */
export function MovementDetail({ id }: { id: string }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.detail;
  const href = useHref();
  const router = useRouter();
  const movement = useResource<Movement>(paths.movement(id));
  const [action, setAction] = useState<Action>(null);
  const back = { href: href("movimientos"), label: dict.screens.movimientos };

  if (movement.loading && !movement.data) return <div className="screen"><ScreenHeader title={dict.screens.movimiento} back={back} /><Loading /></div>;
  if (movement.failure || !movement.data) {
    return (
      <div className="screen">
        <ScreenHeader title={dict.screens.movimiento} back={back} />
        <ErrorState message={movement.failure?.status === 404 ? dict.fin.errors.notFound : dict.fin.errors.generic} onRetry={movement.reload} />
      </div>
    );
  }
  const m = movement.data;
  const { value, sign } = signedAmount(m);
  const kind = m.type === "expense" ? "egreso" : m.type === "income" ? "ingreso" : "transferencia";
  const pending = m.status === "pendiente";
  const closed = m.voided || m.status === "anulado";
  const title = m.counterparty?.name ?? m.description ?? m.category?.name ?? dict.fin.form.types[m.type];
  const phrase = effectPhrase(
    { type: m.type, pending, account: { name: m.account.name, kind: m.origin === "card_purchase" ? "credit_card" : "savings", posted_balance: "0" }, toAccount: m.to_account ? { name: m.to_account.name, kind: m.origin === "card_payment" ? "credit_card" : "savings" } : null, amount: null },
    dict.fin.form.effect,
    formatCop,
  );

  function duplicate() {
    setDraft({
      type: m.type,
      amount: m.amount,
      accountId: m.account.id,
      toAccountId: m.to_account?.id ?? null,
      categoryId: m.category?.id ?? null,
      description: m.description ?? "",
      counterparty: m.counterparty?.name ?? "",
      nature: (m.nature as "" | "fixed" | "variable") || "",
      classification: (m.classification as "" | "necessary" | "discretionary") || "",
      tags: m.tags.map((tag) => tag.name),
      paymentMethodId: m.payment_method?.id ?? null,
    });
    router.push(href("movimiento-nuevo"));
  }

  const done = () => {
    setAction(null);
    movement.reload();
  };

  return (
    <div className="screen">
      <ScreenHeader title={title} eyebrow={dict.fin.form.types[m.type]} back={back} />
      <section className="fin-card" aria-label={t.summary}>
        <p className="fin-big">
          <Money value={value} sign={sign} kind={kind} strike={closed} />
        </p>
        <p className="fin-row__badges">
          {pending && (
            <Badge dashed>
              {dict.fin.entryStatus.pendiente}
            </Badge>
          )}
          {m.status === "conciliado" && <Badge tone="info">{dict.fin.entryStatus.conciliado}</Badge>}
          {closed && <Badge>{dict.fin.entryStatus.anulado}</Badge>}
          {m.status === "confirmado" && !closed && <Badge tone="positive">{dict.fin.entryStatus.confirmado}</Badge>}
          <span className="muted">{formatDateLong(m.date, locale)}</span>
        </p>
        {phrase && <p className="fin-phrase">{phrase}</p>}
      </section>

      {!closed && (
        <div className="actions">
          {pending && (
            <button type="button" className="button button--primary" onClick={() => setAction("confirm")}>
              {t.confirm}
            </button>
          )}
          <button type="button" className="button button--ghost" onClick={() => setAction("edit")}>
            {t.edit}
          </button>
          {!pending && (
            <button type="button" className="button button--ghost" onClick={() => setAction("adjust")}>
              {t.adjust}
            </button>
          )}
          <button type="button" className="button button--ghost" onClick={duplicate}>
            {t.duplicate}
          </button>
          <button type="button" className="button button--ghost" onClick={() => setAction("annul")}>
            {pending ? t.discard : t.annul}
          </button>
        </div>
      )}
      {closed && (
        <div className="actions">
          <button type="button" className="button button--ghost" onClick={duplicate}>
            {t.duplicate}
          </button>
        </div>
      )}
      {m.status === "conciliado" && <p className="hint">{t.reconciledHint}</p>}

      <Section title={t.classification}>
        <DefinitionList
          rows={[
            { label: dict.fin.form.account, value: m.type === "transfer" ? `${m.account.name} → ${m.to_account?.name ?? ""}` : m.account.name },
            ...(m.category ? [{ label: dict.fin.form.category, value: m.category.path.join(" › ") }] : []),
            ...(m.counterparty ? [{ label: dict.fin.form.counterparty, value: m.counterparty.name }] : []),
            ...(m.nature ? [{ label: dict.fin.form.nature, value: dict.fin.form.natures[m.nature as "fixed" | "variable"] ?? m.nature }] : []),
            ...(m.classification ? [{ label: dict.fin.form.classification, value: dict.fin.form.classifications[m.classification as "necessary" | "discretionary"] ?? m.classification }] : []),
            ...(m.tags.length > 0 ? [{ label: dict.fin.form.tags, value: m.tags.map((tag) => `#${tag.name}`).join(" ") }] : []),
            ...(m.payment_method ? [{ label: dict.fin.form.paymentMethod, value: m.payment_method.name }] : []),
            ...(m.gmf ? [{ label: t.gmf, value: <Money value={m.gmf} /> }] : []),
            ...(m.description ? [{ label: dict.fin.form.description, value: m.description }] : []),
            ...(m.notes ? [{ label: dict.fin.form.notes, value: m.notes }] : []),
            { label: t.origin, value: dict.fin.origins[m.origin] ?? m.origin },
            ...(m.attachments > 0 ? [{ label: t.attachments, value: String(m.attachments) }] : []),
          ]}
        />
      </Section>

      <nav className="fin-links" aria-label={t.more}>
        <Link href={href("movimiento-asientos", [m.id])}>{t.viewEntries}</Link>
      </nav>

      <Modal open={action === "confirm"} title={t.confirm} onClose={() => setAction(null)}>
        <ConfirmForm movement={m} onDone={done} onCancel={() => setAction(null)} />
      </Modal>
      <Modal open={action === "annul"} title={pending ? t.discard : t.annul} onClose={() => setAction(null)}>
        <ReasonForm kind="annul" movement={m} onDone={done} onCancel={() => setAction(null)} />
      </Modal>
      <Modal open={action === "adjust"} title={t.adjust} onClose={() => setAction(null)}>
        <ReasonForm kind="adjust" movement={m} onDone={done} onCancel={() => setAction(null)} />
      </Modal>
      <Modal open={action === "edit"} title={t.edit} onClose={() => setAction(null)}>
        <EditForm movement={m} onDone={done} onCancel={() => setAction(null)} />
      </Modal>
    </div>
  );
}

function Buttons({ pending, label, onCancel, disabled }: { pending: boolean; label: string; onCancel: () => void; disabled?: boolean }) {
  const { dict } = useI18n();
  return (
    <FormActions>
      <button type="submit" className="button button--primary" disabled={pending || disabled}>
        {pending ? dict.fin.common.saving : label}
      </button>
      <button type="button" className="button button--ghost" onClick={onCancel}>
        {dict.common.cancel}
      </button>
    </FormActions>
  );
}

function ConfirmForm({ movement, onDone, onCancel }: { movement: Movement; onDone: () => void; onCancel: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.detail;
  const submit = useSubmit();
  const accounts = useAll<Account>(paths.accounts());
  const [date, setDate] = useState(todayBogota());
  const [amountText, setAmountText] = useState(amountToInput(movement.amount));
  const [accountId, setAccountId] = useState(movement.account.id);
  const amount = parsePositiveAmount(amountText);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!amount) return;
    const body = { date, amount, account_id: accountId };
    const result = await submit.run(body, (key) => api.post(paths.movementAction(movement.id, "confirm"), body, { idempotencyKey: key }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <p className="muted">{t.confirmIntro}</p>
      <AmountField label={dict.fin.form.amount} value={amountText} onChange={setAmountText} required error={amount ? null : dict.fin.common.invalidAmount} preview={amount ? formatCop(amount) : null} />
      <TextField label={dict.fin.form.date} type="date" value={date} onChange={setDate} required />
      <SelectField label={dict.fin.form.account} value={accountId} onChange={setAccountId} options={movementAccounts(accounts.items).map((a) => ({ value: a.id, label: a.name }))} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <Buttons pending={submit.pending} label={t.confirm} onCancel={onCancel} disabled={!amount} />
    </form>
  );
}

/** Anular (motivo obligatorio → reverso) y Ajustar (nuevo monto + motivo → asiento de ajuste): nunca se borra ni se retoca. */
function ReasonForm({ kind, movement, onDone, onCancel }: { kind: "annul" | "adjust"; movement: Movement; onDone: () => void; onCancel: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.detail;
  const submit = useSubmit();
  const [reason, setReason] = useState("");
  const [amountText, setAmountText] = useState(amountToInput(movement.amount));
  const amount = parsePositiveAmount(amountText);
  const valid = reason.trim() !== "" && (kind === "annul" || amount !== null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    const body = kind === "annul" ? { reason: reason.trim() } : { reason: reason.trim(), amount: amount! };
    const result = await submit.run(body, (key) => api.post(paths.movementAction(movement.id, kind), body, { idempotencyKey: key }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <p className="muted">{kind === "annul" ? (movement.status === "pendiente" ? t.discardIntro : t.annulIntro) : t.adjustIntro}</p>
      {kind === "adjust" && <AmountField label={t.newAmount} value={amountText} onChange={setAmountText} required error={amount ? null : dict.fin.common.invalidAmount} preview={amount ? formatCop(amount) : null} />}
      <TextArea label={t.reason} value={reason} onChange={setReason} required maxLength={280} hint={t.reasonHint} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <Buttons pending={submit.pending} label={kind === "annul" ? (movement.status === "pendiente" ? t.discard : t.annul) : t.adjust} onCancel={onCancel} disabled={!valid} />
    </form>
  );
}

/** Editar en el sitio: lo que no toca el libro (descripción, nota, contraparte, naturaleza, clasificación, etiquetas). Dinero y fecha, solo en un pendiente. */
function EditForm({ movement, onDone, onCancel }: { movement: Movement; onDone: () => void; onCancel: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.detail;
  const f = dict.fin.form;
  const submit = useSubmit();
  const pending = movement.status === "pendiente";
  const [description, setDescription] = useState(movement.description ?? "");
  const [counterparty, setCounterparty] = useState(movement.counterparty?.name ?? "");
  const [notes, setNotes] = useState(movement.notes ?? "");
  const [nature, setNature] = useState(movement.nature);
  const [classification, setClassification] = useState(movement.classification);
  const [tags, setTags] = useState(movement.tags.map((tag) => tag.name).join(", "));
  const [amountText, setAmountText] = useState(amountToInput(movement.amount));
  const [date, setDate] = useState(movement.date);
  const amount = parsePositiveAmount(amountText);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending && !amount) return;
    const body = {
      description: description.trim() || null,
      counterparty: counterparty.trim() || null,
      notes: notes.trim() || null,
      nature: nature as "" | "fixed" | "variable",
      classification: classification as "" | "necessary" | "discretionary",
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      ...(pending ? { amount: amount!, date } : {}),
    };
    const result = await submit.run(body, (key) => api.patch(paths.movement(movement.id), body, { idempotencyKey: key }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      {!pending && <p className="muted">{t.editHint}</p>}
      {pending && (
        <>
          <AmountField label={f.amount} value={amountText} onChange={setAmountText} required error={amount ? null : dict.fin.common.invalidAmount} preview={amount ? formatCop(amount) : null} />
          <TextField label={f.date} type="date" value={date} onChange={setDate} required />
        </>
      )}
      {movement.type !== "transfer" && <TextField label={f.counterparty} value={counterparty} onChange={setCounterparty} maxLength={80} />}
      <TextField label={f.description} value={description} onChange={setDescription} maxLength={200} />
      {movement.type !== "transfer" && (
        <>
          <Segmented legend={f.nature} options={[{ value: "", label: f.none }, { value: "fixed", label: f.natures.fixed }, { value: "variable", label: f.natures.variable }]} value={nature} onChange={setNature} />
          <Segmented legend={f.classification} options={[{ value: "", label: f.none }, { value: "necessary", label: f.classifications.necessary }, { value: "discretionary", label: f.classifications.discretionary }]} value={classification} onChange={setClassification} />
          <TextField label={f.tags} hint={f.tagsHint} value={tags} onChange={setTags} />
        </>
      )}
      <TextArea label={f.notes} value={notes} onChange={setNotes} maxLength={280} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <Buttons pending={submit.pending} label={dict.fin.common.save} onCancel={onCancel} disabled={pending && !amount} />
    </form>
  );
}

/** «Ver asientos» (`/movimientos/[id]/asientos`): solo lectura; un movimiento anulado muestra también su reverso. */
export function MovementEntriesScreen({ id }: { id: string }) {
  const { dict } = useI18n();
  const href = useHref();
  const entries = useResource<MovementEntries>(paths.movementEntries(id));
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["movimiento-asientos"]} back={{ href: href("movimiento", [id]), label: dict.screens.movimiento }} />
      <p className="muted">{dict.fin.entries.intro}</p>
      {entries.loading && !entries.data && <Loading />}
      {entries.failure && <ErrorState message={entries.failure.status === 404 ? dict.fin.errors.notFound : dict.fin.errors.generic} onRetry={entries.reload} />}
      {entries.data && entries.data.entries.length === 0 && <Empty title={dict.fin.entries.none} icon="list" />}
      {entries.data?.entries.map((entry) => (
        <EntryTable key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
