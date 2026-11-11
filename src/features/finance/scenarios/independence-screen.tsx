"use client";

import { useState } from "react";
import type { Independence } from "@/api/models";
import { paths } from "@/api/paths";
import { fractionToPercent } from "@/lib/amount-input";
import { formatPeriod, periodOf } from "@/lib/dates";
import { formatPercent } from "@/lib/percent";
import { useI18n } from "@/i18n/provider";
import { BarChart } from "../charts";
import { scaleWidths } from "../charts-logic";
import { fill } from "../helpers";
import { useHref, useQuery } from "../hooks";
import { AmountField, Banner, Checkbox, ErrorState, Loading, Money, ScreenHeader, Section, TextField } from "../kit";
import { buildIndependence, DEFAULT_WITHDRAWAL_PCT, yearsMonths } from "./logic";
import { ProjectionTabs } from "./scenario-tabs";

/**
 * Independencia financiera (`/informes/proyecciones/independencia`, §3.13): gasto mensual objetivo, ahorro mensual, rentabilidad
 * REAL esperada, tasa de retiro (4 % por defecto) y, si quieres, tus cuotas de préstamo. Sale el capital necesario, la fecha
 * estimada y la curva. Es una estimación, no asesoría. Los montos viajan en el cuerpo del POST, nunca en la URL.
 */
export function IndependenceScreen() {
  const { dict, locale } = useI18n();
  const t = dict.fin.indep;
  const href = useHref();
  const [spending, setSpending] = useState("");
  const [saving, setSaving] = useState("");
  const [returnPct, setReturnPct] = useState("");
  const [withdrawal, setWithdrawal] = useState(DEFAULT_WITHDRAWAL_PCT);
  const [capital, setCapital] = useState("");
  const [obligations, setObligations] = useState(false);
  const [touched, setTouched] = useState(false);
  // Se calcula al pulsar «Calcular»: no se manda una petición por cada tecla.
  const [request, setRequest] = useState<ReturnType<typeof buildIndependence>["body"]>(null);

  const draft = { spending, saving, returnPct, withdrawalPct: withdrawal, startingCapital: capital, includeObligations: obligations };
  const built = buildIndependence(draft);
  const result = useQuery<Independence>(paths.independence(), request);
  const bad = dict.fin.common.invalidAmount;
  const has = (field: (typeof built.invalid)[number]) => touched && built.invalid.includes(field);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    setRequest(built.body);
  }
  const d = request ? result.data : null;
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["informes-independencia"]} eyebrow={dict.screens.informes} back={{ href: href("informes"), label: dict.screens.informes }} />
      <ProjectionTabs current="informes-independencia" />
      <Banner tone="warning" live="off">
        {t.disclaimer}
      </Banner>
      <form onSubmit={onSubmit} className="fin-form" noValidate>
        <AmountField label={t.spending} hint={t.spendingHint} value={spending} onChange={setSpending} required error={has("spending") ? bad : null} />
        <AmountField label={t.saving} hint={t.savingHint} value={saving} onChange={setSaving} error={has("saving") ? bad : null} />
        <div className="fin-grid-2">
          <TextField label={t.returnPct} hint={t.returnHint} value={returnPct} onChange={setReturnPct} inputMode="decimal" required error={has("return") ? dict.fin.cards.rateInvalid : null} />
          <TextField label={t.withdrawal} hint={t.withdrawalHint} value={withdrawal} onChange={setWithdrawal} inputMode="decimal" error={has("withdrawal") ? dict.fin.cards.rateInvalid : null} />
        </div>
        <AmountField label={t.capital} hint={t.capitalHint} value={capital} onChange={setCapital} error={has("capital") ? bad : null} />
        <Checkbox label={t.includeObligations} hint={t.includeObligationsHint} checked={obligations} onChange={setObligations} />
        <div className="actions fin-form-actions">
          <button type="submit" className="button button--primary" disabled={result.loading && request !== null}>
            {t.calculate}
          </button>
        </div>
      </form>

      {request && result.loading && !d && <Loading />}
      {request && result.failure && <ErrorState message={result.failure.code === "invalid_independence_inputs" ? dict.fin.errors.invalid_independence_inputs : dict.fin.errors.generic} onRetry={result.reload} />}
      {d && <Result d={d} locale={locale} />}
    </div>
  );
}

function Result({ d, locale }: { d: Independence; locale: "es" | "en" }) {
  const { dict } = useI18n();
  const t = dict.fin.indep;
  const when = d.months === null ? null : yearsMonths(d.months);
  return (
    <section className="fin-card" aria-label={t.resultTitle} data-testid="independence-result">
      <h2 className="title-m">{t.resultTitle}</h2>
      <p>
        <span className="muted">{t.needed}</span> <strong className="fin-big"><Money value={d.needed_capital} /></strong>
      </p>
      {d.reachable && d.estimated_on && when ? (
        <p>
          <span className="muted">{t.estimatedOn}</span> <strong>{formatPeriod(periodOf(d.estimated_on), locale)}</strong> · {fill(t.inTime, { years: String(when.years), months: String(when.months) })}
        </p>
      ) : (
        <Banner tone="warning">{t.unreachable}</Banner>
      )}
      <dl className="sim-summary">
        <div className="sim-summary__item">
          <dt className="muted">{t.usedSpending}</dt>
          <dd><Money value={d.monthly_spending} /></dd>
        </div>
        {d.obligations_monthly !== "0" && d.obligations_monthly !== "0.00" && (
          <div className="sim-summary__item">
            <dt className="muted">{t.obligations}</dt>
            <dd><Money value={d.obligations_monthly} /></dd>
          </div>
        )}
        <div className="sim-summary__item">
          <dt className="muted">{t.startingCapital}</dt>
          <dd><Money value={d.starting_capital} /></dd>
        </div>
        <div className="sim-summary__item">
          <dt className="muted">{t.withdrawalUsed}</dt>
          <dd>{formatPercent(fractionToPercent(d.withdrawal_rate, 4), locale, 2)}</dd>
        </div>
      </dl>
      {d.curve.length > 0 && (
        <Section title={t.curveTitle}>
          <BarChart
            caption={t.curveCaption}
            series={[t.capitalSeries]}
            rows={d.curve.map((point, i) => ({ key: String(point.months), label: fill(t.curveYear, { n: String(Math.floor(point.months / 12)) }), values: [{ node: <Money value={point.capital} compact />, width: scaleWidths(d.curve.map((p) => p.capital))[i] }] }))}
          />
        </Section>
      )}
      {d.notes.length > 0 && (
        <ul className="hint">
          {d.notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      )}
      <p className="hint">{t.disclaimer}</p>
    </section>
  );
}
