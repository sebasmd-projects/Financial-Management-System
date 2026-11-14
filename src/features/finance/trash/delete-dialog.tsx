"use client";

import { useEffect, useState } from "react";
import { api } from "@/api";
import { saveBlob } from "@/api/download";
import { errorText } from "@/api/errors";
import { todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { exportChoices, exportFileName, hasReconciled, isSimple, reopenReason, shouldRefetchPreview, trashApi, type DeletionKind, type DeletionPreview, type ExportFormat } from "../../../../core/trash";
import { fill } from "../helpers";
import { useResource, useSubmit } from "../hooks";
import { Banner, ErrorState, FormActions, Loading, Modal, TextField } from "../kit";
import { useScope } from "../../household/scope-store";
import { affectedLines } from "./logic";

const trash = trashApi(api);

/**
 * «Eliminar» con papelera (propietario, 2026-11-14). Antes de confirmar, el servidor dice qué se verá afectado: los productos relacionados, cuántos
 * movimientos, qué conciliaciones quedarían descuadradas (con «Reabrir la conciliación», opcional) y, en una cuenta, tarjeta, crédito o deuda con
 * movimientos, «Exportar antes». Confirmar manda el `digest` de lo que se vio. Nada de montos.
 */
export function DeleteDialog({ open, kind, id, name, onClose, onDone }: { open: boolean; kind: DeletionKind; id: string; name: string; onClose: () => void; onDone: () => void }) {
  const { dict } = useI18n();
  return (
    <Modal open={open} title={dict.fin.trash.dialog.title.replace("{name}", name)} onClose={onClose}>
      <DeleteBody kind={kind} id={id} onClose={onClose} onDone={onDone} />
    </Modal>
  );
}

function DeleteBody({ kind, id, onClose, onDone }: { kind: DeletionKind; id: string; onClose: () => void; onDone: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.trash;
  const preview = useResource<DeletionPreview>(`/deletions/preview?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`);
  const del = useSubmit();
  const [done, setDone] = useState(false);
  // Lo que caería cambió entre la vista previa y la confirmación: se vuelve a pedir y se avisa (nunca se elimina lo que no se vio).
  const stale = del.errorCode !== null && shouldRefetchPreview(del.errorCode);
  const reloadPreview = preview.reload;
  useEffect(() => {
    if (stale) reloadPreview();
  }, [stale, reloadPreview]);

  async function confirm() {
    const p = preview.data;
    const result = await del.run({ kind, id, digest: p?.digest ?? null }, (key) => trash.remove(kind, id, p, key, { locale }));
    if (result.ok) {
      setDone(true);
      onDone();
    }
  }

  if (preview.loading && !preview.data) return <Loading label={t.dialog.loading} />;
  if (preview.failure || !preview.data) return <ErrorState message={errorText(preview.failure ?? { ok: false, status: 0, code: "network", data: undefined }, dict.fin.errors) || t.dialog.loadFailed} onRetry={preview.reload} />;
  const p = preview.data;
  const lines = affectedLines(p, t.affected);
  const simple = isSimple(p);
  return (
    <div className="fin-form">
      <p>{t.dialog.intro}</p>
      {stale && <Banner tone="warning">{t.dialog.stale}</Banner>}
      {simple ? (
        <p className="muted">{t.dialog.simple}</p>
      ) : (
        lines.length > 0 && (
          <section aria-label={t.dialog.affectedTitle}>
            <h3 className="title-s">{t.dialog.affectedTitle}</h3>
            <ul className="fin-list">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <Items preview={p} />
          </section>
        )
      )}
      {p.returns_to.length > 0 && <p className="muted">{fill(t.dialog.returnsTo, { list: p.returns_to.map((a) => a.label).join(", ") })}</p>}
      {hasReconciled(p) && <ReconciledNotice preview={p} onReopened={preview.reload} />}
      <ExportOffer kind={kind} id={id} preview={p} />
      {del.error && !stale && <Banner tone="negative" live="assertive">{del.error}</Banner>}
      {done && (
        <p role="status" className="muted">
          {t.dialog.deleted}
        </p>
      )}
      <FormActions>
        <button type="button" className="button button--danger" disabled={del.pending || done} onClick={() => void confirm()}>
          {del.pending ? t.dialog.working : simple ? t.dialog.confirm : t.dialog.confirmAll}
        </button>
        <button type="button" className="button button--ghost" onClick={onClose}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </div>
  );
}

/** Los nombres de los productos que caen (hasta 10 por clase), para que la persona los reconozca. */
function Items({ preview }: { preview: DeletionPreview }) {
  const { dict } = useI18n();
  const entries = Object.entries(preview.items).filter(([, rows]) => rows.length > 0);
  if (entries.length === 0) return null;
  return (
    <ul className="fin-list muted">
      {entries.map(([bucket, rows]) => {
        const total = preview.affected[bucket] ?? rows.length;
        const more = total - rows.length;
        return (
          <li key={bucket}>
            {rows.map((r) => r.label).join(", ")}
            {more > 0 ? ` ${fill(dict.fin.trash.dialog.moreItems, { n: String(more) })}` : ""}
          </li>
        );
      })}
    </ul>
  );
}

/** Aviso de lo conciliado. Reabrir la conciliación es opcional; sin hacerlo, queda «descuadrada». Solo en el espacio personal. */
function ReconciledNotice({ preview, onReopened }: { preview: DeletionPreview; onReopened: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.trash.reconciled;
  const scope = useScope();
  const submit = useSubmit();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const valid = reopenReason(reason);
  const personal = scope.kind !== "household";

  async function reopen(reconciliationId: string) {
    if (valid === null) return;
    const result = await submit.run({ reopen: reconciliationId, reason: valid }, () => trash.reopenReconciliation(reconciliationId, valid, { locale }));
    if (result.ok) {
      setNote(t.reopened);
      onReopened();
    }
  }
  return (
    <section className="fin-card" aria-label={t.title}>
      <h3 className="title-s">{t.title}</h3>
      <p>{fill(t.body, { n: String(preview.reconciled.entries) })}</p>
      {personal ? (
        <>
          <TextField label={t.reason} hint={t.reasonHint} value={reason} onChange={setReason} maxLength={200} />
          {preview.reconciled.reconciliations.map((r) => (
            <button key={r.id} type="button" className="button button--ghost" disabled={submit.pending || valid === null} onClick={() => void reopen(r.id)}>
              {submit.pending ? t.reopening : t.reopen}
            </button>
          ))}
        </>
      ) : (
        <p className="muted">{t.personalOnly}</p>
      )}
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      {note && <p role="status">{note}</p>}
    </section>
  );
}

/** «Exportar antes»: en una cuenta con movimientos, el CSV que el importador vuelve a leer; en el resto, JSON. El archivo no se guarda en ningún lado. */
function ExportOffer({ kind, id, preview }: { kind: DeletionKind; id: string; preview: DeletionPreview }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.trash.export;
  const choice = exportChoices(preview);
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (!choice.available) return null;

  async function download(format: ExportFormat) {
    setState("working");
    setError(null);
    const result = await trash.exportFile(kind, id, format, { locale });
    if (!result.ok) {
      setError(errorText(result, dict.fin.errors));
      setState("idle");
      return;
    }
    saveBlob(result.data, exportFileName(kind, format, todayBogota()));
    setState("done");
  }
  return (
    <section className="fin-card" aria-label={t.title}>
      <h3 className="title-s">{t.title}</h3>
      <p>{fill(t.body, { n: String(preview.export.count) })}</p>
      <div className="actions">
        {choice.formats.map((format) => (
          <button key={format} type="button" className={`button ${format === choice.preferred ? "button--primary" : "button--ghost"}`} disabled={state === "working"} onClick={() => void download(format)}>
            {state === "working" ? t.exporting : format === "csv" ? t.csv : t.json}
          </button>
        ))}
      </div>
      {error && <Banner tone="negative" live="assertive">{error}</Banner>}
      {state === "done" && <p role="status">{t.done}</p>}
    </section>
  );
}
