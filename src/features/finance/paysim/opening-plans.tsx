"use client";

import { useId, useState } from "react";
import type { Card, OpeningImport, OpeningPlanCreated, OpeningPlans, OpeningPreview, PlanSummary } from "@/api/models";
import { api } from "@/api";
import { errorText } from "@/api/errors";
import { saveBlob } from "@/api/download";
import { paths } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { compareAmounts } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { useConventionLabel } from "../conventions";
import { fill } from "../helpers";
import { useCanWrite } from "../../household/scope-store";
import { useHref, useResource, useSubmit } from "../hooks";
import { AmountField, Badge, Banner, Checkbox, DefinitionList, Empty, ErrorState, FormActions, Loading, Modal, Money, ScreenHeader, Section, Slots, TextField } from "../kit";
import { RateInput } from "../simulators/sim-kit";
import { buildOpening, buildOpeningUpload, EMPTY_OPENING, openingFileProblem, openingFingerprint, ratePercent, type OpeningInputs } from "./logic";

/** Excel en español abre bien un CSV con acentos solo si trae la marca BOM: se antepone al descargar (el servidor no la envía). */
const BOM = "﻿";

/**
 * «Compras a cuotas vigentes» de una tarjeta: las compras a cuotas hechas ANTES de empezar a usar Finanzas y aún a medio pagar. Crea el plan y las
 * cuotas que faltan (sin gasto nuevo: la compra ocurrió antes) para que el pago mínimo y la proyección no se queden cortos. La cuenta: saldo inicial =
 * saldo revolvente + capital de estas compras. Se registra de a una o con un archivo (vista previa primero; nada se crea hasta confirmar).
 */
export function OpeningPlansScreen({ id }: { id: string }) {
  const { dict } = useI18n();
  const t = dict.fin.opening;
  const href = useHref();
  const canWrite = useCanWrite();
  const card = useResource<Card>(paths.card(id));
  const data = useResource<OpeningPlans>(paths.cardOpeningPlans(id));
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["tarjeta-cuotas-vigentes"]} eyebrow={card.data?.name ?? t.eyebrow} back={{ href: href("tarjeta", [id]), label: card.data?.name ?? dict.fin.paysim.backToCard }} />
      <p className="muted">{t.intro}</p>
      {data.loading && !data.data && <Loading />}
      {data.failure && <ErrorState message={dict.fin.errors.generic} onRetry={data.reload} />}
      {data.data && (
        <>
          <Reconciliation recon={data.data.reconciliation} />
          {canWrite && <OpeningForm id={id} onDone={data.reload} />}
          <PlansList id={id} plans={data.data.plans} canWrite={canWrite} onChange={data.reload} />
          {canWrite && <ImportPanel id={id} onDone={data.reload} />}
        </>
      )}
    </div>
  );
}

function Reconciliation({ recon }: { recon: OpeningPlans["reconciliation"] }) {
  const { dict } = useI18n();
  const t = dict.fin.opening;
  const gap = compareAmounts(recon.revolving_gap, "0") < 0;
  return (
    <section className="fin-card" aria-label={t.howTitle}>
      <h2 className="title-s">{t.howTitle}</h2>
      <p className="muted">{t.how}</p>
      <DefinitionList
        rows={[
          { label: t.reconcile.opening, value: <Money value={recon.opening_balance} /> },
          { label: t.reconcile.plans, value: <Money value={recon.plans_capital} /> },
          { label: t.reconcile.revolving, value: <Money value={recon.revolving} /> },
          { label: t.reconcile.balance, value: <Money value={recon.balance} /> },
        ]}
      />
      {gap ? <Banner tone="warning"><Slots template={t.reconcile.gap} vars={{ amount: <Money value={recon.revolving_gap.replace("-", "")} /> }} /></Banner> : compareAmounts(recon.plans_capital, "0") > 0 && <p><Badge tone="positive">{t.reconcile.ok}</Badge></p>}
    </section>
  );
}

