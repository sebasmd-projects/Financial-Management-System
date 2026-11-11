"use client";

import { useState } from "react";
import type { NetWorth } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate, formatPeriod, periodOf } from "@/lib/dates";
import { percentOfTotal } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { BarChart } from "../charts";
import { scaleWidths } from "../charts-logic";
import { fill } from "../helpers";
import { useHref, useResource } from "../hooks";
import { Empty, ErrorState, Loading, Money, Progress, ScreenHeader, Section, Tabs } from "../kit";
import { NetWorthScreen as NetWorthReports } from "../reports/reports-screens";
import { AssetsList } from "./assets-list";
import { ASSET_GROUPS, compositionRows, hasWealth, LIABILITY_GROUPS } from "./logic";

/** `/informes/patrimonio` (diseño §3.13, corte 2.7): patrimonio neto = activos − pasivos del libro, sus activos y los informes. */
export function WealthScreen() {
  const { dict } = useI18n();
  const t = dict.fin.assets;
  const href = useHref();
  const [tab, setTab] = useState<"summary" | "assets" | "report">("summary");
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["informes-patrimonio"]} eyebrow={dict.screens.informes} back={{ href: href("informes"), label: dict.screens.informes }} />
      <Tabs label={t.tabs.label} value={tab} onChange={setTab} tabs={[{ value: "summary", label: t.tabs.summary }, { value: "assets", label: t.tabs.assets }, { value: "report", label: t.tabs.report }]}>
        {tab === "summary" && <Overview />}
        {tab === "assets" && <AssetsList />}
        {tab === "report" && <NetWorthReports embedded />}
      </Tabs>
    </div>
  );
}

function Overview() {
  const { dict, locale } = useI18n();
  const t = dict.fin.assets.summary;
  const groups = dict.fin.assets.groups;
  const worth = useResource<NetWorth>(paths.netWorth({ months: 12 }));
  if (worth.loading && !worth.data) return <Loading />;
  if (worth.failure && !worth.data) return <ErrorState message={dict.fin.errors.generic} onRetry={worth.reload} />;
  const w = worth.data;
  if (!w) return null;
  if (!hasWealth(w)) return <Empty icon="wallet" title={t.empty} body={t.emptyBody} />;
  const assets = compositionRows(w.assets, ASSET_GROUPS);
  const liabilities = compositionRows(w.liabilities, LIABILITY_GROUPS);
  const widths = scaleWidths(w.trend.map((p) => p.net_worth));
  return (
    <div className="fin-stack">
      <section className="fin-card" aria-label={t.netWorth}>
        <p className="muted">{t.netWorth}</p>
        <p className="fin-big" data-testid="net-worth">
          <Money value={w.net_worth} tone={w.net_worth.startsWith("-") ? "negative" : undefined} />
        </p>
        <p className="hint">
          {t.formula} {fill(t.asOf, { date: formatDate(w.as_of) })}
        </p>
        <dl className="sim-summary">
          <div className="sim-summary__item">
            <dt className="muted">{t.assets}</dt>
            <dd><Money value={w.total_assets} /></dd>
          </div>
          <div className="sim-summary__item">
            <dt className="muted">{t.liabilities}</dt>
            <dd><Money value={w.total_liabilities} /></dd>
          </div>
        </dl>
      </section>

      <Section title={t.compositionAssets}>
        <ul className="fin-list">
          {assets.map((row) => (
            <li key={row.key} className="fin-row fin-row--static wealth-row">
              <span className="fin-row__main">
                <span className="fin-row__title">{groups[row.key] ?? row.key}</span>
                <Progress percent={percentOfTotal(row.amount, w.total_assets)} label={fill(t.share, { percent: String(percentOfTotal(row.amount, w.total_assets)) })} />
              </span>
              <Money value={row.amount} />
            </li>
          ))}
        </ul>
      </Section>

      {liabilities.length > 0 && (
        <Section title={t.compositionLiabilities}>
          <ul className="fin-list">
            {liabilities.map((row) => (
              <li key={row.key} className="fin-row fin-row--static">
                <span className="fin-row__main">
                  <span className="fin-row__title">{groups[row.key] ?? row.key}</span>
                </span>
                <Money value={row.amount} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {w.trend.length > 0 && (
        <Section title={t.trend}>
          <BarChart
            caption={t.chartCaption}
            series={[t.netWorth]}
            rows={w.trend.map((point, index) => ({ key: point.on, label: formatPeriod(periodOf(point.on), locale), values: [{ node: <Money value={point.net_worth} compact />, width: widths[index] }] }))}
          />
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">{t.trendCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.month}</th>
                  <th scope="col" className="table__num">{t.assets}</th>
                  <th scope="col" className="table__num">{t.liabilities}</th>
                  <th scope="col" className="table__num">{t.netWorth}</th>
                </tr>
              </thead>
              <tbody>
                {w.trend.map((point) => (
                  <tr key={point.on}>
                    <th scope="row">{formatPeriod(periodOf(point.on), locale)}</th>
                    <td className="table__num"><Money value={point.assets} /></td>
                    <td className="table__num"><Money value={point.liabilities} /></td>
                    <td className="table__num"><Money value={point.net_worth} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
