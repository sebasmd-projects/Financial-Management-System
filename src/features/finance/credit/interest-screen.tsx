"use client";

import { useState } from "react";
import type { CreditInterest } from "@/api/models";
import { paths } from "@/api/paths";
import { fractionToPercent } from "@/lib/amount-input";
import { formatDate, formatPeriod, periodOf } from "@/lib/dates";
import { formatUnits } from "@/lib/decimal";
import { formatPercent } from "@/lib/percent";
import { useI18n } from "@/i18n/provider";
import { useResource } from "../hooks";
import { useConventionLabel } from "../conventions";
import { Badge, Empty, ErrorState, Loading, Money, ScreenHeader, Section, TextField } from "../kit";
import { CreditTabs } from "./credit-tabs";
import { AmountOrPending, IndexNoticeBanner } from "../uvr/pending";
import { UsuryNote } from "./notes";

/** Intereses (`/creditos/intereses`, §3.8): corriente y de mora por mes y obligación, tasa vigente y comparación con la usura. */
export function InterestScreen() {
  const { dict, locale } = useI18n();
  const convName = useConventionLabel();
  const t = dict.fin.credit.interest;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const data = useResource<CreditInterest>(paths.creditInterest({ from: from || undefined, to: to || undefined }));
  const d = data.data;
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["creditos-intereses"]} eyebrow={dict.nav.sections.creditos} />
      <CreditTabs current="creditos-intereses" />
      <div className="fin-grid-2">
        <TextField label={t.from} type="date" value={from} onChange={setFrom} hint={t.rangeHint} />
        <TextField label={t.to} type="date" value={to} onChange={setTo} />
      </div>
      {data.loading && !d && <Loading />}
      {data.failure && <ErrorState message={dict.fin.errors.generic} onRetry={data.reload} />}
      {d && <IndexNoticeBanner notices={d.notices} />}
      {d && d.rows.length === 0 && d.obligations.length === 0 && <Empty icon="loan" title={t.emptyTitle} body={t.emptyBody} />}
      {d && (d.rows.length > 0 || d.obligations.length > 0) && (
        <>
          <section className="fin-card" aria-label={t.totals}>
            <p>
              <span className="muted">{t.totalInterest}</span> <strong><Money value={d.total_interest} /></strong>
            </p>
            <p>
              <span className="muted">{t.totalLate}</span> <strong><Money value={d.total_late_interest} /></strong>
            </p>
          </section>
          <Section title={t.rates}>
            {d.obligations.length === 0 && <p className="muted">{t.noObligations}</p>}
            <ul className="fin-list">
              {d.obligations.map((o) => (
                <li key={o.obligation_id} className="fin-row fin-row--static">
                  <span className="fin-row__main">
                    <span className="fin-row__title">{o.obligation_name}</span>
                    <span className="fin-row__sub muted">
                      {formatPercent(fractionToPercent(o.rate, 4), locale, 4)} {convName(o.convention)} · {formatPercent(fractionToPercent(o.rate_ea, 4), locale, 2)} {dict.fin.credit.late.ea}
                    </span>
                    <UsuryNote ea={o.usury_ea} exceeded={o.above_usury} />
                    {o.above_usury && <Badge tone="warning">{t.aboveUsury}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title={t.byMonth}>
            {d.rows.length === 0 ? (
              <p className="muted">{t.noRows}</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <caption className="visually-hidden">{t.byMonth}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t.month}</th>
                      <th scope="col">{t.obligation}</th>
                      <th scope="col" className="table__num">{t.currentInterest}</th>
                      <th scope="col" className="table__num">{t.lateInterest}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((row) => (
                      <tr key={`${row.month}-${row.obligation_id}`}>
                        <th scope="row">{formatPeriod(periodOf(row.month), locale)}</th>
                        <td>{row.obligation_name}</td>
                        <td className="table__num">
                          <AmountOrPending value={row.interest} />
                          {row.unit === "UVR" && row.interest_units !== null && row.interest_units !== undefined && (
                            <span className="fin-row__sub muted">
                              {formatUnits(row.interest_units, "UVR")}
                              {row.uvr_on ? ` · ${dict.fin.uvr.uvrOn.replace("{date}", formatDate(row.uvr_on))}` : ""}
                            </span>
                          )}
                        </td>
                        <td className="table__num"><Money value={row.late_interest} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
