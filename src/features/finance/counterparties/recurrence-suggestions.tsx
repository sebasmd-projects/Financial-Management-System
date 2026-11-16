"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { DetectedRecurrence, DetectedRecurrenceResult } from "@/api/models";
import { roots } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { useHref, useSubmit } from "../hooks";
import { Banner, Section } from "../kit";
import { detectedBody, suggestionLine } from "./logic";

/**
 * Recurrentes que parecen haber en lo importado: mismo destino, monto parecido y fechas regulares. **Nunca se crea nada solo**: antes de
 * importar solo se avisa; después, «Crear recurrente» la crea con todo lleno y deja los pagos anteriores enlazados como pagados.
 */
export function RecurrenceSuggestions({ suggestions, canCreate, onCreated }: { suggestions: readonly DetectedRecurrence[]; canCreate: boolean; onCreated?: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.cp.import;
  const href = useHref();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [created, setCreated] = useState<string[]>([]);
  const visible = suggestions.filter((s) => !dismissed.has(key(s)));
  if (visible.length === 0 && created.length === 0) return null;
  return (
    <Section title={t.suggestionsTitle}>
      {visible.length > 0 && <p className="muted">{canCreate ? t.suggestionsIntro : `${t.suggestionsIntro} ${t.suggestionsAfter}`}</p>}
      {created.map((message) => (
        <Banner key={message} tone="positive">
          {message}{" "}
          <Link href={href("pagos-fijos")}>{t.view}</Link>
        </Banner>
      ))}
      <ul className="fin-list" data-testid="recurrence-suggestions">
        {visible.map((s) => (
          <li key={key(s)} className="fin-row fin-row--static">
            <Suggestion
              s={s}
              canCreate={canCreate}
              onDismiss={() => setDismissed((current) => new Set([...current, key(s)]))}
              onCreated={(message) => {
                setCreated((current) => [...current, message]);
                setDismissed((current) => new Set([...current, key(s)]));
                onCreated?.();
              }}
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}

const key = (s: DetectedRecurrence) => `${s.counterparty.id}|${s.type}`;

function Suggestion({ s, canCreate, onDismiss, onCreated }: { s: DetectedRecurrence; canCreate: boolean; onDismiss: () => void; onCreated: (message: string) => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.cp.import;
  const submit = useSubmit();
  async function create() {
    const body = detectedBody(s);
    const result = await submit.run(body, (idempotencyKey) => api.post<DetectedRecurrenceResult>(roots.recurrencesDetected, body, { idempotencyKey, locale }));
    if (result.ok) onCreated(fill(t.created, { name: result.data.recurrence.name, count: String(result.data.linked) }));
  }
  return (
    <div className="cp-suggestion">
      <p className="fin-row__title">{suggestionLine(s, dict.fin.cp)}</p>
      <p className="cp-suggestion__dates">
        {fill(t.occurrences, { count: String(s.occurrences) })}
        {s.rows.length > 0 ? ` · ${fill(t.fromFile, { count: String(s.rows.length) })}` : ""}
        {` · ${s.dates.map((d) => formatDate(d)).join(", ")}`}
      </p>
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <div className="actions">
        {canCreate && (
          <button type="button" className="button button--primary" disabled={submit.pending || !s.account_id} onClick={() => void create()}>
            {submit.pending ? t.creating : t.create}
          </button>
        )}
        <button type="button" className="button button--ghost" onClick={onDismiss}>
          {t.dismiss}
        </button>
      </div>
    </div>
  );
}