function OpeningForm({ id, onDone }: { id: string; onDone: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.opening.form;
  const submit = useSubmit();
  const [input, setInput] = useState<OpeningInputs>(EMPTY_OPENING);
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState<OpeningPlanCreated | null>(null);
  const set = <K extends keyof OpeningInputs>(key: K) => (value: OpeningInputs[K]) => setInput((prev) => ({ ...prev, [key]: value }));
  const built = buildOpening(input);
  const bad = (p: string) => (touched && built.problem === p ? dict.fin.errors.validation : null);
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!built.body) return;
    const body = built.body;
    const result = await submit.run(body, (key) => api.post<OpeningPlanCreated>(paths.cardOpeningPlans(id), body, { idempotencyKey: key, locale }));
    if (result.ok) {
      setSaved(result.data);
      setInput(EMPTY_OPENING);
      setTouched(false);
      onDone();
    }
  }
  return (
    <Section title={t.heading}>
      <form onSubmit={onSubmit} className="fin-form" noValidate>
        {saved && <Banner tone="positive">{fill(t.saved, { date: formatDate(saved.first_cutoff) })}</Banner>}
        <div className="fin-grid-2">
          <TextField label={t.purchaseDate} type="date" value={input.purchaseDate} onChange={set("purchaseDate")} required error={bad("date")} />
          <TextField label={t.description} value={input.description} onChange={set("description")} maxLength={200} />
        </div>
        <div className="fin-grid-2">
          <AmountField label={t.original} value={input.original} onChange={set("original")} required error={bad("original")} />
          <TextField label={t.count} value={input.count} onChange={set("count")} inputMode="numeric" maxLength={2} required error={bad("count")} />
        </div>
        <TextField label={t.billed} hint={t.billedHint} value={input.billed} onChange={set("billed")} inputMode="numeric" maxLength={2} required error={bad("billed")} />
        <AmountField label={t.remaining} hint={t.remainingHint} value={input.remaining} onChange={set("remaining")} error={bad("remaining")} />
        <RateInput rate={input.rate} onRate={set("rate")} convention={input.convention} onConvention={set("convention")} error={bad("rate")} />
        <p className="hint">{t.rateHint}</p>
        <TextField label={t.nextDate} hint={t.nextDateHint} type="date" value={input.nextDate} onChange={set("nextDate")} error={bad("next")} />
        <Checkbox label={t.addToOpening} hint={t.addToOpeningHint} checked={input.addToOpening} onChange={set("addToOpening")} />
        {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
        <FormActions>
          <button type="submit" className="button button--primary" disabled={submit.pending}>
            {submit.pending ? t.saving : t.save}
          </button>
        </FormActions>
      </form>
    </Section>
  );
}

