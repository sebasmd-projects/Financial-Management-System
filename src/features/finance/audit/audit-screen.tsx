"use client";

import { useState } from "react";
import type { AuditEntry, AuditPage } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate, formatTime } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { useHref, useResource } from "../hooks";
import { Badge, Empty, ErrorState, Loading, Pager, ScreenHeader, SelectField, TextField } from "../kit";
import { AUDIT_ACTIONS, AUDIT_OBJECTS, datesProblem, EMPTY_FILTERS, entryChanges, filterParams, filtersActive, valueText, type AuditFilters } from "./logic";

/** `/configuracion/auditoria` (diseño §3.15, corte 2.8): cada cambio con el antes y el después de cada campo, y filtros. */
export function AuditScreen() {
  const { dict } = useI18n();
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["config-auditoria"]} eyebrow={dict.nav.sections.config} />
      <p className="muted">{dict.fin.audit.intro}</p>
      <AuditList />
    </div>
  );
}

/** `/movimientos/[id]/historial`: la auditoría de un solo movimiento. */
export function MovementHistory({ id }: { id: string }) {
  const { dict } = useI18n();
  const href = useHref();
  return (
    <div className="screen">
      <ScreenHeader title={dict.fin.audit.movementTitle} eyebrow={dict.screens.movimiento} back={{ href: href("movimiento", [id]), label: dict.fin.audit.movementBack }} />
      <AuditList fixed={{ object: "finance_moves.movement", object_id: id }} />
    </div>
  );
}

function AuditList({ fixed }: { fixed?: { object: string; object_id: string } }) {
  const { dict } = useI18n();
  const t = dict.fin.audit;
  const [draft, setDraft] = useState<AuditFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<AuditFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const bad = datesProblem(draft);
  const data = useResource<AuditPage>(paths.audit(filterParams(applied, fixed, page)));
  const set = (patch: Partial<AuditFilters>) => setDraft((current) => ({ ...current, ...patch }));

  function apply(event: React.FormEvent) {
    event.preventDefault();
    if (bad) return;
    setApplied(draft);
    setPage(1);
  }
  function clear() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }
  const entries = data.data?.entries ?? [];
  return (
    <div className="fin-stack">
      <form onSubmit={apply} className="fin-form audit-filters" aria-label={t.filters.title} noValidate>
        <div className="fin-grid-2">
          {!fixed && <SelectField label={t.filters.object} value={draft.object} onChange={(object) => set({ object })} placeholder={t.filters.all} options={AUDIT_OBJECTS.map((o) => ({ value: o, label: t.objects[o] ?? o }))} />}
          <SelectField label={t.filters.action} value={draft.action} onChange={(action) => set({ action })} placeholder={t.filters.all} options={AUDIT_ACTIONS.map((a) => ({ value: a, label: t.actionNames[a] }))} />
          <SelectField label={t.filters.by} value={draft.by} onChange={(by) => set({ by: by as AuditFilters["by"] })} placeholder={t.filters.all} options={[{ value: "me", label: t.filters.byMe }, { value: "admin", label: t.filters.byAdmin }]} />
          <TextField label={t.filters.field} hint={t.filters.fieldHint} value={draft.field} onChange={(field) => set({ field })} maxLength={60} />
          <TextField label={t.filters.from} type="date" value={draft.from} onChange={(from) => set({ from })} error={bad ? t.invalidDates : null} />
          <TextField label={t.filters.to} type="date" value={draft.to} onChange={(to) => set({ to })} />
        </div>
        <div className="actions">
          <button type="submit" className="button button--primary" disabled={bad}>
            {t.filters.title}
          </button>
          {(filtersActive(draft) || filtersActive(applied)) && (
            <button type="button" className="button button--ghost" onClick={clear}>
              {t.filters.clear}
            </button>
          )}
        </div>
      </form>

      {data.loading && !data.data && <Loading />}
      {data.failure && <ErrorState message={dict.fin.errors.generic} onRetry={data.reload} />}
      {data.data && entries.length === 0 && <Empty icon="list" title={filtersActive(applied) ? t.emptyFiltered : t.empty} />}
      {data.data && entries.length > 0 && (
        <>
          <p className="muted" aria-live="polite">{fill(t.count, { count: String(data.data.count) })}</p>
          <ol className="audit-list" aria-label={t.listLabel}>
            {entries.map((entry) => (
              <li key={entry.id}>
                <Entry entry={entry} />
              </li>
            ))}
          </ol>
          <Pager page={page} count={data.data.count} pageSize={data.data.page_size} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function Entry({ entry }: { entry: AuditEntry }) {
  const { dict } = useI18n();
  const t = dict.fin.audit;
  const changes = entryChanges(entry);
  const fieldName = (field: string) => t.fields[field] ?? field;
  return (
    <article className="audit-entry" aria-label={`${t.actions[entry.action] ?? entry.action} · ${t.objects[entry.object] ?? entry.object}`}>
      <header className="audit-entry__head">
        <p className="audit-entry__title">
          <strong>{t.actions[entry.action] ?? entry.action}</strong> {t.objects[entry.object] ?? entry.object}
        </p>
        <p className="muted">
          {fill(t.entry.when, { date: formatDate(entry.at), time: formatTime(entry.at) })} · <Badge tone={entry.by_me ? "neutral" : "warning"}>{entry.by_me ? t.entry.you : `${t.entry.admin}: ${entry.actor}`}</Badge>
        </p>
      </header>
      {changes.length === 0 ? (
        <p className="muted">{entry.changed_fields.length > 0 ? fill(t.entry.changed, { fields: entry.changed_fields.map(fieldName).join(", ") }) : t.entry.noDetail}</p>
      ) : (
        <div className="table-wrap">
          <table className="table audit-table">
            <caption className="visually-hidden">{t.entry.tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{t.entry.field}</th>
                <th scope="col">{t.entry.before}</th>
                <th scope="col">{t.entry.after}</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr key={change.field}>
                  <th scope="row">{fieldName(change.field)}</th>
                  <td className="audit-before">{valueText(change.before, t.entry.none)}</td>
                  <td className="audit-after">{valueText(change.after, t.entry.none)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
