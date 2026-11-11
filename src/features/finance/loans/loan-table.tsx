"use client";

import { useState } from "react";
import type { Loan, LoanInstallment, LoanSchedule } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate, todayBogota } from "@/lib/dates";
import { formatRate, formatUnits, sumDecimals } from "@/lib/decimal";
import { addAmounts } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { LatePanel } from "../credit/late-panel";
import { useHref, useResource } from "../hooks";
import { Badge, ErrorState, Loading, Money, ScreenHeader, Tabs, TextField } from "../kit";
import { isUvr, pesoEstimate } from "../uvr/logic";
import { useValuation } from "../uvr/panels";
import { PendingAmount, RegisterIndexLink } from "../uvr/pending";

type TabId = "installments" | "interest";

/** La tabla de amortización (`/creditos/[id]/tabla`): pestañas Cuotas (reparto de cada cuota) e Intereses (corriente y de mora, previsto y pagado). */
export function LoanTable({ id }: { id: string }) {
  const { dict } = useI18n();
  const href = useHref();
  const loan = useResource<Loan>(paths.loan(id));
  const schedule = useResource<LoanSchedule>(paths.loanSchedule(id));
  const [tab, setTab] = useState<TabId>("installments");
  // UVR: la tabla está en unidades; los pesos son una estimación con la UVR de la fecha elegida (hoy por defecto).
  const uvr = loan.data ? isUvr(loan.data) : false;
  const [on, setOn] = useState(todayBogota());
  const valuation = useValuation(id, on, uvr);
  const estimate: UvrEstimate | null = uvr ? { uvr: valuation.data?.uvr_value ?? null, on: valuation.data?.on ?? on, missing: valuation.failure?.code === "index_missing" } : null;
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["credito-tabla"]} eyebrow={loan.data?.name} back={{ href: href("credito", [id]), label: loan.data?.name ?? dict.screens.credito }} />
      {schedule.loading && !schedule.data && <Loading />}
      {schedule.failure && <ErrorState message={schedule.failure.status === 404 ? dict.fin.errors.notFound : dict.fin.errors.generic} onRetry={schedule.reload} />}
      {uvr && (
        <section className="fin-card" aria-label={dict.fin.uvr.tableTitle}>
          <p className="muted">{dict.fin.uvr.tableIntro}</p>
          <TextField label={dict.fin.uvr.valuationOn} type="date" value={on} onChange={setOn} />
          <p className="muted" role="status" data-testid="uvr-used">
            {estimate?.uvr ? dict.fin.uvr.estimateWith.replace("{uvr}", formatRate(estimate.uvr)).replace("{date}", formatDate(estimate.on)) : estimate?.missing ? <><PendingAmount /> <RegisterIndexLink /></> : null}
          </p>
        </section>
      )}
      {schedule.data && (
        <Tabs
          label={dict.fin.credit.table.tabs}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "installments", label: dict.fin.credit.table.installments },
            { value: "interest", label: dict.fin.credit.table.interest },
          ]}
        >
          {tab === "installments" ? <InstallmentsTable rows={schedule.data.installments} estimate={estimate} /> : <InterestTable rows={schedule.data.installments} loanId={id} uvr={uvr} />}
        </Tabs>
      )}
    </div>
  );
}

interface UvrEstimate {
  uvr: string | null;
  on: string;
  missing: boolean;
}

function InstallmentsTable({ rows, estimate }: { rows: LoanInstallment[]; estimate: UvrEstimate | null }) {
  const { dict } = useI18n();
  const t = dict.fin.loans;
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="visually-hidden">{dict.screens["credito-tabla"]}</caption>
        <thead>
          <tr>
            <th scope="col">{t.tableCols.number}</th>
            <th scope="col">{t.tableCols.date}</th>
            <th scope="col" className="table__num">{t.split.capital}</th>
            <th scope="col" className="table__num">{t.split.interest}</th>
            <th scope="col" className="table__num">{t.split.insurance}</th>
            <th scope="col" className="table__num">{t.split.fees}</th>
            <th scope="col" className="table__num">{estimate ? `${t.installment} (UVR)` : t.installment}</th>
            {estimate && <th scope="col" className="table__num">{dict.fin.uvr.pesoEstimate}</th>}
            <th scope="col">{t.tableCols.status}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.number}>
              <th scope="row">{row.number}</th>
              <td>{formatDate(row.adjusted_due_date)}</td>
              {estimate ? (
                <>
                  <td className="table__num tabular">{formatUnits(row.capital, "UVR")}</td>
                  <td className="table__num tabular">{formatUnits(row.interest, "UVR")}</td>
                  <td className="table__num tabular">{formatUnits(row.insurance, "UVR")}</td>
                  <td className="table__num tabular">{formatUnits(row.charges, "UVR")}</td>
                  <td className="table__num tabular">{formatUnits(row.payment, "UVR")}</td>
                  <td className="table__num">{row.status === "paid" ? "—" : pesoEstimate(row.payment, estimate.uvr) !== null ? <Money value={pesoEstimate(row.payment, estimate.uvr)!} estimated /> : <PendingAmount />}</td>
                </>
              ) : (
                <>
                  <td className="table__num"><Money value={row.capital} /></td>
                  <td className="table__num"><Money value={row.interest} /></td>
                  <td className="table__num"><Money value={row.insurance} /></td>
                  <td className="table__num"><Money value={row.charges} /></td>
                  <td className="table__num"><Money value={row.payment} /></td>
                </>
              )}
              <td>{row.status === "paid" ? <Badge tone="positive">{t.tableCols.paid}</Badge> : <Badge>{t.tableCols.pending}</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Interés de cada cuota: el previsto en la tabla, el corriente y el de mora que se pagaron, y la mora estimada de lo vencido. */
function InterestTable({ rows, loanId, uvr }: { rows: LoanInstallment[]; loanId: string; uvr: boolean }) {
  const { dict } = useI18n();
  const t = dict.fin.loans;
  const c = dict.fin.credit.table;
  const planned = uvr ? sumDecimals(rows.map((r) => r.interest)) : addAmounts("0", ...rows.map((r) => r.interest));
  const paid = addAmounts("0", ...rows.map((r) => r.paid_interest ?? "0"));
  const paidLate = addAmounts("0", ...rows.map((r) => r.paid_late_interest ?? "0"));
  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <caption className="visually-hidden">{c.interest}</caption>
          <thead>
            <tr>
              <th scope="col">{t.tableCols.number}</th>
              <th scope="col">{t.tableCols.date}</th>
              <th scope="col" className="table__num">{c.planned}</th>
              <th scope="col" className="table__num">{c.paid}</th>
              <th scope="col" className="table__num">{c.paidLate}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.number}>
                <th scope="row">{row.number}</th>
                <td>{formatDate(row.adjusted_due_date)}</td>
                <td className="table__num">{uvr ? <span className="tabular">{formatUnits(row.interest, "UVR")}</span> : <Money value={row.interest} />}</td>
                <td className="table__num">{row.paid_interest === null ? "—" : <Money value={row.paid_interest} />}</td>
                <td className="table__num">{row.paid_late_interest === null ? "—" : <Money value={row.paid_late_interest} />}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>{c.totals}</th>
              <td className="table__num">{uvr ? <span className="tabular">{formatUnits(planned, "UVR")}</span> : <Money value={planned} />}</td>
              <td className="table__num"><Money value={paid} /></td>
              <td className="table__num"><Money value={paidLate} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <LatePanel loanId={loanId} />
    </>
  );
}