function PlansList({ id, plans, canWrite, onChange }: { id: string; plans: readonly PlanSummary[]; canWrite: boolean; onChange: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.opening.list;
  const [removing, setRemoving] = useState<PlanSummary | null>(null);
  const remove = useSubmit();
  async function confirm() {
    if (!removing) return;
    const result = await remove.run({ remove: removing.id }, () => api.delete(paths.cardOpeningPlan(id, removing.id)));
    if (result.ok) {
      setRemoving(null);
      onChange();
    }
  }
  return (
    <Section title={t.heading}>
      {plans.length === 0 && <Empty icon="card" title={t.empty} />}
      <ul className="fin-list">
        {plans.map((plan) => (
          <li key={plan.id} className="fin-row fin-row--plan">
            <span className="fin-row__main">
              <span className="fin-row__title">{plan.description || t.unnamed}</span>
              <span className="fin-row__sub muted">
                {formatDate(plan.date)} · <Money value={plan.purchase_value} /> ·{" "}
                <Slots template={t.line} vars={{ billed: String(plan.billed), count: String(plan.installments), remaining: <Money value={plan.remaining_principal ?? "0"} /> }} />
              </span>
              {plan.next_payment && (
                <span className="fin-row__sub muted">
                  <Slots template={t.next} vars={{ amount: <Money value={plan.next_payment} /> }} />
                </span>
              )}
            </span>
            {canWrite && (
              <button type="button" className="button button--ghost" onClick={() => setRemoving(plan)}>
                {t.remove}
              </button>
            )}
          </li>
        ))}
      </ul>
      <Modal open={removing !== null} title={removing ? fill(t.removeConfirm, { name: removing.description || t.unnamed }) : ""} onClose={() => setRemoving(null)}>
        <p>{t.removeBody}</p>
        {remove.error && <Banner tone="negative" live="assertive">{remove.error}</Banner>}
        <FormActions>
          <button type="button" className="button button--ghost" onClick={() => setRemoving(null)}>{dict.common.cancel}</button>
          <button type="button" className="button button--danger" onClick={() => void confirm()} disabled={remove.pending}>
            {t.remove}
          </button>
        </FormActions>
      </Modal>
    </Section>
  );
}

function ImportPanel({ id, onDone }: { id: string; onDone: () => void }) {
  const { dict, locale } = useI18n();
  const convName = useConventionLabel();
  const t = dict.fin.opening.import;
  const fileId = useId();
  const submit = useSubmit();
  const [file, setFile] = useState<File | null>(null);
  const [add, setAdd] = useState(false);
  const [preview, setPreview] = useState<OpeningPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<OpeningImport | null>(null);

  async function load(chosen: File | null, addToOpening: boolean) {
    setPreview(null);
    setDone(null);
    setError(null);
    if (!chosen) return;
    const problem = openingFileProblem(chosen);
    if (problem) {
      setError(problem === "extension" ? dict.fin.imp.file.extension : dict.fin.imp.file.tooLarge);
      return;
    }
    setBusy(true);
    try {
      const response = await api.post<OpeningPreview>(paths.openingPlansPreview(), buildOpeningUpload(chosen, id, addToOpening), { locale });
      if (!response.ok) setError(errorText(response, dict.fin.errors));
      else setPreview(response.data);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file) return;
    const outcome = await submit.run(openingFingerprint(file, id, add), (key) => api.post<OpeningImport>(paths.openingPlansImport(), buildOpeningUpload(file, id, add), { idempotencyKey: key, locale }));
    if (outcome.ok) {
      setDone(outcome.data);
      setPreview(null);
      setFile(null);
      onDone();
    }
  }

  async function template() {
    const response = await api.get<{ formats: { kind: string; template_csv: string; template_filename: string }[] }>(paths.importFormats());
    const format = response.ok ? response.data.formats.find((f) => f.kind === "opening_plans") : undefined;
    if (format) saveBlob(new Blob([BOM, format.template_csv], { type: "text/csv;charset=utf-8" }), format.template_filename);
  }

  const ready = preview ? preview.rows.filter((r) => r.validity !== "error" && !r.reasons.includes("already_imported")).length : 0;
  return (
    <Section title={t.heading}>
      <p className="muted">{t.intro}</p>
      <div className="actions">
        <button type="button" className="button button--ghost" onClick={() => void template()}>{t.template}</button>
      </div>
      <div className="field">
        <label className="field__label" htmlFor={fileId}>{t.file}</label>
        <input id={fileId} className="input" type="file" accept=".csv,.txt,.xlsx" onChange={(event) => { const chosen = event.target.files?.[0] ?? null; setFile(chosen); void load(chosen, add); }} />
      </div>
      <Checkbox label={dict.fin.opening.form.addToOpening} hint={dict.fin.opening.form.addToOpeningHint} checked={add} onChange={(v) => { setAdd(v); void load(file, v); }} />
      {busy && <Loading label={t.previewing} />}
      {error && <Banner tone="negative" live="assertive">{error}</Banner>}
      {done && <Banner tone="positive">{fill(t.done, { created: String(done.created), skipped: String(done.skipped) })}</Banner>}
      {preview && (
        <div className="fin-stack" aria-live="polite">
          <p>{fill(t.counts, { valid: String(preview.counts.valid ?? 0), warning: String(preview.counts.warning ?? 0), error: String(preview.counts.error ?? 0) })}</p>
          {preview.ignored_columns.length > 0 && <p className="hint">{fill(t.ignored, { list: preview.ignored_columns.join(", ") })}</p>}
          <div className="table-wrap" tabIndex={0} role="region" aria-label={t.heading}>
            <table className="table">
              <caption className="visually-hidden">{t.heading}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.columns.row}</th>
                  <th scope="col">{t.columns.date}</th>
                  <th scope="col">{t.columns.description}</th>
                  <th scope="col" className="table__num">{t.columns.original}</th>
                  <th scope="col" className="table__num">{t.columns.count}</th>
                  <th scope="col" className="table__num">{t.columns.billed}</th>
                  <th scope="col" className="table__num">{t.columns.remaining}</th>
                  <th scope="col">{t.columns.rate}</th>
                  <th scope="col">{t.columns.next}</th>
                  <th scope="col" className="table__num">{t.columns.payment}</th>
                  <th scope="col">{t.columns.status}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.number}>
                    <th scope="row">{r.number}</th>
                    <td>{r.purchase_date ? formatDate(r.purchase_date) : "—"}</td>
                    <td>{r.description}</td>
                    <td className="table__num">{r.original ? <Money value={r.original} /> : "—"}</td>
                    <td className="table__num">{r.count ?? "—"}</td>
                    <td className="table__num">{r.billed ?? "—"}</td>
                    <td className="table__num">
                      {r.remaining ? <Money value={r.remaining} /> : "—"}
                      {r.remaining_source ? <span className="muted"> ({t.source[r.remaining_source]})</span> : null}
                    </td>
                    <td>{r.rate ? `${ratePercent(r.rate, locale)} ${convName(r.rate_convention ?? "EA")}` : "—"}</td>
                    <td>{r.first_cutoff ? formatDate(r.first_cutoff) : "—"}</td>
                    <td className="table__num">{r.next_payment ? <Money value={r.next_payment} /> : "—"}</td>
                    <td>
                      <Badge tone={r.validity === "valid" ? "positive" : r.validity === "warning" ? "warning" : "negative"}>{t.status[r.validity]}</Badge>
                      {r.reasons.map((reason) => (
                        <span key={reason} className="muted"> {t.reasons[reason as keyof typeof t.reasons] ?? reason}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <Slots template={t.capital} vars={{ amount: <Money value={preview.plans_capital} /> }} />
          </p>
          <DefinitionList
            rows={[
              { label: dict.fin.opening.reconcile.opening, value: <Money value={preview.reconciliation_after.opening_balance} /> },
              { label: dict.fin.opening.reconcile.plans, value: <Money value={preview.reconciliation_after.plans_capital} /> },
              { label: dict.fin.opening.reconcile.revolving, value: <Money value={preview.reconciliation_after.revolving} /> },
            ]}
          />
          {compareAmounts(preview.reconciliation_after.revolving_gap, "0") < 0 && <Banner tone="warning">{dict.fin.opening.import.warnings.opening_plans_exceed_balance}</Banner>}
          {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
          <FormActions>
            <button type="button" className="button button--primary" disabled={submit.pending || ready === 0} onClick={() => void commit()}>
              {submit.pending ? t.committing : fill(t.commit, { n: String(ready) })}
            </button>
          </FormActions>
        </div>
      )}
    </Section>
  );
}
