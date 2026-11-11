"use client";

import { useState } from "react";
import type { LateQuote } from "@/api/models";
import { paths } from "@/api/paths";
import { fractionToPercent } from "@/lib/amount-input";
import { formatDate, todayBogota } from "@/lib/dates";
import { formatPercent } from "@/lib/percent";
import { useI18n } from "@/i18n/provider";
import { useResource } from "../hooks";
import { Badge, ErrorState, Loading, Money, Section, TextField } from "../kit";
import { RateMissingNotice } from "./notes";

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
      <p className="muted">{t.intro}</p>
      <TextField label={t.on} type="date" value={on} onChange={setOn} />
      {quote.loading && !data && <Loading />}
      {quote.failure && <ErrorState message={dict.fin.errors.generic} onRetry={quote.reload} />}
      {data?.rate_missing && <RateMissingNotice />}
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
