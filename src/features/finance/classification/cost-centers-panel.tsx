"use client";

import { useState } from "react";
import { api } from "@/api";
import type { CostCenterUsageResponse, Named } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { DrillLink } from "../drill-link";
import { fill } from "../helpers";
import { useAll, useResource, useSubmit } from "../hooks";
import { Badge, Banner, Checkbox, Empty, ErrorState, FormActions, Loading, Modal, Money, Section, TextField } from "../kit";
import { monthToDate } from "./logic";

/** Centros de costo (§3.15): alta, nombre, archivo, los predeterminados y lo gastado por centro en un rango. */
export function CostCentersPanel() {
  const { dict } = useI18n();
  const t = dict.fin.cls.centers;
  const centers = useAll<Named>(paths.costCenters());
  const [editing, setEditing] = useState<Named | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const defaults = useSubmit();

  async function createDefaults() {
    const result = await defaults.run({ defaults: true }, (key) => api.post(paths.costCenterDefaults(), undefined, { idempotencyKey: key }));
    if (result.ok) {
      setNotice(t.defaultsDone);
      centers.reload();
    }
  }
  return (
    <div className="fin-stack">
      <p className="muted">{t.intro}</p>
      <div className="actions">
        <button type="button" className="button button--primary" onClick={() => setEditing("new")}>
          <Icon name="plus" size={20} />
          {t.add}
        </button>
        <button type="button" className="button button--ghost" onClick={() => void createDefaults()} disabled={defaults.pending}>
          {t.defaults}
        </button>
      </div>
      <p className="hint">{t.defaultsHint}</p>
      {notice && <Banner tone="positive">{notice}</Banner>}
      {defaults.error && <Banner tone="negative" live="assertive">{defaults.error}</Banner>}
      {centers.loading && !centers.data && <Loading />}
      {centers.failure && <ErrorState message={dict.fin.errors.generic} onRetry={centers.reload} />}
      {centers.data && centers.items.length === 0 && <Empty icon="list" title={t.emptyTitle} body={t.emptyBody} />}
      {centers.items.length > 0 && (
        <ul className="fin-list">
          {centers.items.map((center) => (
            <li key={center.id} className="fin-row fin-row--static">
              <span className="fin-row__main">
                <span className="fin-row__title">{center.name}</span>
                {center.archived && <Badge>{t.archived}</Badge>}
              </span>
              <button type="button" className="button button--ghost" onClick={() => setEditing(center)}>
                {t.edit}
                <span className="visually-hidden"> {center.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Usage />
      <Modal open={editing !== null} title={editing === "new" || editing === null ? t.newTitle : t.editTitle} onClose={() => setEditing(null)}>
        {editing !== null && (
          <CenterForm
            center={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onDone={() => {
              setEditing(null);
              centers.reload();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function CenterForm({ center, onDone, onCancel }: { center: Named | null; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.cls.centers;
  const submit = useSubmit();
  const [name, setName] = useState(center?.name ?? "");
  const [archived, setArchived] = useState(center?.archived ?? false);
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim() === "") return;
    const result = center
      ? await submit.run({ id: center.id, name, archived }, (key) => api.patch(paths.costCenter(center.id), { name: name.trim(), archived }, { idempotencyKey: key, locale }))
      : await submit.run({ name }, (key) => api.post(roots.costCenters, { name: name.trim() }, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={t.name} value={name} onChange={setName} maxLength={80} required />
      {center && <Checkbox label={t.archiveLabel} checked={archived} onChange={setArchived} />}
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || name.trim() === ""}>
          {submit.pending ? dict.fin.common.saving : dict.fin.common.save}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

/** Lo gastado por centro en un rango (el libro lo atribuye; anular lo baja). Cada cifra abre sus movimientos. */
function Usage() {
  const { dict } = useI18n();
  const t = dict.fin.cls.centers;
  const [range, setRange] = useState(() => monthToDate(todayBogota()));
  const ok = range.from !== "" && range.to !== "" && range.from <= range.to;
  const usage = useResource<CostCenterUsageResponse>(ok ? paths.costCenterUsage(range) : null);
  return (
    <Section title={t.usageTitle}>
      <p className="muted">{t.usageIntro}</p>
      <div className="fin-grid-2">
        <TextField label={t.from} type="date" value={range.from} onChange={(from) => setRange((r) => ({ ...r, from }))} />
        <TextField label={t.to} type="date" value={range.to} onChange={(to) => setRange((r) => ({ ...r, to }))} />
      </div>
      {usage.loading && !usage.data && <Loading />}
      {usage.failure && <ErrorState message={dict.fin.errors.generic} onRetry={usage.reload} />}
      {usage.data && usage.data.rows.length === 0 && <p className="muted">{t.usageEmpty}</p>}
      {usage.data && usage.data.rows.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">{t.tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{t.centerCol}</th>
                <th scope="col" className="table__num">{t.spent}</th>
                <th scope="col"><span className="visually-hidden">{t.viewMovements}</span></th>
              </tr>
            </thead>
            <tbody>
              {usage.data.rows.map((row) => (
                <tr key={row.id ?? "none"}>
                  <th scope="row">
                    {row.name ?? t.none}
                    <span className="muted"> · {fill(t.movements, { count: String(row.movements) })}</span>
                  </th>
                  <td className="table__num"><Money value={row.spent} /></td>
                  <td>
                    {row.id && (
                      <DrillLink filter={{ cost_center: row.id, from: usage.data!.first, to: usage.data!.last }} className="button button--ghost">
                        {t.viewMovements}
                      </DrillLink>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{t.spent}</th>
                <td className="table__num"><Money value={usage.data.total} /></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Section>
  );
}
