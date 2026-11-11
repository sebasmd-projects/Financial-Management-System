"use client";

import Link from "next/link";
import type { Card } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { useAll, useHref } from "../hooks";
import { Empty, ErrorState, Loading, Money, ScreenHeader } from "../kit";

/** Compra con tarjeta: el simulador vive en cada tarjeta (cuotas, intereses y cupo con sus datos); aquí se elige la tarjeta. */
export function CardSimulatorPicker() {
  const { dict } = useI18n();
  const t = dict.fin.sim.cardPurchase;
  const href = useHref();
  const cards = useAll<Card>(paths.cards());
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["simulador-compra-tarjeta"]} eyebrow={dict.nav.sections.creditos} back={{ href: href("creditos-amortizaciones"), label: dict.screens["creditos-amortizaciones"] }} />
      <p className="muted">{dict.fin.sim.neverWrites}</p>
      <p className="muted">{t.intro}</p>
      {cards.loading && !cards.data && <Loading />}
      {cards.failure && <ErrorState message={dict.fin.errors.generic} onRetry={cards.reload} />}
      {cards.data && cards.items.length === 0 && <Empty icon="card" title={t.emptyTitle} body={t.emptyBody} />}
      <ul className="fin-list">
        {cards.items.map((card) => (
          <li key={card.id}>
            <Link href={href("tarjeta-simular", [card.id])} className="fin-row">
              <span className="fin-row__main">
                <span className="fin-row__title">{card.name}</span>
                <span className="fin-row__sub muted">
                  {t.available} <Money value={card.available} />
                </span>
              </span>
              <Icon name="chevron-right" size={20} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
