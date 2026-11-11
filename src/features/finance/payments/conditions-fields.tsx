"use client";

/**
 * Meses explícitos, pausas y ventanas de pago de una recurrencia (FMS-1b): los mismos campos en el alta y en la hoja de edición.
 * Estado en el padre; la validación y los campos de la API están en `conditions.ts` (puro, con pruebas).
 */
import { useId } from "react";
import { formatCop } from "@/lib/money";
import { parsePositiveAmount } from "@/lib/amount-input";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { fill } from "../helpers";
import { AmountField, Segmented, TextField } from "../kit";
import { type DateRange, type EarlyKind, type LateKind, type PausesState, rangeProblem, type TermsProblems, type TermsState, toggleMonth } from "./conditions";

/** Doce casillas, una por mes, en un grupo con leyenda. */
export function MonthChecks({ legend, hint, value, onChange }: { legend: string; hint?: string; value: readonly number[]; onChange: (months: number[]) => void }) {
  const { dict } = useI18n();
  const hintId = useId();
  return (
    <fieldset className="fin-months" aria-describedby={hint ? hintId : undefined}>
      <legend className="field__label">{legend}</legend>
      <div className="fin-months__grid">
        {dict.fin.months.map((label, index) => (
          <label key={label} className="fin-months__item">
            <input type="checkbox" checked={value.includes(index + 1)} onChange={() => onChange(toggleMonth(value, index + 1))} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {hint && (
        <p id={hintId} className="hint">
          {hint}
        </p>
      )}
    </fieldset>
  );
}

export function PauseFields({ value, onChange }: { value: PausesState; onChange: (next: PausesState) => void }) {
  const { dict } = useI18n();
  const t = dict.fin.terms;
  const setRange = (index: number, patch: Partial<DateRange>) => onChange({ ...value, ranges: value.ranges.map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  return (
    <div className="fin-form">
      <p className="muted">{t.pausesIntro}</p>
      <MonthChecks legend={t.skipMonthsLegend} value={value.months} onChange={(months) => onChange({ ...value, months })} />
      <fieldset className="fin-ranges">
        <legend className="field__label">{t.skipRanges}</legend>
        {value.ranges.length === 0 && <p className="muted">{t.noPauses}</p>}
        {value.ranges.map((range, index) => {
          const problem = rangeProblem(range);
          const touched = range.start !== "" || range.end !== "";
          return (
            <div key={index} className="fin-range">
              <div className="fin-grid-2">
                <TextField label={t.rangeStart} type="date" value={range.start} onChange={(v) => setRange(index, { start: v })} />
                <TextField label={t.rangeEnd} type="date" value={range.end} onChange={(v) => setRange(index, { end: v })} error={touched && problem ? (problem === "reversed" ? t.rangeReversed : t.rangeIncomplete) : null} />
              </div>
              <button type="button" className="button button--ghost" onClick={() => onChange({ ...value, ranges: value.ranges.filter((_, i) => i !== index) })}>
                <Icon name="x" size={20} />
                {t.rangeRemove}
              </button>
            </div>
          );
        })}
        <button type="button" className="button button--ghost" onClick={() => onChange({ ...value, ranges: [...value.ranges, { start: "", end: "" }] })}>
          <Icon name="plus" size={20} />
          {t.rangeAdd}
        </button>
      </fieldset>
    </div>
  );
}

export function TermsFields({ value, onChange, problems, touched }: { value: TermsState; onChange: (next: TermsState) => void; problems: TermsProblems; touched: boolean }) {
  const { dict } = useI18n();
  const t = dict.fin.terms;
  const set = (patch: Partial<TermsState>) => onChange({ ...value, ...patch });
  const earlyAmount = value.earlyKind === "fixed" ? parsePositiveAmount(value.earlyValue) : null;
  const lateAmount = value.lateKind === "fixed" ? parsePositiveAmount(value.lateValue) : null;
  return (
    <div className="fin-form">
      <p className="muted">{t.windowsIntro}</p>

      <section className="fin-window" aria-labelledby="terms-early">
        <h3 id="terms-early" className="title-s">
          {t.earlyTitle}
        </h3>
        <TextField label={t.earlyDays} hint={t.earlyDaysHint} value={value.earlyDays} onChange={(v) => set({ earlyDays: v })} inputMode="numeric" maxLength={3} error={touched && problems.earlyDays ? t.invalidDays : null} />
        <Segmented
          legend={t.earlyKind}
          options={(["percent", "fixed"] as const).map((k) => ({ value: k, label: t.earlyKinds[k] }))}
          value={value.earlyKind}
          onChange={(v) => set({ earlyKind: v as EarlyKind })}
        />
        {value.earlyKind === "percent" ? (
          <TextField label={t.earlyPercent} value={value.earlyValue} onChange={(v) => set({ earlyValue: v })} inputMode="decimal" maxLength={8} error={touched && problems.earlyValue ? t.invalidPercent : null} />
        ) : (
          <AmountField label={t.earlyFixed} value={value.earlyValue} onChange={(v) => set({ earlyValue: v })} error={touched && problems.earlyValue ? dict.fin.common.invalidAmount : null} preview={earlyAmount ? formatCop(earlyAmount) : null} />
        )}
        <p className="hint">{t.earlyOnlyFull}</p>
      </section>

      <section className="fin-window" aria-labelledby="terms-due">
        <h3 id="terms-due" className="title-s">
          {t.dueTitle}
        </h3>
        <p className="hint">{t.dueHint}</p>
      </section>

      <section className="fin-window" aria-labelledby="terms-late">
        <h3 id="terms-late" className="title-s">
          {t.lateTitle}
        </h3>
        <Segmented legend={t.lateKind} options={(["none", "fixed", "percent", "daily"] as const).map((k) => ({ value: k, label: t.lateKinds[k] }))} value={value.lateKind} onChange={(v) => set({ lateKind: v as LateKind })} />
        {value.lateKind === "fixed" && <AmountField label={t.lateFixed} hint={t.lateFixedHint} value={value.lateValue} onChange={(v) => set({ lateValue: v })} error={touched && problems.lateValue ? dict.fin.common.invalidAmount : null} preview={lateAmount ? formatCop(lateAmount) : null} />}
        {value.lateKind === "percent" && <TextField label={t.latePercent} hint={t.latePercentHint} value={value.lateValue} onChange={(v) => set({ lateValue: v })} inputMode="decimal" maxLength={8} error={touched && problems.lateValue ? t.invalidPercent : null} />}
        {value.lateKind === "daily" && <p className="hint">{t.lateDailyHint}</p>}
      </section>
    </div>
  );
}

/** Lo que ya está guardado, en una frase por ventana (detalle de la recurrencia). */
export function termsSummary(
  r: { early_days_before?: number | null; early_kind?: string; early_value?: string | null; late_kind?: string; late_value?: string | null },
  t: { summaryNone: string; summaryEarly: string; summaryLate: string; summaryLateDaily: string; percentOf: string; lateKinds: Record<string, string> },
): string[] {
  const lines: string[] = [];
  if (r.early_days_before && r.early_value && (r.early_kind === "percent" || r.early_kind === "fixed")) {
    const value = r.early_kind === "percent" ? fill(t.percentOf, { value: r.early_value }) : formatCop(r.early_value);
    lines.push(fill(t.summaryEarly, { value, days: String(r.early_days_before) }));
  }
  if (r.late_kind === "daily") lines.push(fill(t.summaryLate, { value: t.summaryLateDaily }));
  else if ((r.late_kind === "fixed" || r.late_kind === "percent") && r.late_value) {
    lines.push(fill(t.summaryLate, { value: r.late_kind === "percent" ? fill(t.percentOf, { value: r.late_value }) : formatCop(r.late_value) }));
  }
  return lines.length > 0 ? lines : [t.summaryNone];
}
