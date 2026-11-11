"use client";

import { useState } from "react";
import type { Loan, LoanInstallment, LoanSchedule } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { addAmounts } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { LatePanel } from "../credit/late-panel";
import { useHref, useResource } from "../hooks";
import { Badge, ErrorState, Loading, Money, ScreenHeader, Tabs } from "../kit";

type TabId = "installments" | "interest";

/** La tabla de amortización (`/creditos/[id]/tabla`): pestañas Cuotas (reparto de cada cuota) e Intereses (corriente y de mora, previsto y pagado). */
export function LoanTable({ id }: { id: string }) {
  const { dict } = useI18n();
  const href = useHref();
  const loan = useResource<Loan>(paths.loan(id));
  const schedule = useResource<LoanSchedule>(paths.loanSchedule(id));
  const [tab, setTab] = useState<TabId>("installments");
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["credito-tabla"]} eyebrow={loan.data?.name} back={{ href: href("credito", [id]), label: loan.data?.name ?? dict.screens.credito }} />
      {schedule.loading && !schedule.data && <Loading />}
      {schedule.failure && <ErrorState message={schedule.failure.status === 404 ? dict.fin.errors.notFound : dict.fin.errors.generic} onRetry={schedule.reload} />}
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
          {tab === "installments" ? <InstallmentsTable rows={schedule.data.installments} /> : <InterestTable rows={schedule.data.installments} loanId={id} />}
        </Tabs>
      )}
    </div>
  );
}

function InstallmentsTable({ rows }: { rows: LoanInstallment[] }) {
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
            <th scope="col" className="table__num">{t.installment}</th>
            <th scope="col">{t.tableCols.status}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.number}>
              <th scope="row">{row.number}</th>
              <td>{formatDate(row.adjusted_due_date)}</td>
              <td className="table__num"><Money value={row.capital} /></td>
              <td className="table__num"><Money value={row.interest} /></td>
              <td className="table__num"><Money value={row.insurance} /></td>
              <td className="table__num"><Money value={row.charges} /></td>
              <td className="table__num"><Money value={row.payment} /></td>
              <td>{row.status === "paid" ? <Badge tone="positive">{t.tableCols.paid}</Badge> : <Badge>{t.tableCols.pending}</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Interés de cada cuota: el previsto en la tabla, el corriente y el de mora que se pagaron, y la mora estimada de lo vencido. */
function InterestTable({ rows, loanId }: { rows: LoanInstallment[]; loanId: string }) {
  const { dict } = useI18n();
  const t = dict.fin.loans;
  const c = dict.fin.credit.table;
  const planned = addAmounts("0", ...rows.map((r) => r.interest));
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
                <td className="table__num"><Money value={row.interest} /></td>
                <td className="table__num">{row.paid_interest === null ? "—" : <Money value={row.paid_interest} />}</td>
                <td className="table__num">{row.paid_late_interest === null ? "—" : <Money value={row.paid_late_interest} />}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>{c.totals}</th>
              <td className="table__num"><Money value={planned} /></td>
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
