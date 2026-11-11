"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Consolidation, Currency, ExchangeRate } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { formatDate, todayBogota } from "@/lib/dates";
import { formatForeign, formatRate, parseRateInput } from "@/lib/decimal";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { fill } from "../helpers";
import { useAll, useResource, useSubmit } from "../hooks";
import { Badge, Banner, Empty, ErrorState, FormActions, Loading, Modal, Money, ScreenHeader, Section, Segmented, TextField, Tabs } from "../kit";
import { sortRates } from "./logic";

/** `/configuracion/monedas`: tasas de cambio fechadas (con su fuente) y el consolidado en pesos (diseño §3.15, corte 2.5). */
export function CurrenciesScreen() {
  const { dict } = useI18n();
  const t = dict.fin.fx;
  const [tab, setTab] = useState<"rates" | "consolidation">("rates");
  const currencies = useResource<Currency[]>(paths.currencies());
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["config-monedas"]} eyebrow={dict.nav.sections.config} />
      <p className="muted">{t.intro}</p>
      {currencies.loading && !currencies.data && <Loading />}
      {currencies.failure && <ErrorState message={dict.fin.errors.generic} onRetry={currencies.reload} />}
      {currencies.data && (
        <Tabs label={t.tabs.label} value={tab} onChange={setTab} tabs={[{ value: "rates", label: t.tabs.rates }, { value: "consolidation", label: t.tabs.consolidation }]}>
          {tab === "rates" ? <RatesTab currencies={currencies.data} onChanged={currencies.reload} /> : <ConsolidationTab />}
        </Tabs>
      )}
    </div>
  );
}

