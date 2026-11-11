"use client";

import Link from "next/link";
import { useState } from "react";
import type { Loan } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { formatUnits } from "@/lib/decimal";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { CreditTabs } from "../credit/credit-tabs";
import { useAll, useHref } from "../hooks";
import { Badge, Banner, Empty, ErrorState, Loading, Modal, Money, Progress, ScreenHeader } from "../kit";
import { indexOf, isUvr } from "../uvr/logic";
import { LoanForm } from "./loan-form";

/** Préstamos (`/creditos`, diseño §3.8): saldo, avance, próxima cuota y alta. */
export function LoansScreen() {
  const { dict } = useI18n();
  const t = dict.fin.loans;
  const href = useHref();
  const loans = useAll<Loan>(paths.loans());
  const [creating, setCreating] = useState(false);
  const [aboveUsury, setAboveUsury] = useState(false);
  return (
    <div className="screen">
      <ScreenHeader
        title={dict.screens.creditos}
        eyebrow={dict.nav.sections.creditos}
        actions={
          <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={20} />
            {t.add}
          </button>
        }
      />
      <CreditTabs current="creditos" />
      {aboveUsury && <Banner tone="warning">{dict.fin.usury.created}</Banner>}
      {loans.loading && !loans.data && <Loading />}
      {loans.failure && <ErrorState message={dict.fin.errors.generic} onRetry={loans.reload} />}
      {loans.data && loans.items.length === 0 && (
        <Empty
          icon="loan"
          title={t.emptyTitle}
          body={t.emptyBody}
          action={
            <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
              {t.add}
            </button>
          }
        />
      )}
      {loans.items.length > 0 && (
        <ul className="fin-list">
          {loans.items.map((loan) => (
            <li key={loan.id}>
              <Link href={href("credito", [loan.id])} className="fin-row fin-row--loan">
                <span className="fin-row__main">
                  <span className="fin-row__title">{loan.name}</span>
                  <span className="fin-row__badges">
                    <Badge>{dict.fin.credit.kinds[loan.kind]}</Badge>
                    <Badge>{dict.fin.systems[loan.system] ?? loan.system}</Badge>
                    {isUvr(loan) && <Badge tone="info">{dict.fin.uvr.units.UVR}</Badge>}
                    {indexOf(loan) && <Badge tone="info">{dict.fin.uvr.variableBadge}</Badge>}
                    {loan.warnings?.some((w) => w.code === "rate_above_usury") && <Badge tone="warning">{dict.fin.usury.badge}</Badge>}
                  </span>
                  <span className="fin-row__sub muted">
                    {t.balance} <Money value={loan.balance} /> {t.of} {isUvr(loan) ? <span className="tabular">{formatUnits(loan.principal, "UVR")}</span> : <Money value={loan.principal} />}
                  </span>
                  <Progress percent={loan.paid_percent} label={`${t.paidPercent}: ${loan.paid_percent}%`} tone="positive" />
                  <span className="fin-row__sub muted">
                    {loan.next_installment ? (
                      <>
                        {t.installment} {isUvr(loan) ? <span className="tabular">{formatUnits(loan.next_installment.payment, "UVR")}</span> : <Money value={loan.next_installment.payment} />} · {t.next} {formatDate(loan.next_installment.adjusted_due_date)}
                      </>
                    ) : (
                      t.noNext
                    )}
                  </span>
                  {loan.status === "paid" && (
                    <span className="fin-row__badges">
                      <Badge tone="positive">{t.paidOff}</Badge>
                    </span>
                  )}
                </span>
                <Icon name="chevron-right" size={20} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Modal open={creating} title={t.add} onClose={() => setCreating(false)}>
        <LoanForm
          onCancel={() => setCreating(false)}
          onDone={(created) => {
            setCreating(false);
            setAboveUsury(Boolean(created?.warnings?.some((w) => w.code === "rate_above_usury")));
            loans.reload();
          }}
        />
      </Modal>
    </div>
  );
}
