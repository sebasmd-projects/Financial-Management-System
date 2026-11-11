"use client";

import type { Loan, LoanSchedule } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { useHref, useResource } from "../hooks";
import { Badge, ErrorState, Loading, Money, ScreenHeader } from "../kit";

/** La tabla de amortización (`/creditos/[id]/tabla`): capital, interés y seguro por cuota, y cuáles ya se pagaron. */
export function LoanTable({ id }: { id: string }) {
  const { dict } = useI18n();
  const t = dict.fin.loans;
  const href = useHref();
  const loan = useResource<Loan>(paths.loan(id));
  const schedule = useResource<LoanSchedule>(paths.loanSchedule(id));
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["credito-tabla"]} eyebrow={loan.data?.name} back={{ href: href("credito", [id]), label: loan.data?.name ?? dict.screens.credito }} />
      {schedule.loading && !schedule.data && <Loading />}
      {schedule.failure && <ErrorState message={schedule.failure.status === 404 ? dict.fin.errors.notFound : dict.fin.errors.generic} onRetry={schedule.reload} />}
      {schedule.data && (
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
                <th scope="col" className="table__num">{t.installment}</th>
                <th scope="col">{t.tableCols.status}</th>
              </tr>
            </thead>
            <tbody>
              {schedule.data.installments.map((row) => (
                <tr key={row.number}>
                  <th scope="row">{row.number}</th>
                  <td>{formatDate(row.adjusted_due_date)}</td>
                  <td className="table__num"><Money value={row.capital} /></td>
                  <td className="table__num"><Money value={row.interest} /></td>
                  <td className="table__num"><Money value={row.insurance} /></td>
                  <td className="table__num"><Money value={row.payment} /></td>
                  <td>{row.status === "paid" ? <Badge tone="positive">{t.tableCols.paid}</Badge> : <Badge>{t.tableCols.pending}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
