"use client";

import { useState } from "react";
import { api } from "@/api";
import { useI18n } from "@/i18n/provider";
import { trashApi, type Deletion } from "../../../../core/trash";
import { fill } from "../helpers";
import { useResource, useSubmit } from "../hooks";
import { Banner, Empty, ErrorState, Loading, ScreenHeader } from "../kit";
import { ReadOnlyBanner } from "../../household/notices";
import { useCanWrite } from "../../household/scope-store";
import { affectedLines, daysLeftText, deletedByText } from "./logic";

const trash = trashApi(api);

/** `/configuracion/papelera`: lo eliminado que aún se puede restaurar (30 días), con los días que quedan y «Restaurar». */
export function TrashScreen() {
  const { dict } = useI18n();
  const t = dict.fin.trash;
  const list = useResource<Deletion[]>("/deletions");
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["config-papelera"]} eyebrow={dict.nav.sections.config} />
      <ReadOnlyBanner />
      <p className="muted">{t.intro}</p>
      {note && <p role="status">{note}</p>}
      {list.loading && !list.data && <Loading />}
      {list.failure && <ErrorState message={dict.fin.errors.generic} onRetry={list.reload} />}
      {list.data && list.data.length === 0 && <Empty title={t.emptyTitle} body={t.emptyBody} icon="trash" />}
      {list.data && list.data.length > 0 && (
        <ul className="fin-list" aria-label={t.title}>
          {list.data.map((row) => (
            <TrashRow
              key={row.id}
              row={row}
              onRestored={() => {
                setNote(t.restored);
                list.reload();
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TrashRow({ row, onRestored }: { row: Deletion; onRestored: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.trash;
  const canWrite = useCanWrite();
  const submit = useSubmit();
  const also = affectedLines(row, t.affected);
  async function restore() {
    const result = await submit.run({ restore: row.id }, () => trash.restore(row.id, { locale }));
    if (result.ok) onRestored();
  }
  return (
    <li className="fin-row">
      <div className="fin-row__main">
        <p className="title-s">{row.label || t.kinds[row.kind] || row.kind}</p>
        <p className="muted">{t.kinds[row.kind] ?? row.kind}</p>
        <p className="muted">{deletedByText(row, t)}</p>
        <p className="muted">{daysLeftText(row, t)}</p>
        {also.length > 0 && <p className="muted">{fill(t.alsoFell, { list: also.join(", ") })}</p>}
        {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      </div>
      {canWrite && (
        <button type="button" className="button button--ghost" disabled={submit.pending} aria-label={`${t.restore}: ${row.label}`} onClick={() => void restore()}>
          {submit.pending ? t.restoring : t.restore}
        </button>
      )}
    </li>
  );
}
