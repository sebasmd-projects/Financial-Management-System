"use client";

import { useState } from "react";
import type { ImportMapping, ImportPreview } from "@/api/models";
import { useI18n } from "@/i18n/provider";
import { Banner, Checkbox, FormActions, Section, Segmented, SelectField, TextField } from "../kit";
import { DATE_FORMATS, initialMapping, mappingProblems, mappingToApi, type MappingForm } from "./logic";

/** Las primeras filas del archivo, para reconocer qué columna es cuál. Solo texto: nada se interpreta ni se ejecuta. */
function Sample({ preview }: { preview: ImportPreview }) {
  const { dict } = useI18n();
  const t = dict.fin.imp.mapping;
  if (preview.sample.length === 0) return null;
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={t.sampleCaption}>
      <table className="table">
        <caption className="visually-hidden">{t.sampleCaption}</caption>
        <thead>
          <tr>
            {preview.headers.map((header, index) => (
              <th key={index} scope="col">
                {header || "—"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.sample.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Paso 2 (diseño §3.6): qué columna es cada cosa, formato de fecha y separadores. El mapeo se guarda por banco. */
export function MappingStep({ preview, onApply, onBack, busy, error, isCard = false }: { preview: ImportPreview; onApply: (mapping: ImportMapping, save: boolean) => void; onBack: () => void; busy: boolean; error: string | null; isCard?: boolean }) {
  const { dict } = useI18n();
  const t = dict.fin.imp.mapping;
  const [form, setForm] = useState<MappingForm>(() => initialMapping(preview.headers, preview.mapping, preview.suggested_mapping));
  const [save, setSave] = useState(true);
  const [touched, setTouched] = useState(false);
  const set = (patch: Partial<MappingForm>) => setForm((current) => ({ ...current, ...patch }));
  const problems = mappingProblems(form);
  const has = (p: (typeof problems)[number]) => (touched && problems.includes(p) ? t.problems[p] : null);
  const columns = preview.headers.filter((header) => header !== "").map((header) => ({ value: header, label: header }));
  const optional = [{ value: "", label: t.none }, ...columns];

  function apply(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    const mapping = mappingToApi(form);
    if (mapping) onApply(mapping, save);
  }
  return (
    <form onSubmit={apply} className="fin-form" noValidate>
      <h2 className="title-m">{t.title}</h2>
      <p className="muted">{t.intro}</p>
      {preview.suggested_mapping && <p className="hint">{t.suggested}</p>}
      <Section title={t.sample}>
        <Sample preview={preview} />
      </Section>
      <SelectField label={t.date} value={form.date} onChange={(date) => set({ date })} options={columns} placeholder={t.pickColumn} required error={has("date")} />
      <SelectField label={t.description} value={form.description} onChange={(description) => set({ description })} options={optional} />
      <Segmented legend={t.amountMode} value={form.mode} onChange={(mode) => set({ mode: mode as MappingForm["mode"] })} options={[{ value: "single", label: t.single }, { value: "split", label: t.split }]} />
      {form.mode === "single" ? (
        <SelectField label={t.amount} value={form.amount} onChange={(amount) => set({ amount })} options={columns} placeholder={t.pickColumn} required error={has("amount")} />
      ) : (
        <div className="fin-grid-2">
          <SelectField label={t.debit} value={form.debit} onChange={(debit) => set({ debit })} options={columns} placeholder={t.pickColumn} required error={has("debit_credit")} />
          <SelectField label={t.credit} value={form.credit} onChange={(credit) => set({ credit })} options={columns} placeholder={t.pickColumn} required />
        </div>
      )}
      <div className="fin-grid-2">
        <SelectField label={t.reference} value={form.reference} onChange={(reference) => set({ reference })} options={optional} />
        <SelectField label={t.balance} value={form.balance} onChange={(balance) => set({ balance })} options={optional} />
      </div>
      {isCard && <SelectField label={t.installments} hint={t.installmentsHint} value={form.installments} onChange={(installments) => set({ installments })} options={optional} />}
      <SelectField label={t.dateFormat} hint={t.dateFormatHint} value={form.dateFormat} onChange={(dateFormat) => set({ dateFormat: dateFormat as MappingForm["dateFormat"] })} options={DATE_FORMATS.map((f) => ({ value: f, label: t.formats[f] }))} placeholder={t.pickFormat} required error={has("date_format")} />
      <div className="fin-grid-2">
        <SelectField label={t.decimalSep} value={form.decimalSep} onChange={(decimalSep) => set({ decimalSep: decimalSep as MappingForm["decimalSep"] })} options={[{ value: ",", label: t.comma }, { value: ".", label: t.dot }]} error={has("same_separator")} />
        <SelectField label={t.thousandsSep} value={form.thousandsSep} onChange={(thousandsSep) => set({ thousandsSep: thousandsSep as MappingForm["thousandsSep"] })} options={[{ value: ".", label: t.dot }, { value: ",", label: t.comma }, { value: " ", label: t.space }, { value: "", label: t.noSep }]} />
      </div>
      <TextField label={t.headerRow} hint={t.headerRowHint} value={form.headerRow} onChange={(headerRow) => set({ headerRow })} inputMode="numeric" error={has("header_row")} />
      <Checkbox label={t.save} checked={save} onChange={setSave} />
      {error && <Banner tone="negative" live="assertive">{error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={busy}>
          {t.apply}
        </button>
        <button type="button" className="button button--ghost" onClick={onBack}>
          {dict.fin.imp.review.back}
        </button>
      </FormActions>
    </form>
  );
}
