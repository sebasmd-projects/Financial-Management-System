"use client";

import { useState } from "react";
import { api } from "@/api";
import type { LoanRates } from "@/api/models";
import { paths } from "@/api/paths";
import { fractionToPercent, percentToFraction } from "@/lib/amount-input";
import { formatDate, todayBogota } from "@/lib/dates";
import { formatPercent } from "@/lib/percent";
import { useI18n } from "@/i18n/provider";
import { RATE_CONVENTIONS, type RateConventionCode } from "../cards/cards-screen";
import { useResource, useSubmit } from "../hooks";
import { Badge, Banner, ErrorState, FormActions, Loading, Modal, Section, SelectField, TextField } from "../kit";

/** Tasas con vigencia (§3.8): cada tasa lleva su fuente; una tasa corriente nueva cierra la vigente y recalcula lo pendiente. */
export function RatesPanel({ loanId, canRecalculate, onChanged }: { loanId: string; canRecalculate: boolean; onChanged: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.credit.rates;
  const rates = useResource<LoanRates>(paths.loanRates(loanId));
  const [adding, setAdding] = useState(false);
  return (
    <Section
      title={t.title}
      aside={
        <button type="button" className="button button--ghost" onClick={() => setAdding(true)}>
          {t.add}
        </button>
      }
    >
      <p className="muted">{canRecalculate ? t.intro : t.customNotice}</p>
      {rates.loading && !rates.data && <Loading />}
      {rates.failure && <ErrorState message={dict.fin.errors.generic} onRetry={rates.reload} />}
      {rates.data && rates.data.rates.length === 0 && <p className="muted">{t.none}</p>}
      {rates.data && rates.data.rates.length > 0 && (
        <ul className="fin-list">
          {rates.data.rates.map((rate) => (
            <li key={rate.id} className="fin-row fin-row--static">
              <span className="fin-row__main">
                <span className="fin-row__title">
                  {formatPercent(fractionToPercent(rate.rate, 4), locale, 4)} {rate.convention} · {t.kinds[rate.kind]}
                </span>
                <span className="fin-row__sub muted">
                  {formatDate(rate.valid_from)} – {rate.valid_to ? formatDate(rate.valid_to) : t.open} · {t.source}: {rate.source}
                </span>
                {rate.valid_to === null && <Badge tone="info">{t.inForce}</Badge>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Modal open={adding} title={t.add} onClose={() => setAdding(false)}>
        <RateForm
          loanId={loanId}
          onCancel={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            rates.reload();
            onChanged();
          }}
        />
      </Modal>
    </Section>
  );
}

function RateForm({ loanId, onDone, onCancel }: { loanId: string; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.credit.rates;
  const submit = useSubmit();
  const [kind, setKind] = useState<"current" | "late">("current");
  const [rate, setRate] = useState("");
  const [convention, setConvention] = useState<RateConventionCode>("EM");
  const [validFrom, setValidFrom] = useState(todayBogota());
  const [source, setSource] = useState("");
  const [touched, setTouched] = useState(false);
  const rateValue = percentToFraction(rate);
  const valid = rateValue !== null && validFrom !== "" && source.trim() !== "";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const body = { kind, rate: rateValue!, rate_convention: convention, valid_from: validFrom, source: source.trim() };
    const result = await submit.run(body, (key) => api.post(paths.loanRates(loanId), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <SelectField label={t.kind} value={kind} onChange={(v) => setKind(v as "current" | "late")} options={[{ value: "current", label: t.kinds.current }, { value: "late", label: t.kinds.late }]} />
      <div className="fin-grid-2">
        <TextField label={dict.fin.loans.fields.rate} hint={dict.fin.cards.fields.rateHint} value={rate} onChange={setRate} inputMode="decimal" required error={touched && rateValue === null ? dict.fin.cards.rateInvalid : null} />
        <SelectField label={dict.fin.loans.fields.convention} value={convention} onChange={(v) => setConvention(v as RateConventionCode)} options={RATE_CONVENTIONS.map((c) => ({ value: c, label: c }))} />
      </div>
      <TextField label={t.validFrom} type="date" value={validFrom} onChange={setValidFrom} required />
      <TextField label={t.source} hint={t.sourceHint} value={source} onChange={setSource} maxLength={120} required error={touched && source.trim() === "" ? dict.fin.errors.source_required : null} />
      <p className="hint">{kind === "current" ? t.recalcHint : t.lateHint}</p>
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
