"use client";

import { useState } from "react";
import type { Indicators } from "@/api/models";
import { paths } from "@/api/paths";
import { formatPeriod, periodOf, shiftPeriod, todayBogota } from "@/lib/dates";
import { formatPercent, percentWidth } from "@/lib/percent";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { BarChart } from "../charts";
import { useResource } from "../hooks";
import { Empty, ErrorState, Loading, ScreenHeader } from "../kit";
import { PlanTabs } from "./plan-tabs";

/** Indicadores (`/presupuestos/indicadores`, §3.12): valor, fórmula visible y tendencia de 6 meses (con tabla equivalente). Sin base, «—» y se dice por qué. */
export function IndicatorsScreen() {
  const { dict, locale } = useI18n();
  const t = dict.fin.plan.indicators;
  const today = todayBogota();
  const [period, setPeriod] = useState(() => periodOf(today));
  const data = useResource<Indicators>(paths.indicators(period === periodOf(today) ? undefined : period));
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["plan-indicadores"]} eyebrow={dict.nav.sections.plan} />
      <PlanTabs current="plan-indicadores" />
      <div className="fin-periodbar">
        <button type="button" className="icon-button" aria-label={dict.fin.movements.previousPeriod} onClick={() => setPeriod(shiftPeriod(period, -1))}>
          <Icon name="arrow-left" />
        </button>
        <p className="title-s" aria-live="polite">{formatPeriod(period, locale)}</p>
        <button type="button" className="icon-button" aria-label={dict.fin.movements.nextPeriod} onClick={() => setPeriod(shiftPeriod(period, 1))}>
          <Icon name="arrow-right" />
        </button>
      </div>
      {data.loading && !data.data && <Loading />}
      {data.failure && <ErrorState message={dict.fin.errors.generic} onRetry={data.reload} />}
      {data.data && data.data.indicators.length === 0 && <Empty icon="chart" title={t.emptyTitle} body={t.emptyBody} />}
      <ul className="fin-list" aria-busy={data.loading}>
        {data.data?.indicators.map((indicator) => {
          const label = t.names[indicator.key as keyof typeof t.names] ?? indicator.key;
          const formula = t.formulas[indicator.key as keyof typeof t.formulas] ?? indicator.formula;
          return (
            <li key={indicator.key}>
              <article className="fin-card" aria-label={label}>
                <h2 className="title-s">{label}</h2>
                <p className="fin-big">{indicator.value === null ? <span aria-label={t.noBase}>—</span> : formatPercent(indicator.value, locale)}</p>
                {indicator.value === null && <p className="muted">{t.noBase}</p>}
                <details>
                  <summary>{t.formula}</summary>
                  <p className="muted">{formula}</p>
                </details>
                <BarChart
                  caption={`${label}: ${t.trend}`}
                  series={[label]}
                  rows={indicator.trend.map((point) => ({
                    key: point.month,
                    label: formatPeriod(periodOf(point.month), locale),
                    values: [{ node: point.value === null ? "—" : formatPercent(point.value, locale), width: point.value === null ? 0 : percentWidth(point.value) }],
                  }))}
                />
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
