"use client";

import Link from "next/link";
import { useState } from "react";
import { errorText } from "@/api/errors";
import type { ReportCatalog, ReportHorizon, ReportKey, ReportLiquidity, ReportScenario } from "@/api/models";
import { paths } from "@/api/paths";
import { fractionToPercent } from "@/lib/amount-input";
import { formatDate } from "@/lib/dates";
import { formatCop } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { fill } from "../helpers";
import { useHref, useResource } from "../hooks";
import { Banner, Empty, ErrorState, Loading, Money, ScreenHeader, Segmented, SelectField, Section, Tabs, TextField } from "../kit";
import { ANT_THRESHOLDS, DEFAULT_ANT_THRESHOLD, isReportKey, REPORT_KEYS, reportRoute, signedPercentToFraction, type ProjectionOptions } from "./logic";
import { ReportView } from "./report-view";

/** `/informes`: el catálogo de los informes (los 10 del propietario más Estadísticas y Gastos hormiga). */
export function ReportsHome() {
  const { dict } = useI18n();
  const rep = dict.fin.rep;
  const href = useHref();
  const catalog = useResource<ReportCatalog>(paths.reports());
  const keys: readonly ReportKey[] = catalog.data ? catalog.data.reports.map((r) => r.key) : REPORT_KEYS;
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens.informes} eyebrow={dict.nav.sections.informes} />
      <p className="muted">{rep.home.intro}</p>
      {catalog.failure && <ErrorState message={dict.fin.errors.generic} onRetry={catalog.reload} />}
      <ul className="rep-home">
        {keys.map((key) => {
          const target = reportRoute(key);
          const projected = catalog.data?.reports.find((r) => r.key === key)?.projected ?? key === "projection";
          return (
            <li key={key}>
              <Link href={href(target.route, target.params)} className="fin-row">
                <span className="fin-row__main">
                  <span className="fin-row__title">{rep.titles[key]}</span>
                  <span className="fin-row__sub muted">{rep.descriptions[key]}</span>
                  {projected && <span className="fin-row__sub muted">{rep.home.estimate}</span>}
                </span>
                <Icon name="chevron-right" size={20} />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** `/informes/[informe]`: cualquier informe del catálogo con la barra de filtros común. */
export function ReportScreen({ reportKey }: { reportKey: string }) {
  const { dict } = useI18n();
  const href = useHref();
  const back = { href: href("informes"), label: dict.screens.informes };
  if (!isReportKey(reportKey)) {
    return (
      <div className="screen">
        <ScreenHeader title={dict.screens.informe} back={back} />
        <Empty icon="chart" title={dict.fin.rep.notFoundTitle} body={dict.fin.rep.notFoundBody} />
      </div>
    );
  }
  const target = reportRoute(reportKey);
  if (target.route === "informes-proyecciones") return <ProjectionsScreen />;
  if (target.route === "informes-patrimonio") return <NetWorthScreen />;
  if (target.route === "informes-estadisticas") return <StatisticsScreen />;
  return (
    <div className="screen">
      <ScreenHeader title={dict.fin.rep.titles[reportKey]} eyebrow={dict.screens.informes} back={back} />
      <ReportView reportKey={reportKey} />
    </div>
  );
}

/** Patrimonio (`/informes/patrimonio`): patrimonio neto y su evolución. */
export function NetWorthScreen() {
  const { dict } = useI18n();
  const rep = dict.fin.rep;
  const href = useHref();
  const [tab, setTab] = useState<"net_worth" | "net_worth_evolution">("net_worth");
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["informes-patrimonio"]} eyebrow={dict.screens.informes} back={{ href: href("informes"), label: dict.screens.informes }} />
      <Tabs label={rep.netWorthTabs.label} value={tab} onChange={setTab} tabs={[{ value: "net_worth", label: rep.titles.net_worth }, { value: "net_worth_evolution", label: rep.titles.net_worth_evolution }]}>
        <ReportView key={tab} reportKey={tab} />
      </Tabs>
    </div>
  );
}

/**
 * Estadísticas (`/informes/estadisticas`): gasto por categoría, naturaleza, clasificación y día; y gastos hormiga con el umbral
 * como control (va en el cuerpo del POST, nunca en la URL).
 */
export function StatisticsScreen() {
  const { dict } = useI18n();
  const rep = dict.fin.rep;
  const href = useHref();
  const [tab, setTab] = useState<"statistics" | "ant_expenses">("statistics");
  const [threshold, setThreshold] = useState(DEFAULT_ANT_THRESHOLD);
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["informes-estadisticas"]} eyebrow={dict.screens.informes} back={{ href: href("informes"), label: dict.screens.informes }} />
      <Tabs label={rep.stats.tabs} value={tab} onChange={setTab} tabs={[{ value: "statistics", label: rep.titles.statistics }, { value: "ant_expenses", label: rep.titles.ant_expenses }]}>
        {tab === "statistics" ? (
          <ReportView key="statistics" reportKey="statistics" />
        ) : (
          <ReportView
            key="ant_expenses"
            reportKey="ant_expenses"
            extra={{ threshold }}
            before={
              <div>
                <SelectField label={rep.stats.threshold} hint={fill(rep.stats.thresholdHint, { amount: formatCop(DEFAULT_ANT_THRESHOLD) })} value={threshold} onChange={setThreshold} options={ANT_THRESHOLDS.map((value) => ({ value, label: formatCop(value) }))} />
                <p className="hint">{rep.stats.antsRule}</p>
              </div>
            }
          />
        )}
      </Tabs>
    </div>
  );
}

