"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Occurrence, SplitResult } from "@/api/models";
import { paths } from "@/api/paths";
import { todayBogota, formatDate } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { useSubmit } from "../hooks";
import { Banner, FormActions, Modal, Money, TextField } from "../kit";
import { splitBody, splitPlan } from "./split";

/** Hoja «Dividir en cuotas» de una obligación abierta y sin pagos (`POST occurrences/{id}/split`). */
export function SplitSheet({ occurrence: o, open, onClose, onDone }: { occurrence: Occurrence; open: boolean; onClose: () => void; onDone: (result: SplitResult) => void }) {
  const { dict } = useI18n();
  return (
    <Modal open={open} title={dict.fin.split.title} onClose={onClose}>
      <SplitForm occurrence={o} onCancel={onClose} onDone={onDone} />
    </Modal>
  );
}

function SplitForm({ occurrence: o, onCancel, onDone }: { occurrence: Occurrence; onCancel: () => void; onDone: (result: SplitResult) => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.split;
  const submit = useSubmit();
  const [count, setCount] = useState("4");
  const [first, setFirst] = useState(o.adjusted_date > todayBogota() ? o.adjusted_date : todayBogota());
  const [every, setEvery] = useState("3");
  const plan = splitPlan({ count, first, every }, o.pending);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!plan) return;
    const body = splitBody(plan);
    const result = await submit.run(body, (key) => api.post<SplitResult>(paths.occurrenceAction(o.id, "split"), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone(result.data);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="fin-form">
      <p className="muted">{t.intro}</p>
      <p>
        {o.name}: <Money value={o.pending} />
      </p>
      <div className="fin-grid-2">
        <TextField label={t.count} hint={t.countHint} value={count} onChange={setCount} inputMode="numeric" maxLength={2} required />
        <TextField label={t.every} hint={t.everyHint} value={every} onChange={setEvery} inputMode="numeric" maxLength={2} required />
      </div>
      <TextField label={t.first} type="date" value={first} onChange={setFirst} required />
      <div className="fin-sim" aria-live="polite">
        <h3 className="title-s">{t.preview}</h3>
        {plan === null ? (
          <p className="muted">{t.invalid}</p>
        ) : (
          <ol className="fin-list">
            {plan.dates.map((date, index) => (
              <li key={date + index} className="fin-row fin-row--static">
                <span className="fin-row__main">
                  <span className="fin-row__title">{fill(t.previewRow, { n: String(index + 1) })}</span>
                  <span className="fin-row__sub muted">{formatDate(date)}</span>
                </span>
                <Money value={plan.amounts[index]} />
              </li>
            ))}
          </ol>
        )}
      </div>
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
        </Banner>
      )}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || plan === null}>
          {submit.pending ? dict.fin.common.saving : t.confirm}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

/** «Deshacer la división» de una obligación dividida (`POST occurrences/{id}/unsplit`; solo si ninguna cuota tiene pagos). */
export function UnsplitButton({ occurrenceId, onDone }: { occurrenceId: string; onDone: (result: Occurrence) => void }) {
  const { dict, locale } = useI18n();
  const submit = useSubmit();
  async function click() {
    const result = await submit.run({ occurrenceId }, (key) => api.post<Occurrence>(paths.occurrenceAction(occurrenceId, "unsplit"), undefined, { idempotencyKey: key, locale }));
    if (result.ok) onDone(result.data);
  }
  return (
    <div className="fin-unsplit">
      <button type="button" className="button button--ghost" disabled={submit.pending} onClick={() => void click()}>
        {dict.fin.split.undo}
      </button>
      {submit.error ? (
        <p className="field__error" role="alert">
          {submit.error}
        </p>
      ) : (
        <p className="hint">{dict.fin.split.undoHint}</p>
      )}
    </div>
  );
}
