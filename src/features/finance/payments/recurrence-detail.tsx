"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Occurrence, Page, Recurrence } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { useHref, useResource, useSubmit } from "../hooks";
import { Badge, Banner, DefinitionList, ErrorState, Loading, Modal, Money, ScreenHeader, Section } from "../kit";
import { ConditionsEditor } from "./conditions-editor";
import { termsSummary } from "./conditions-fields";
import { OccurrenceList } from "./fixed-expenses";

type Status = "active" | "paused" | "cancelled";

function pauseText(r: Pick<Recurrence, "skip_months" | "skip_ranges">, monthNames: readonly string[], none: string): string {
  const parts = [...(r.skip_months ?? []).map((m) => monthNames[m - 1]), ...(r.skip_ranges ?? []).map((x) => `${formatDate(x.start)} – ${formatDate(x.end)}`)];
  return parts.length > 0 ? parts.join(", ") : none;
}

/** Una recurrencia (`/pagos/recurrencias/[id]`): sus datos, próximas fechas, ocurrencias del mes y pausar / reanudar / cancelar. */
export function RecurrenceDetail({ id }: { id: string }) {
  const { dict } = useI18n();
  const t = dict.fin.recurrence;
  const href = useHref();
  const submit = useSubmit();
  const recurrence = useResource<Recurrence>(paths.recurrence(id));
  const occurrences = useResource<Page<Occurrence>>(paths.occurrences({ recurrence: id }));
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const back = { href: href("pagos-fijos"), label: dict.screens["pagos-fijos"] };

  if (recurrence.loading && !recurrence.data) return <div className="screen"><ScreenHeader title={dict.screens["pagos-recurrencia"]} back={back} /><Loading /></div>;
  if (recurrence.failure || !recurrence.data) {
    return (
      <div className="screen">
        <ScreenHeader title={dict.screens["pagos-recurrencia"]} back={back} />
        <ErrorState message={recurrence.failure?.status === 404 ? dict.fin.errors.notFound : dict.fin.errors.generic} onRetry={recurrence.reload} />
      </div>
    );
  }
  const r = recurrence.data;

  async function setStatus(status: Status) {
    const body = { status };
    const result = await submit.run(body, (key) => api.patch(paths.recurrence(id), body, { idempotencyKey: key }));
    if (result.ok) {
      setConfirmCancel(false);
      recurrence.reload();
      occurrences.reload();
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title={r.name} eyebrow={t.kinds[r.kind]} back={back} actions={r.status !== "active" ? <Badge tone="warning">{t.statuses[r.status]}</Badge> : undefined} />
      <section className="fin-card" aria-label={t.amount}>
        <p className="fin-big">
          <Money value={r.expected_amount} estimated={r.is_estimate} />
        </p>
        <p className="muted">
          {dict.fin.frequencies[r.frequency] ?? r.frequency}
          {r.is_estimate ? ` · ${t.estimatedTag}` : ""}
        </p>
      </section>

      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      {r.status !== "cancelled" && (
        <div className="actions">
          {r.status === "active" && (
            <button type="button" className="button button--ghost" disabled={submit.pending} onClick={() => void setStatus("paused")}>
              {t.pause}
            </button>
          )}
          {r.status === "paused" && (
            <button type="button" className="button button--primary" disabled={submit.pending} onClick={() => void setStatus("active")}>
              {t.resume}
            </button>
          )}
          {!confirmCancel ? (
            <button type="button" className="button button--ghost" onClick={() => setConfirmCancel(true)}>
              {t.cancel}
            </button>
          ) : (
            <>
              <button type="button" className="button button--accent" disabled={submit.pending} onClick={() => void setStatus("cancelled")}>
                {t.confirmCancel}
              </button>
              <button type="button" className="button button--ghost" onClick={() => setConfirmCancel(false)}>
                {dict.common.cancel}
              </button>
            </>
          )}
        </div>
      )}
      {confirmCancel && <p className="hint">{t.cancelHint}</p>}

      <Section title={t.nextDates}>
        {r.next_dates.length === 0 ? (
          <p className="muted">{t.noDates}</p>
        ) : (
          <ul>
            {r.next_dates.map((date) => (
              <li key={date}>{formatDate(date)}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t.thisMonth}>
        {occurrences.loading && !occurrences.data && <Loading />}
        {occurrences.failure && <ErrorState message={dict.fin.errors.generic} onRetry={occurrences.reload} />}
        {occurrences.data && occurrences.data.results.length === 0 && <p className="muted">{t.noOccurrences}</p>}
        {occurrences.data && occurrences.data.results.length > 0 && <OccurrenceList items={occurrences.data.results} onChanged={occurrences.reload} />}
      </Section>

      <Section
        title={dict.fin.terms.pausesTitle + " · " + dict.fin.terms.windowsTitle}
        aside={
          r.status !== "cancelled" ? (
            <button type="button" className="button button--ghost" onClick={() => setEditing(true)}>
              {dict.fin.terms.editConditions}
            </button>
          ) : undefined
        }
      >
        {saved && (
          <Banner tone="positive">
            <p>{dict.fin.terms.conditionsSaved}</p>
          </Banner>
        )}
        <DefinitionList
          rows={[
            ...((r.months ?? []).length > 0 ? [{ label: dict.fin.terms.monthsTitle, value: (r.months ?? []).map((m) => dict.fin.months[m - 1]).join(", ") }] : []),
            { label: dict.fin.terms.pausesTitle, value: pauseText(r, dict.fin.months, dict.fin.terms.noPauses) },
            { label: dict.fin.terms.windowsTitle, value: termsSummary(r, { ...dict.fin.terms, lateKinds: dict.fin.terms.lateKinds }).join(" · ") },
          ]}
        />
      </Section>
      <Modal open={editing} title={dict.fin.terms.editConditions} onClose={() => setEditing(false)}>
        <ConditionsEditor
          recurrence={r}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setSaved(true);
            recurrence.reload();
            occurrences.reload();
          }}
        />
      </Modal>

      <Section title={t.data}>
        <DefinitionList
          rows={[
            { label: t.startDate, value: formatDate(r.start_date) },
            ...(r.end_date ? [{ label: t.endDate, value: formatDate(r.end_date) }] : []),
            { label: t.autoConfirm, value: r.auto_confirm ? dict.fin.common.yes : dict.fin.common.no },
            ...(r.provider ? [{ label: t.provider, value: r.provider }] : []),
            ...(r.renewal_date ? [{ label: t.renewalDate, value: formatDate(r.renewal_date) }] : []),
          ]}
        />
      </Section>
    </div>
  );
}