const SCENARIOS: readonly ReportScenario[] = ["base", "optimistic", "pessimistic"];
const HORIZONS: readonly ReportHorizon[] = ["15", "30", "60", "90", "12m"];

/**
 * Proyecciones (`/informes/proyecciones`): escenarios base, optimista y pesimista con porcentajes editables, y liquidez con gasto
 * variable. Lo real y lo proyectado se distinguen con rótulo, fondo y trama, no solo con color. Es una estimación: nunca escribe asientos.
 */
export function ProjectionsScreen() {
  const { dict } = useI18n();
  const rep = dict.fin.rep;
  const t = rep.proj;
  const href = useHref();
  const catalog = useResource<ReportCatalog>(paths.reports());
  const [scenario, setScenario] = useState<ReportScenario>("base");
  const [horizon, setHorizon] = useState<ReportHorizon>("12m");
  const [income, setIncome] = useState<string | null>(null);
  const [variable, setVariable] = useState<string | null>(null);
  const defaults = catalog.data?.scenarios.find((s) => s.key === scenario);
  const incomeText = income ?? (defaults ? fractionToPercent(defaults.income_pct, 2) : "");
  const variableText = variable ?? (defaults ? fractionToPercent(defaults.variable_pct, 2) : "");
  const incomeFraction = signedPercentToFraction(incomeText);
  const variableFraction = signedPercentToFraction(variableText);
  const bad = (text: string, fraction: string | null) => text.trim() !== "" && fraction === null;
  // Solo se envían los porcentajes que la persona cambió respecto del escenario.
  const changed = (edited: string | null, fraction: string | null, original: string | undefined) => (edited !== null && fraction !== null && original !== undefined && signedPercentToFraction(fractionToPercent(original, 2)) !== fraction ? fraction : undefined);
  const incomePct = changed(income, incomeFraction, defaults?.income_pct);
  const variablePct = changed(variable, variableFraction, defaults?.variable_pct);
  const ready = !bad(incomeText, incomeFraction) && !bad(variableText, variableFraction);
  const options: ProjectionOptions = { scenario, horizon, incomePct, variablePct };
  const reset = () => {
    setIncome(null);
    setVariable(null);
  };
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["informes-proyecciones"]} eyebrow={dict.screens.informes} back={{ href: href("informes"), label: dict.screens.informes }} />
      <Banner tone="warning" live="off">{t.estimateNote}</Banner>
      <Segmented legend={t.scenario} value={scenario} onChange={(v) => { setScenario(v as ReportScenario); reset(); }} options={SCENARIOS.map((s) => ({ value: s, label: t.scenarios[s] }))} />
      <div className="fin-grid-2">
        <TextField label={t.incomePct} hint={t.pctHint} value={incomeText} onChange={setIncome} inputMode="decimal" error={bad(incomeText, incomeFraction) ? dict.fin.cards.rateInvalid : null} />
        <TextField label={t.variablePct} hint={t.pctHint} value={variableText} onChange={setVariable} inputMode="decimal" error={bad(variableText, variableFraction) ? dict.fin.cards.rateInvalid : null} />
      </div>
      {(income !== null || variable !== null) && (
        <button type="button" className="button button--ghost" onClick={reset}>
          {t.reset}
        </button>
      )}
      <Segmented legend={t.horizon} value={horizon} onChange={(v) => setHorizon(v as ReportHorizon)} options={HORIZONS.map((h) => ({ value: h, label: t.horizons[h] }))} variant="chips" />
      {ready ? (
        <>
          <Liquidity scenario={scenario} incomePct={incomePct} variablePct={variablePct} />
          <ReportView key={`${scenario}-${horizon}-${incomePct ?? ""}-${variablePct ?? ""}`} reportKey="projection" extra={{ projection: options }} />
        </>
      ) : (
        <p className="muted" role="status">{t.fixPercents}</p>
      )}
    </div>
  );
}

/** Liquidez con gasto variable: el dinero disponible en 15, 30, 60 y 90 días, y el primer día en negativo. */
function Liquidity({ scenario, incomePct, variablePct }: { scenario: ReportScenario; incomePct?: string; variablePct?: string }) {
  const { dict } = useI18n();
  const t = dict.fin.rep.proj.liquidity;
  const data = useResource<ReportLiquidity>(paths.liquidity({ scenario, income_pct: incomePct, variable_pct: variablePct }));
  const d = data.data;
  return (
    <Section title={t.title}>
      {data.loading && !d && <Loading />}
      {data.failure && <ErrorState message={errorText(data.failure, dict.fin.errors)} onRetry={data.reload} />}
      {d && (
        <>
          <p>
            <span className="muted">{t.availableToday}</span> <strong><Money value={d.available_today} /></strong>
          </p>
          <ul className="fin-list">
            {d.horizons.map((h) => (
              <li key={h.days} className="fin-row fin-row--static">
                <span className="fin-row__main">
                  <span className="fin-row__title">{fill(t.inDays, { n: String(h.days) })}</span>
                </span>
                <span className="fin-row__amount"><Money value={h.balance} tone={h.balance.startsWith("-") ? "negative" : undefined} /></span>
              </li>
            ))}
          </ul>
          {d.first_negative_date ? (
            <Banner tone="warning">
              {fill(t.firstNegative, { date: formatDate(d.first_negative_date) })} {d.missing ? <>{t.missing} <Money value={d.missing} />.</> : null}
            </Banner>
          ) : (
            <p className="muted">{t.noNegative}</p>
          )}
          <p className="hint">{fill(t.variableNote, { amount: formatCop(d.variable_spending_monthly) })}</p>
        </>
      )}
    </Section>
  );
}
