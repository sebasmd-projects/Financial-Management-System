"use client";

import Link from "next/link";
import { useState } from "react";
import type { CreditInstallment, Page } from "@/api/models";
import { paths } from "@/api/paths";
import { daysBetween, formatDate, todayBogota } from "@/lib/dates";
import { formatRate, formatUnits } from "@/lib/decimal";
import { useI18n } from "@/i18n/provider";
import { relativeDays } from "../helpers";
import { useHref, useResource } from "../hooks";
import { Badge, Empty, ErrorState, Loading, Money, Pager, ScreenHeader, Segmented } from "../kit";
import { AmountOrPending } from "../uvr/pending";
import { CreditTabs } from "./credit-tabs";

type State = "open" | "overdue" | "paid" | "all";
const STATES: readonly State[] = ["open", "overdue", "paid", "all"];
const PAGE_SIZE = 50;

/** Cuotas (`/creditos/cuotas`, §3.8): las cuotas de préstamos y de compras a cuotas con tarjeta, por fecha; vencidas, próximas y pagadas. */
export function InstallmentsScreen() {
  const { dict } = useI18n();
  const t = dict.fin.credit.installments;
  const href = useHref();
  const [state, setState] = useState<State>("open");
  const [page, setPage] = useState(1);
  const list = useResource<Page<CreditInstallment>>(paths.creditInstallments({ state, page, page_size: PAGE_SIZE }));
  const today = todayBogota();
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["creditos-cuotas"]} eyebrow={dict.nav.sections.creditos} />
      <CreditTabs current="creditos-cuotas" />
      <Segmented
        legend={t.state}
        value={state}
        onChange={(v) => {
          setState(v as State);
          setPage(1);
        }}
        options={STATES.map((s) => ({ value: s, label: t.states[s] }))}
        variant="chips"
      />
      {list.loading && !list.data && <Loading />}
      {list.failure && <ErrorState message={dict.fin.errors.generic} onRetry={list.reload} />}
      {list.data && list.data.results.length === 0 && <Empty icon="loan" title={t.emptyTitle} body={t.emptyBody} />}
      <ul className="fin-list" aria-busy={list.loading}>
        {list.data?.results.map((row) => {
          const target = row.kind === "loan" ? href("credito", [row.obligation_id]) : href("tarjeta", [row.obligation_id]);
          return (
            <li key={`${row.kind}-${row.obligation_id}-${row.number}`}>
              <Link href={target} className="fin-row">
                <span className="fin-row__main">
                  <span className="fin-row__title">{row.obligation_name}</span>
                  <span className="fin-row__sub muted">
                    {t.number.replace("{n}", String(row.number))} · {formatDate(row.due_date)} ({relativeDays(daysBetween(today, row.due_date), dict.fin.relative)})
                  </span>
                  {row.unit === "UVR" ? (
                    <span className="fin-row__sub muted">
                      {dict.fin.loans.split.capital} {formatUnits(row.capital, "UVR")} · {dict.fin.loans.split.interest} {formatUnits(row.interest, "UVR")}
                      {row.insurance !== "0.00" && row.insurance !== "0" ? ` · ${dict.fin.loans.split.insurance} ${formatUnits(row.insurance, "UVR")}` : ""}
                    </span>
                  ) : (
                    <span className="fin-row__sub muted">
                      {dict.fin.loans.split.capital} <Money value={row.capital} /> · {dict.fin.loans.split.interest} <Money value={row.interest} />
                      {row.insurance !== "0.00" && row.insurance !== "0" ? (
                        <>
                          {" "}· {dict.fin.loans.split.insurance} <Money value={row.insurance} />
                        </>
                      ) : null}
                    </span>
                  )}
                  {row.unit === "UVR" && (
                    <span className="fin-row__sub muted">
                      {row.uvr_value && row.uvr_on ? dict.fin.uvr.estimateWith.replace("{uvr}", formatRate(row.uvr_value)).replace("{date}", formatDate(row.uvr_on)) : dict.fin.uvr.noUvrYet}
                    </span>
                  )}
                  <span className="fin-row__badges">
                    <Badge>{t.kinds[row.kind]}</Badge>
                    {row.state === "overdue" && <Badge tone="negative">{t.states.overdue}</Badge>}
                    {row.state === "paid" && <Badge tone="positive">{dict.fin.loans.tableCols.paid}</Badge>}
                    {row.state === "billed" && <Badge tone="info">{t.billed}</Badge>}
                  </span>
                </span>
                <span className="fin-row__amount">
                  {row.unit === "UVR" ? (
                    <>
                      <AmountOrPending value={row.peso_total ?? null} estimated />
                      <span className="fin-row__sub muted tabular">{formatUnits(row.total, "UVR")}</span>
                    </>
                  ) : (
                    <Money value={row.total} />
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {list.data && <Pager page={page} count={list.data.count} pageSize={PAGE_SIZE} onPage={setPage} />}
    </div>
  );
}
