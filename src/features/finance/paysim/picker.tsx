"use client";

import Link from "next/link";
import type { Card, Loan } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { useAll, useHref } from "../hooks";
import { Empty, ErrorState, Loading, Money, ScreenHeader } from "../kit";

/** Simulador de pagos: se elige la tarjeta o el crédito; el simulador vive en cada uno (con sus extractos, cuotas y tasas). */
export function PaymentSimulatorPicker() {
  const { dict } = useI18n();
  const t = dict.fin.paysim;
  const href = useHref();
  const cards = useAll<Card>(paths.cards());
  const loans = useAll<Loan>(paths.loans());
  const loading = (cards.loading && !cards.data) || (loans.loading && !loans.data);
  const cardRows = cards.items.filter((c) => c.status === "active");
  const loanRows = loans.items.filter((l) => l.status === "active");
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["simulador-pagos"]} eyebrow={dict.nav.sections.creditos} back={{ href: href("creditos-amortizaciones"), label: dict.screens["creditos-amortizaciones"] }} />
      <p className="muted">{dict.fin.sim.neverWrites}</p>
      <p className="muted">{t.intro}</p>
      {loading && <Loading />}
      {(cards.failure || loans.failure) && <ErrorState message={dict.fin.errors.generic} onRetry={() => { cards.reload(); loans.reload(); }} />}
      {!loading && cardRows.length === 0 && loanRows.length === 0 && <Empty icon="card" title={t.pickerTitle} body={t.pickerEmpty} />}
      {cardRows.length > 0 && (
        <section aria-label={t.cards}>
          <h2 className="title-s">{t.cards}</h2>
          <ul className="fin-list">
            {cardRows.map((card) => (
              <li key={card.id}>
                <Link href={href("tarjeta-simulador-pagos", [card.id])} className="fin-row">
                  <span className="fin-row__main">
                    <span className="fin-row__title">{card.name}</span>
                    <span className="fin-row__sub muted">{dict.fin.cards.used} <Money value={card.used} /></span>
                  </span>
                  <Icon name="chevron-right" size={20} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {loanRows.length > 0 && (
        <section aria-label={t.loans}>
          <h2 className="title-s">{t.loans}</h2>
          <ul className="fin-list">
            {loanRows.map((loan) => (
              <li key={loan.id}>
                <Link href={href("credito-simulador-pagos", [loan.id])} className="fin-row">
                  <span className="fin-row__main">
                    <span className="fin-row__title">{loan.name}</span>
                  </span>
                  <Icon name="chevron-right" size={20} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
