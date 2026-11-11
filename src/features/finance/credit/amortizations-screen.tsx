"use client";

import Link from "next/link";
import type { Loan } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import type { RouteId } from "@/nav/routes";
import { Icon } from "@/ui/icons";
import { useAll, useHref } from "../hooks";
import { Empty, ErrorState, Loading, Money, ScreenHeader, Section } from "../kit";
import { CreditTabs } from "./credit-tabs";

const SIMULATOR_LINKS: readonly RouteId[] = ["simulador-amortizacion", "simulador-tasas", "simulador-abono-extra", "simulador-comparar", "simulador-compra-tarjeta"];

/** Amortizaciones (`/creditos/amortizaciones`, §3.8): la tabla de cada préstamo y la entrada a los simuladores (que nunca escriben). */
export function AmortizationsScreen() {
  const { dict } = useI18n();
  const t = dict.fin.credit.amortizations;
  const href = useHref();
  const loans = useAll<Loan>(paths.loans());
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["creditos-amortizaciones"]} eyebrow={dict.nav.sections.creditos} />
      <CreditTabs current="creditos-amortizaciones" />
      <Section title={t.tables}>
        {loans.loading && !loans.data && <Loading />}
        {loans.failure && <ErrorState message={dict.fin.errors.generic} onRetry={loans.reload} />}
        {loans.data && loans.items.length === 0 && <Empty icon="loan" title={dict.fin.loans.emptyTitle} body={t.emptyBody} />}
        <ul className="fin-list">
          {loans.items.map((loan) => (
            <li key={loan.id}>
              <Link href={href("credito-tabla", [loan.id])} className="fin-row">
                <span className="fin-row__main">
                  <span className="fin-row__title">{loan.name}</span>
                  <span className="fin-row__sub muted">
                    {dict.fin.systems[loan.system] ?? loan.system} · {dict.fin.loans.balance} <Money value={loan.balance} />
                  </span>
                </span>
                <Icon name="chevron-right" size={20} />
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <Section title={t.simulators}>
        <p className="muted">{t.simulatorsHint}</p>
        <ul className="fin-list">
          {SIMULATOR_LINKS.map((route) => (
            <li key={route}>
              <Link href={href(route)} className="fin-row">
                <span className="fin-row__main">
                  <span className="fin-row__title">{dict.screens[route]}</span>
                </span>
                <Icon name="chevron-right" size={20} />
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
