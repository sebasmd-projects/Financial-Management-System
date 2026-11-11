"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/api";
import type { Parameter, ParameterCatalog, UserParameter } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { formatDate, todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { useHref, useResource, useSubmit } from "../hooks";
import { AmountField, Badge, Banner, DefinitionList, Empty, ErrorState, FormActions, Loading, Modal, ScreenHeader, TextArea, TextField } from "../kit";
import { LATE_RATE_KEY } from "../payments/conditions";
import { displayValue, newValueBody, type NewValueProblems, type Unit } from "./logic";

/** Parámetros Colombia (`/configuración/parámetros`, diseño §3.15): catálogo con valor vigente, fuente y vigencia; valores propios con fuente obligatoria. */
export function ParametersScreen() {
  const { dict, locale } = useI18n();
  const t = dict.fin.params;
  const href = useHref();
  const params = useSearchParams();
  const catalog = useResource<ParameterCatalog[]>(paths.parameterCatalog());
  const [selected, setSelected] = useState<string | null>(() => params.get("clave"));
  const entry = catalog.data?.find((p) => p.key === selected) ?? null;
  const lateRate = params.get("clave") === LATE_RATE_KEY;

  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["config-parametros"]} eyebrow={dict.nav.sections.config} back={{ href: href("pagos"), label: dict.nav.sections.pagos }} />
      <p className="muted">{t.intro}</p>
      {lateRate && (
        <Banner tone="warning">
          <p>
            <strong>{t.lateRateTitle}</strong>
          </p>
          <p>{t.lateRateHint}</p>
        </Banner>
      )}
      {catalog.loading && !catalog.data && <Loading />}
      {catalog.failure && <ErrorState message={t.loadError} onRetry={catalog.reload} />}
      {catalog.data && catalog.data.length === 0 && <Empty icon="gear" title={t.emptyTitle} body={t.emptyBody} />}
      {catalog.data && catalog.data.length > 0 && (
        <ul className="fin-list">
          {catalog.data.map((p) => (
            <li key={p.key}>
              <button type="button" className="fin-row params__row" onClick={() => setSelected(p.key)} aria-haspopup="dialog">
                <span className="fin-row__main">
                  <span className="fin-row__title">{p.label}</span>
                  <span className="fin-row__sub">
                    {p.value !== null ? (
                      <>
                        <strong>{displayValue(p.unit, p.value, locale)}</strong>
                        {p.valid_from ? ` · ${fill(t.from, { date: formatDate(p.valid_from) })}` : ""}
                        {p.valid_to ? ` ${fill(t.until, { date: formatDate(p.valid_to) })}` : ` · ${t.open}`}
                      </>
                    ) : (
                      t.noValue
                    )}
                  </span>
                  {p.source && (
                    <span className="fin-row__sub muted">
                      {t.source}: {p.source}
                    </span>
                  )}
                  {p.gap_from && (
                    <span className="fin-row__badges">
                      <Badge tone="warning">{fill(t.gap, { date: formatDate(p.gap_from) })}</Badge>
                    </span>
                  )}
                </span>
                <Badge tone={p.scope === "user" ? "info" : "neutral"}>{t.scope[p.scope]}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={entry !== null} title={entry ? fill(t.detailTitle, { label: entry.label }) : ""} onClose={() => setSelected(null)}>
        {entry && <ParameterDetail entry={entry} onChanged={catalog.reload} />}
      </Modal>
    </div>
  );
}

function ParameterDetail({ entry, onChanged }: { entry: ParameterCatalog; onChanged: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.params;
  const global = useResource<Parameter[]>(paths.parameters(entry.key));
  const mine = useResource<UserParameter[]>(paths.userParameters(entry.key));
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [closing, setClosing] = useState<UserParameter | null>(null);
  const remove = useSubmit();
  const today = todayBogota();
  const reload = () => {
    mine.reload();
    global.reload();
    onChanged();
  };

  async function onRemove(row: UserParameter) {
    const result = await remove.run({ remove: row.id }, () => api.delete(paths.userParameter(row.id)));
    if (result.ok) {
      setNotice(t.removed);
      reload();
    }
  }

  return (
    <div className="fin-form">
      <p className="muted">{entry.description}</p>
      <p>
        <Badge>{t.units[entry.unit]}</Badge> {entry.seeded && <Badge tone="info">{t.seeded}</Badge>}
      </p>
      {notice && (
        <Banner tone="positive">
          <p>{notice}</p>
        </Banner>
      )}
      {remove.error && (
        <Banner tone="negative" live="assertive">
          {remove.error}
        </Banner>
      )}

      <h3 className="title-s">{t.mine}</h3>
      {mine.loading && !mine.data && <Loading />}
      {mine.failure && <ErrorState message={dict.fin.errors.generic} onRetry={mine.reload} />}
      {mine.data && mine.data.length === 0 && <p className="muted">{t.mineNone}</p>}
      {mine.data && mine.data.length > 0 && (
        <ul className="fin-list">
          {mine.data.map((row) => (
            <li key={row.id} className="fin-row fin-row--static">
              <div className="fin-row__main">
                <span className="fin-row__title">{displayValue(entry.unit, row.value, locale)}</span>
                <span className="fin-row__sub muted">
                  {fill(t.from, { date: formatDate(row.valid_from) })} {row.valid_to ? fill(t.until, { date: formatDate(row.valid_to) }) : `· ${t.open}`}
                </span>
                <span className="fin-row__sub muted">
                  {t.source}: {row.source}
                </span>
              </div>
              <div className="notice__actions">
                {(row.valid_to === null || row.valid_to >= today) && row.valid_from <= today && (
                  <button type="button" className="button button--ghost" onClick={() => setClosing(row)}>
                    {t.close}
                  </button>
                )}
                {row.valid_from > today && (
                  <button type="button" className="button button--ghost" disabled={remove.pending} onClick={() => void onRemove(row)}>
                    {t.remove}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">{t.removeHint}</p>
      {!adding ? (
        <button type="button" className="button button--primary" onClick={() => setAdding(true)}>
          {t.add}
        </button>
      ) : (
        <AddValueForm
          entry={entry}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            setNotice(t.saved);
            reload();
          }}
        />
      )}
      {closing && (
        <CloseForm
          row={closing}
          onCancel={() => setClosing(null)}
          onSaved={() => {
            setClosing(null);
            setNotice(t.closed);
            reload();
          }}
        />
      )}

      <h3 className="title-s">{t.global}</h3>
      {global.loading && !global.data && <Loading />}
      {global.data && global.data.length === 0 && <p className="muted">{t.globalNone}</p>}
      {global.data && global.data.length > 0 && (
        <ul className="fin-list">
          {global.data.map((row) => (
            <li key={`${row.key}-${row.valid_from}`} className="fin-row fin-row--static">
              <div className="fin-row__main">
                <span className="fin-row__title">{displayValue(entry.unit, row.value, locale)}</span>
                <span className="fin-row__sub muted">
                  {fill(t.from, { date: formatDate(row.valid_from) })} {row.valid_to ? fill(t.until, { date: formatDate(row.valid_to) }) : `· ${t.open}`}
                </span>
                <span className="fin-row__sub muted">
                  {t.source}: {row.source}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <DefinitionList rows={[{ label: t.source, value: entry.source ?? t.noValue }]} />
    </div>
  );
}

function AddValueForm({ entry, onSaved, onCancel }: { entry: ParameterCatalog; onSaved: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.params;
  const submit = useSubmit();
  const [value, setValue] = useState("");
  const [validFrom, setValidFrom] = useState(todayBogota());
  const [validTo, setValidTo] = useState("");
  const [source, setSource] = useState("");
  const [touched, setTouched] = useState(false);
  const { body, problems } = newValueBody({ unit: entry.unit, value, validFrom, validTo, source });

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!body) return;
    const payload = { key: entry.key, ...body };
    const result = await submit.run(payload, (key) => api.post<UserParameter>(roots.userParameters, payload, { idempotencyKey: key, locale }));
    if (result.ok) onSaved();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="fin-form fin-window">
      <h3 className="title-s">{t.addTitle}</h3>
      <p className="muted">{t.addIntro}</p>
      <ValueField unit={entry.unit} value={value} onChange={setValue} problems={touched ? problems : {}} />
      <div className="fin-grid-2">
        <TextField label={t.validFrom} type="date" value={validFrom} onChange={setValidFrom} required error={touched && problems.validFrom ? dict.fin.common.requiredField : null} />
        <TextField label={t.validTo} type="date" value={validTo} onChange={setValidTo} hint={t.validToHint} error={touched && problems.range ? t.invalidRange : null} />
      </div>
      <TextArea label={t.sourceLabel} hint={t.sourceHint} value={source} onChange={setSource} required maxLength={500} rows={2} error={touched && problems.source ? t.sourceRequired : null} />
      {validFrom !== "" && validFrom < todayBogota() && <p className="hint">{t.pastNotice}</p>}
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
        </Banner>
      )}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : dict.fin.common.save}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

function ValueField({ unit, value, onChange, problems }: { unit: Unit; value: string; onChange: (v: string) => void; problems: NewValueProblems }) {
  const { dict } = useI18n();
  const t = dict.fin.params;
  if (unit === "amount") return <AmountField label={t.valueAmount} value={value} onChange={onChange} required error={problems.value ? t.invalidValue : null} />;
  return (
    <TextField
      label={unit === "fraction" ? t.valuePercent : t.valueCount}
      value={value}
      onChange={onChange}
      inputMode={unit === "fraction" ? "decimal" : "numeric"}
      maxLength={12}
      required
      error={problems.value ? (unit === "fraction" ? t.invalidPercent : t.invalidCount) : null}
    />
  );
}

function CloseForm({ row, onSaved, onCancel }: { row: UserParameter; onSaved: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.params;
  const submit = useSubmit();
  const [date, setDate] = useState(todayBogota());
  const invalid = date === "" || date < row.valid_from;
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (invalid) return;
    const body = { valid_to: date };
    const result = await submit.run({ id: row.id, ...body }, (key) => api.patch<UserParameter>(paths.userParameter(row.id), body, { idempotencyKey: key, locale }));
    if (result.ok) onSaved();
  }
  return (
    <form onSubmit={onSubmit} noValidate className="fin-form fin-window">
      <h3 className="title-s">{t.closeTitle}</h3>
      <TextField label={t.closeDate} type="date" value={date} onChange={setDate} required error={invalid ? t.invalidRange : null} />
      <p className="hint">{t.pastNotice}</p>
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
        </Banner>
      )}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || invalid}>
          {submit.pending ? dict.fin.common.saving : t.closeConfirm}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}
