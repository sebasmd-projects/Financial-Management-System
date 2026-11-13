"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { LateQuote, LoanRates } from "@/api/models";
import { paths } from "@/api/paths";
import { fractionToPercent, percentToFraction } from "@/lib/amount-input";
import { formatDate, todayBogota } from "@/lib/dates";
import { formatPercent } from "@/lib/percent";
import { useI18n } from "@/i18n/provider";
import { ConventionSelect, type RateConventionCode } from "../conventions";
import { useHref, useResource, useSubmit } from "../hooks";
import { Badge, Banner, ErrorState, FormActions, Loading, Modal, Money, Section, TextField } from "../kit";
import { LATE_RATE_PARAM } from "./notes";

/**
 * Interés de mora (§3.8): sobre el capital de cada cuota vencida, con la tasa de mora del préstamo o, si no, el parámetro
 * vigente. `rate_missing` = no hay tasa con vigencia: no se calcula ni se inventa nada, se lleva a Parámetros. Es un estimado
 * hasta que el usuario lo ajusta a lo que cobró el banco.
 */
export function LatePanel({ loanId }: { loanId: string }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.credit.late;
  const [on, setOn] = useState(todayBogota());
  const quote = useResource<LateQuote>(paths.loanLate(loanId, on));
  const data = quote.data;
  return (
    <Section title={t.title}>
      {!data?.rate_missing && (
        <>
          <p className="muted">{t.intro}</p>
          <TextField label={t.on} type="date" value={on} onChange={setOn} />
        </>
      )}
      {quote.loading && !data && <Loading />}
      {quote.failure && <ErrorState message={dict.fin.errors.generic} onRetry={quote.reload} />}
      {data?.rate_missing && <LateRateMissing loanId={loanId} onSaved={quote.reload} />}
      {data && !data.rate_missing && (
        <>
          {data.rate_ea && (
            <p className="hint">
              {t.rate}: {formatPercent(fractionToPercent(data.rate_ea, 4), locale, 2)} {t.ea} · {data.source === "loan" ? t.sourceLoan : t.sourceParameter}
            </p>
          )}
          {data.rows.length === 0 ? (
            <p className="muted">{t.none}</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="visually-hidden">{t.title}</caption>
                <thead>
                  <tr>
                    <th scope="col">{dict.fin.loans.tableCols.number}</th>
                    <th scope="col">{dict.fin.loans.tableCols.date}</th>
                    <th scope="col" className="table__num">{t.daysLate}</th>
                    <th scope="col" className="table__num">{dict.fin.loans.split.capital}</th>
                    <th scope="col" className="table__num">{t.lateInterest}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.number}>
                      <th scope="row">{row.number}</th>
                      <td>{formatDate(row.due_date)}</td>
                      <td className="table__num">{row.days_late}</td>
                      <td className="table__num"><Money value={row.capital} /></td>
                      <td className="table__num">{row.late_interest === null ? "—" : <Money value={row.late_interest} estimated />}</td>
                    </tr>
                  ))}
                </tbody>
                {data.total !== null && (
                  <tfoot>
                    <tr>
                      <th scope="row" colSpan={4}>{t.total} <Badge dashed>{t.estimate}</Badge></th>
                      <td className="table__num"><Money value={data.total} estimated /></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

/**
 * «Sin tasa de mora registrada» en una línea y, ahí mismo, la acción para registrarla en el préstamo (con fecha y fuente opcional pero
 * recomendada). El parámetro global queda como enlace secundario. Nunca se inventa una tasa.
 */
export function LateRateMissing({ loanId, onSaved, readOnly = false }: { loanId: string; onSaved?: () => void; readOnly?: boolean }) {
  const { dict } = useI18n();
  const o = dict.fin.own.late;
  const href = useHref();
  const [open, setOpen] = useState(false);
  return (
    <div className="fin-phrase" data-testid="late-missing">
      <p>{o.none}</p>
      {!readOnly && (
        <div className="actions">
          <button type="button" className="button button--ghost" onClick={() => setOpen(true)}>
            {o.register}
          </button>
          <Link className="hint" href={`${href("config-parametros")}?clave=${LATE_RATE_PARAM}`}>
            {o.globalLink}
          </Link>
        </div>
      )}
      <Modal open={open} title={o.register} onClose={() => setOpen(false)}>
        <LateRateForm
          loanId={loanId}
          onCancel={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            onSaved?.();
          }}
        />
      </Modal>
    </div>
  );
}

function LateRateForm({ loanId, onDone, onCancel }: { loanId: string; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const o = dict.fin.own.late;
  const submit = useSubmit();
  const [rate, setRate] = useState("");
  const [convention, setConvention] = useState<RateConventionCode>("EA");
  const [from, setFrom] = useState(todayBogota());
  const [source, setSource] = useState("");
  const [touched, setTouched] = useState(false);
  const fraction = percentToFraction(rate);
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (fraction === null || from === "") return;
    const body = { kind: "late", rate: fraction, rate_convention: convention, valid_from: from, ...(source.trim() ? { source: source.trim() } : {}) };
    const result = await submit.run(body, (key) => api.post<LoanRates>(paths.loanRates(loanId), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} noValidate className="fin-form">
      <div className="fin-grid-2">
        <TextField label={o.rate} value={rate} onChange={setRate} inputMode="decimal" required error={touched && fraction === null ? dict.fin.cards.rateInvalid : null} />
        <ConventionSelect label={o.convention} value={convention} onChange={setConvention} />
      </div>
      <TextField label={o.from} type="date" value={from} onChange={setFrom} required />
      <TextField label={o.source} hint={o.sourceHint} value={source} onChange={setSource} maxLength={120} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : o.register}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}
