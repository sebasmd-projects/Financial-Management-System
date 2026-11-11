"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Recurrence } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { useSubmit } from "../hooks";
import { Banner, FormActions } from "../kit";
import { pauseFields, pausesFromRecurrence, termsFields, termsFromRecurrence } from "./conditions";
import { MonthChecks, PauseFields, TermsFields } from "./conditions-fields";
import { usesMonths } from "./schedule";

/** Edita los meses, las pausas y las ventanas de pago de una recurrencia (`PATCH recurrences/{id}`). Se monta dentro de la hoja. */
export function ConditionsEditor({ recurrence: r, onSaved, onCancel }: { recurrence: Recurrence; onSaved: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.terms;
  const submit = useSubmit();
  const [months, setMonths] = useState<number[]>([...(r.months ?? [])]);
  const [pauses, setPauses] = useState(() => pausesFromRecurrence(r));
  const [terms, setTerms] = useState(() => termsFromRecurrence(r));
  const [touched, setTouched] = useState(false);
  const isIncome = r.kind === "income";
  const pausesBody = pauseFields(pauses);
  const termsBody = isIncome ? { fields: {}, problems: {} } : termsFields(terms, true);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!pausesBody.valid || Object.keys(termsBody.problems).length > 0) return;
    const body = { ...(usesMonths(r.frequency) ? { months } : {}), ...pausesBody.fields, ...termsBody.fields };
    const result = await submit.run(body, (key) => api.patch<Recurrence>(paths.recurrence(r.id), body, { idempotencyKey: key, locale }));
    if (result.ok) onSaved();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="fin-form">
      {usesMonths(r.frequency) && <MonthChecks legend={t.monthsLegend} hint={t.monthsHint} value={months} onChange={setMonths} />}
      <h3 className="title-s">{t.pausesTitle}</h3>
      <PauseFields value={pauses} onChange={setPauses} />
      {!isIncome && (
        <>
          <h3 className="title-s">{t.windowsTitle}</h3>
          <TermsFields value={terms} onChange={setTerms} problems={termsBody.problems} touched={touched} />
        </>
      )}
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
