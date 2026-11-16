"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import { useI18n } from "@/i18n/provider";
import { useSessionStore } from "@/features/session/provider";
import { fmsHref } from "@/nav/routes";
import { canErase, countRows, eraseApi, hasAnything, householdGroups, phraseFor, sharedAccountsLeft, type ErasePreview } from "../../../../core/erase";
import { fill } from "../helpers";
import { useResource, useSubmit } from "../hooks";
import { Banner, ErrorState, FormActions, Loading, Modal, Section, TextField } from "../kit";
import { PERSONAL_EXPORT } from "../../../../core/export";
import { useFinanceExport } from "../export/use-export";

const client = eraseApi(api);

/**
 * La zona de peligro de `/perfil`: «Borrar todos mis datos de Finanzas» (propietario, 2026-11-15). Inmediato e irreversible; la cuenta del sitio se
 * queda. El diálogo enseña los recuentos del servidor, avisa de las copias de seguridad, ofrece exportar antes y pide la frase escrita. Al confirmar, el
 * cliente abre el aviso de reautenticación (`withReauth`) y repite la petición con la misma `Idempotency-Key`. Tras borrar se vuelve a leer `/me`: la
 * compuerta ve que Finanzas ya no está activa y muestra la activación. Nada de lo que se ve aquí se guarda en el navegador.
 */
export function EraseSection() {
  const { dict } = useI18n();
  const t = dict.fin.erase;
  const [open, setOpen] = useState(false);
  return (
    <Section title={t.zoneTitle}>
      <h3 className="title-s">{t.title}</h3>
      <p className="muted">{t.intro}</p>
      <div className="actions">
        <button type="button" className="button button--danger" onClick={() => setOpen(true)}>
          {t.open}
        </button>
      </div>
      {open && <EraseDialog onClose={() => setOpen(false)} />}
    </Section>
  );
}

function EraseDialog({ onClose }: { onClose: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.erase;
  const store = useSessionStore();
  const preview = useResource<ErasePreview>("/me/erase/preview", { unscoped: true });
  const submit = useSubmit();
  const [typed, setTyped] = useState("");
  // «Exportar primero» es el mismo «Exportar todos mis datos de Finanzas» (ZIP): al estar listo se baja solo.
  const exportAll = useFinanceExport(PERSONAL_EXPORT, { auto: true, resume: false });
  const exporting = exportAll.phase === "working";
  const data = preview.data;
  const phrase = phraseFor(locale, data);
  const ready = canErase(data, typed, locale);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    const result = await submit.run({ erase: true }, (key) => client.erase(typed, key, { locale }));
    // La compuerta lee `/me`: Finanzas ya no está activa y cambia a la activación (este diálogo se desmonta).
    if (result.ok) await store.load({ quiet: true });
  }

  return (
    <Modal open title={t.dialogTitle} onClose={onClose}>
      <form className="fin-form" onSubmit={(event) => void onSubmit(event)} noValidate>
        {preview.loading && !data && <Loading label={t.loading} />}
        {preview.failure && !data && <ErrorState message={t.loadError} onRetry={preview.reload} />}
        {data && (
          <>
            <Banner tone="warning">{t.irreversible}</Banner>
            <Counts preview={data} />
            <Households preview={data} />
            {hasAnything(data) && data.export_recommended && (
              <div>
                <h3 className="title-s">{t.exportTitle}</h3>
                <p className="muted">{t.exportBody}</p>
                <button type="button" className="button button--ghost" disabled={exporting} onClick={() => void exportAll.start()}>
                  {exporting ? t.exporting : t.exportButton}
                </button>
                <p role="status" aria-live="polite">
                  {exportAll.phase === "done" ? t.exported : exportAll.phase === "failed" ? (exportAll.error ?? t.exportFailed) : ""}
                </p>
              </div>
            )}
            <div>
              <h3 className="title-s">{t.backupTitle}</h3>
              <p className="muted">{t.backupBody}</p>
            </div>
            {!data.blocked && <TextField label={fill(t.phraseLabel, { phrase })} hint={t.phraseHint} value={typed} onChange={setTyped} autoComplete="off" maxLength={64} required />}
          </>
        )}
        {submit.error && (
          <Banner tone="negative" live="assertive">
            {submit.error}
          </Banner>
        )}
        <FormActions>
          <button type="submit" className="button button--danger" disabled={!ready || submit.pending}>
            {submit.pending ? t.working : t.confirm}
          </button>
          <button type="button" className="button button--ghost" onClick={onClose}>
            {dict.common.cancel}
          </button>
        </FormActions>
      </form>
    </Modal>
  );
}

function Counts({ preview }: { preview: ErasePreview }) {
  const { dict } = useI18n();
  const t = dict.fin.erase;
  const rows = countRows(preview);
  if (!hasAnything(preview)) return <p className="muted">{t.nothing}</p>;
  return (
    <div>
      <p>{t.willDelete}</p>
      <ul>
        {rows.map((row) => (
          <li key={row.key}>
            {t.counts[row.key]}: {row.count}
          </li>
        ))}
        {preview.in_trash > 0 && <li>{fill(t.inTrash, { n: String(preview.in_trash) })}</li>}
      </ul>
    </div>
  );
}

function Households({ preview }: { preview: ErasePreview }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.erase;
  const groups = householdGroups(preview);
  return (
    <>
      {groups.leave.length > 0 && (
        <div>
          <h3 className="title-s">{t.leaveTitle}</h3>
          <ul>
            {groups.leave.map((h) => (
              <li key={h.id}>{h.name}</li>
            ))}
          </ul>
          <p className="muted">{fill(t.leaveBody, { n: String(sharedAccountsLeft(preview)) })}</p>
        </div>
      )}
      {groups.delete.length > 0 && (
        <div>
          <h3 className="title-s">{t.deleteTitle}</h3>
          <ul>
            {groups.delete.map((h) => (
              <li key={h.id}>{h.name}</li>
            ))}
          </ul>
          <p className="muted">{t.deleteBody}</p>
        </div>
      )}
      {groups.blocked.length > 0 && (
        <Banner tone="negative" live="assertive">
          <h3 className="title-s">{t.blockedTitle}</h3>
          <ul>
            {groups.blocked.map((h) => (
              <li key={h.id}>{h.name}</li>
            ))}
          </ul>
          <p>{t.blockedBody}</p>
          <Link href={fmsHref(locale, "hogares")}>{t.blockedLink}</Link>
        </Banner>
      )}
    </>
  );
}