function RatesTab({ currencies, onChanged }: { currencies: readonly Currency[]; onChanged: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.fx;
  const [picked, setPicked] = useState("");
  const code = picked || currencies[0]?.code || "";
  const rates = useAll<ExchangeRate>(code ? paths.exchangeRates({ currency: code }) : null);
  const [editing, setEditing] = useState<ExchangeRate | "new" | null>(null);
  const [removing, setRemoving] = useState<ExchangeRate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (currencies.length === 0) return <Empty icon="wallet" title={t.noCurrenciesTitle} body={t.noCurrenciesBody} />;
  const current = currencies.find((c) => c.code === code);
  const list = sortRates(rates.items);
  const refresh = () => {
    rates.reload();
    onChanged();
  };
  return (
    <div className="fin-stack">
      <Segmented legend={t.currency} variant="chips" value={code} onChange={(v) => { setPicked(v); setNotice(null); }} options={currencies.map((c) => ({ value: c.code, label: c.code }))} />
      {current && (
        <p className="muted">
          {current.latest_rate ? `${t.latest}: ${fill(t.perUnit, { currency: code })} ${formatRate(current.latest_rate.rate)} · ${formatDate(current.latest_rate.on)}` : t.noRate}
        </p>
      )}
      <Section
        title={fill(t.ratesTitle, { currency: code })}
        aside={
          <button type="button" className="button button--primary" onClick={() => setEditing("new")}>
            <Icon name="plus" size={20} />
            {t.add}
          </button>
        }
      >
        {notice && <Banner tone="positive">{notice}</Banner>}
        {rates.loading && !rates.data && <Loading />}
        {rates.failure && <ErrorState message={dict.fin.errors.generic} onRetry={rates.reload} />}
        {rates.data && list.length === 0 && <Empty icon="wallet" title={fill(t.ratesEmptyTitle, { currency: code })} body={fill(t.ratesEmptyBody, { currency: code })} />}
        {list.length > 0 && (
          <ul className="fin-list">
            {list.map((rate, index) => (
              <li key={rate.id} className="fin-row fin-row--static">
                <span className="fin-row__main">
                  <span className="fin-row__title tabular">
                    {fill(t.perUnit, { currency: rate.currency })} {formatRate(rate.rate)}
                  </span>
                  <span className="fin-row__sub muted">
                    {formatDate(rate.on)} · {rate.source}
                  </span>
                  {index === 0 && <Badge tone="info">{t.latest}</Badge>}
                </span>
                <span className="actions">
                  <button type="button" className="button button--ghost" onClick={() => setEditing(rate)}>
                    {t.edit}
                    <span className="visually-hidden"> {formatDate(rate.on)}</span>
                  </button>
                  <button type="button" className="button button--ghost" onClick={() => setRemoving(rate)}>
                    {t.remove}
                    <span className="visually-hidden"> {formatDate(rate.on)}</span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">{t.historyNote}</p>
      </Section>
      <Modal open={editing !== null} title={editing === "new" || editing === null ? fill(t.form.title, { currency: code }) : fill(t.form.editTitle, { date: formatDate(editing.on) })} onClose={() => setEditing(null)}>
        {editing !== null && (
          <RateForm
            currency={code}
            existing={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onDone={() => {
              setEditing(null);
              setNotice(t.form.saved);
              refresh();
            }}
          />
        )}
      </Modal>
      <Modal open={removing !== null} title={t.removeTitle} onClose={() => setRemoving(null)}>
        {removing !== null && (
          <RemoveRate
            rate={removing}
            onCancel={() => setRemoving(null)}
            onDone={() => {
              setRemoving(null);
              setNotice(t.removed);
              refresh();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function RateForm({ currency, existing, onDone, onCancel }: { currency: string; existing: ExchangeRate | null; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.fx.form;
  const submit = useSubmit();
  const today = todayBogota();
  const [on, setOn] = useState(existing?.on ?? today);
  const [rateText, setRateText] = useState(existing ? existing.rate : "");
  const [source, setSource] = useState(existing?.source ?? "");
  const [touched, setTouched] = useState(false);
  const rate = parseRateInput(rateText);
  const future = on > today;
  const valid = rate !== null && source.trim() !== "" && on !== "" && !future;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const result = existing
      ? await submit.run({ rate, source: source.trim(), id: existing.id }, (key) => api.patch(paths.exchangeRate(existing.id), { rate: rate!, source: source.trim() }, { idempotencyKey: key, locale }))
      : await submit.run({ currency, on, rate, source: source.trim() }, (key) => api.post(roots.exchangeRates, { currency, on, rate: rate!, source: source.trim() }, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={t.date} type="date" value={on} onChange={setOn} required error={touched && future ? t.dateFuture : null} />
      <TextField label={fill(t.rate, { currency })} hint={t.rateHint} value={rateText} onChange={setRateText} inputMode="decimal" required error={touched && rate === null ? t.rateInvalid : null} />
      {rate !== null && <p className="fin-phrase">{fill(t.readBack, { currency, rate: formatRate(rate) })}</p>}
      <TextField label={t.source} hint={t.sourceHint} value={source} onChange={setSource} maxLength={300} required error={touched && source.trim() === "" ? dict.fin.errors.source_required : null} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : t.save}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

function RemoveRate({ rate, onDone, onCancel }: { rate: ExchangeRate; onDone: () => void; onCancel: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.fx;
  const submit = useSubmit();
  async function confirm() {
    const result = await submit.run({ remove: rate.id }, () => api.delete(paths.exchangeRate(rate.id)));
    if (result.ok) onDone();
  }
  return (
    <div className="fin-form">
      <p>{fill(t.removeBody, { currency: rate.currency, date: formatDate(rate.on) })}</p>
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="button" className="button button--primary" onClick={confirm} disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : t.removeConfirm}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </div>
  );
}

/** Mes en curso: del día 1 a hoy (fechas de negocio, America/Bogota). */
function monthToDate(): { from: string; to: string } {
  const today = todayBogota();
  return { from: `${today.slice(0, 8)}01`, to: today };
}

function ConsolidationTab() {
  const { dict } = useI18n();
  const t = dict.fin.fx.consolidation;
  const [range, setRange] = useState(monthToDate);
  const data = useResource<Consolidation>(range.from && range.to && range.from <= range.to ? paths.consolidation(range) : null);
  return (
    <div className="fin-stack">
      <p className="muted">{t.intro}</p>
      <div className="fin-grid-2">
        <TextField label={t.from} type="date" value={range.from} onChange={(from) => setRange((r) => ({ ...r, from }))} />
        <TextField label={t.to} type="date" value={range.to} onChange={(to) => setRange((r) => ({ ...r, to }))} />
      </div>
      {data.loading && !data.data && <Loading />}
      {data.failure && <ErrorState message={dict.fin.errors.generic} onRetry={data.reload} />}
      {data.data && data.data.rows.length === 0 && <Empty icon="wallet" title={t.emptyTitle} body={t.emptyBody} />}
      {data.data && data.data.rows.length > 0 && (
        <>
          <dl className="sim-summary">
            <div className="sim-summary__item">
              <dt className="muted">{dict.fin.fx.consolidation.spentTotal}</dt>
              <dd><Money value={data.data.spent_booked_total} /></dd>
            </div>
            <div className="sim-summary__item">
              <dt className="muted">{dict.fin.fx.consolidation.incomeTotal}</dt>
              <dd><Money value={data.data.income_booked_total} /></dd>
            </div>
          </dl>
          {data.data.rows.map((row) => (
            <Section key={row.currency} title={`${row.currency} · ${fill(t.movements, { count: String(row.count) })}`}>
              <div className="table-wrap">
                <table className="table">
                  <caption className="visually-hidden">{`${t.tableCaption}: ${row.currency}`}</caption>
                  <thead>
                    <tr>
                      <th scope="col"><span className="visually-hidden">{row.currency}</span></th>
                      <th scope="col" className="table__num">{t.original}</th>
                      <th scope="col" className="table__num">{t.booked}</th>
                      <th scope="col" className="table__num">{t.atLatest}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">{t.spent}</th>
                      <td className="table__num">{formatForeign(row.spent_original, row.currency)}</td>
                      <td className="table__num"><Money value={row.spent_booked} /></td>
                      <td className="table__num">{row.spent_at_latest_rate === null ? t.noLatest : <Money value={row.spent_at_latest_rate} />}</td>
                    </tr>
                    <tr>
                      <th scope="row">{t.income}</th>
                      <td className="table__num">{formatForeign(row.income_original, row.currency)}</td>
                      <td className="table__num"><Money value={row.income_booked} /></td>
                      <td className="table__num">{row.income_at_latest_rate === null ? t.noLatest : <Money value={row.income_at_latest_rate} />}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {row.latest_rate && <p className="hint">{fill(t.latestRate, { rate: formatRate(row.latest_rate.rate), date: formatDate(row.latest_rate.on), source: row.latest_rate.source })}</p>}
              {row.spent_difference !== null && (
                <p className="hint">
                  {t.difference}: <Money value={row.spent_difference} sign="always" />
                </p>
              )}
            </Section>
          ))}
        </>
      )}
    </div>
  );
}
