"use client";

import { useState } from "react";
import { api } from "@/api";
import type { EditApplied, EditPreview } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate, formatPeriod, formatTime, periodOf } from "@/lib/dates";
import { compareAmounts } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { useSubmit } from "../hooks";
import { Banner, DefinitionList, FormActions, Money, Section, TextArea } from "../kit";

const DASH = "—";
const money = (value: string | null) => (value === null ? DASH : <Money value={value} />);

/**
 * Pantalla de confirmación de editar un movimiento confirmado: lo que dijo el servidor en `edit/preview` (nada se escribió aún).
 * Muestra asientos que se anulan y nacen, saldos, «Gastado» por mes, 4x1000 antes y después y cuotas. «Aplicar» manda el token de un
 * solo uso con el motivo; una edición de una sola cifra sin encadenar queda como UN asiento de ajuste (`mode: adjustment`).
 */
export function EditPreviewPanel({ movementId, preview, onApplied, onBack }: { movementId: string; preview: EditPreview; onApplied: (applied: EditApplied) => void; onBack: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.edit;
  const submit = useSubmit();
  const [reason, setReason] = useState("");
  const fx = preview.effects;

  async function onApply(event: React.FormEvent) {
    event.preventDefault();
    if (reason.trim() === "") return;
    const body = { token: preview.token, reason: reason.trim() };
    const result = await submit.run(body, (key) => api.post<EditApplied>(paths.movementEdit(movementId, "apply"), body, { idempotencyKey: key, locale }));
    if (result.ok) onApplied(result.data);
  }

  const changedBalances = fx.balances;
  return (
    <form onSubmit={onApply} className="fin-form" noValidate aria-label={t.title}>
      <h3 className="title-s">{t.title}</h3>
      <p className="fin-phrase" data-testid="edit-mode">
        {t.modes[fx.mode]}
      </p>
      <p className="hint">
        {t.expires} {formatTime(preview.expires_at)}
      </p>

      {fx.changed_fields.length > 0 && (
        <Section title={t.changedFields}>
          <p>{fx.changed_fields.map((f) => t.fields[f] ?? f).join(", ")}</p>
        </Section>
      )}
      {fx.chained.length > 0 && (
        <Section title={t.chained}>
          <ul>
            {fx.chained.map((c) => (
              <li key={c}>{t.chainedKinds[c] ?? c}</li>
            ))}
          </ul>
        </Section>
      )}

      {(fx.entries_annulled.length > 0 || fx.entries_created.length > 0) && (
        <Section title={t.entries}>
          {fx.entries_annulled.length > 0 && (
            <>
              <h4 className="title-s">{t.annulled}</h4>
              <ul data-testid="entries-annulled">
                {fx.entries_annulled.map((e) => (
                  <li key={e.id}>
                    {t.entryNo} {e.number} · {formatDate(e.date)} · <Money value={e.total} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {fx.entries_created.length > 0 && (
            <>
              <h4 className="title-s">{t.created}</h4>
              <ul data-testid="entries-created">
                {fx.entries_created.map((e) => (
                  <li key={e.id}>
                    {t.entryNo} {e.number} · {formatDate(e.date)} · <Money value={e.total} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      )}

      {changedBalances.length > 0 && (
        <Section title={t.balances}>
          <div className="table-wrap">
            <table className="table" data-testid="edit-balances">
              <thead>
                <tr>
                  <th scope="col">{dict.fin.entries.account}</th>
                  <th scope="col" className="table__num">{t.before}</th>
                  <th scope="col" className="table__num">{t.after}</th>
                </tr>
              </thead>
              <tbody>
                {changedBalances.map((b) => (
                  <tr key={b.account_id}>
                    <th scope="row">{b.name}</th>
                    <td className="table__num">{money(b.posted_before)}</td>
                    <td className="table__num">{money(b.posted_after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {fx.spent.length > 0 && (
        <Section title={t.spent}>
          <div className="table-wrap">
            <table className="table" data-testid="edit-spent">
              <thead>
                <tr>
                  <th scope="col">{t.month}</th>
                  <th scope="col" className="table__num">{t.before}</th>
                  <th scope="col" className="table__num">{t.after}</th>
                </tr>
              </thead>
              <tbody>
                {fx.spent.map((s) => (
                  <tr key={s.period}>
                    <th scope="row">{formatPeriod(periodOf(s.period), locale)}</th>
                    <td className="table__num"><Money value={s.before} /></td>
                    <td className="table__num"><Money value={s.after} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {(fx.gmf.before !== null || fx.gmf.after !== null) && (
        <Section title={t.gmf}>
          <p data-testid="edit-gmf">
            {t.before}: {money(fx.gmf.before)} → {t.after}: {money(fx.gmf.after)}
          </p>
        </Section>
      )}

      {fx.installments && (
        <Section title={t.installments}>
          <DefinitionList
            rows={[
              { label: t.installmentsCount, value: `${fx.installments.before.installments ?? DASH} → ${fx.installments.after.installments ?? DASH}` },
              { label: dict.fin.spent.purchaseValue, value: <>{money(fx.installments.before.purchase_value ?? null)} → {money(fx.installments.after.purchase_value ?? null)}</> },
              { label: dict.fin.purchase.totalInterest, value: <>{money(fx.installments.before.total_interest ?? null)} → {money(fx.installments.after.total_interest ?? null)}</> },
              { label: dict.fin.spent.realCost, value: <>{money(fx.installments.before.total_real_cost ?? null)} → {money(fx.installments.after.total_real_cost ?? null)}</> },
            ]}
          />
          {fx.installments.before.total_real_cost && fx.installments.after.total_real_cost && compareAmounts(fx.installments.before.total_real_cost, fx.installments.after.total_real_cost) !== 0 && <p className="hint">{t.installmentsHint}</p>}
        </Section>
      )}

      {fx.notes.length > 0 && (
        <ul className="hint">
          {fx.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      <TextArea label={t.reason} hint={t.reasonHint} value={reason} onChange={setReason} required maxLength={280} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || reason.trim() === ""}>
          {submit.pending ? dict.fin.common.saving : t.apply}
        </button>
        <button type="button" className="button button--ghost" onClick={onBack}>
          {t.back}
        </button>
      </FormActions>
    </form>
  );
}
