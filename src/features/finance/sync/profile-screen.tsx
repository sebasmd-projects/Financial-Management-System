"use client";

import { useEffect, useState } from "react";
import { api } from "@/api";
import { formatDate } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { useResource, useSubmit } from "../hooks";
import { Banner, Checkbox, ErrorState, FormActions, Loading, ScreenHeader, Section, TextField } from "../kit";
import type { SyncSettings } from "../../../../core/sync";
import { EraseSection } from "../erase/erase-section";
import { idNumberApi, parseIdNumber } from "./id-number";

const idNumber = idNumberApi(api);

/**
 * `/perfil` (Perfil y seguridad): «Guardar mi cédula para abrir extractos PDF» (propietario, 2026-11-14). Por defecto el FMS la pide cada vez; si la
 * guardas se cifra con tu llave y el lector de PDF la prueba solo. Guardarla, borrarla y verla piden reautenticación (el cliente abre el aviso y
 * repite la petición). La cédula vive aquí solo mientras la escribes o la muestras: nunca en el almacenamiento del navegador ni en una dirección web.
 */
export function ProfileScreen() {
  const { dict } = useI18n();
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens.perfil} />
      <DocumentSetting />
      <EraseSection />
    </div>
  );
}

function DocumentSetting() {
  const { dict, locale } = useI18n();
  const t = dict.fin.sync.doc;
  const settings = useResource<SyncSettings>("/sync/settings");
  const save = useSubmit();
  const remove = useSubmit();
  const reveal = useSubmit();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const data = settings.data;
  const saved = data?.document_saved === true;

  // Lo escrito o mostrado se borra al salir de la pantalla.
  useEffect(
    () => () => {
      setValue("");
      setShown(null);
    },
    [],
  );

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    const document = parseIdNumber(value);
    if (document === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const result = await save.run({ save: "document" }, () => idNumber.save(document, { locale }));
    if (result.ok) {
      setValue("");
      setShown(null);
      setEditing(false);
      setNote(t.savedOk);
      settings.reload();
    }
  }
  async function onClear() {
    const result = await remove.run({ clear: "document" }, () => idNumber.clear({ locale }));
    if (result.ok) {
      setShown(null);
      setEditing(false);
      setNote(t.clearedOk);
      settings.reload();
    }
  }
  async function onReveal() {
    const result = await reveal.run({ reveal: "document" }, () => idNumber.reveal({ locale }));
    if (result.ok) setShown(result.data.document);
  }
  function toggle(on: boolean) {
    setNote(null);
    if (on) setEditing(true);
    else if (saved) void onClear();
    else {
      setEditing(false);
      setValue("");
    }
  }

  return (
    <Section title={t.title}>
      <p className="muted">{t.intro}</p>
      {settings.loading && !data && <Loading />}
      {settings.failure && <ErrorState message={t.loadError} onRetry={settings.reload} />}
      {data && (
        <>
          <Checkbox label={t.toggle} hint={t.toggleHint} checked={saved || editing} disabled={save.pending || remove.pending} onChange={toggle} />
          <p role="status" aria-live="polite">
            {note ?? ""}
          </p>
          <p className="muted">{saved ? (data.document_set_at ? fill(t.saved, { date: formatDate(data.document_set_at) }) : t.savedNoDate) : t.notSaved}</p>

          {saved && !editing && (
            <div className="actions">
              {shown === null ? (
                <button type="button" className="button button--ghost" disabled={reveal.pending} onClick={() => void onReveal()}>
                  {t.reveal}
                </button>
              ) : (
                <>
                  <p aria-live="polite">{fill(t.revealed, { value: shown })}</p>
                  <button type="button" className="button button--ghost" onClick={() => setShown(null)}>
                    {t.hide}
                  </button>
                </>
              )}
              <button type="button" className="button button--ghost" onClick={() => { setShown(null); setEditing(true); }}>
                {t.change}
              </button>
            </div>
          )}

          {editing && (
            <form className="fin-form" onSubmit={(event) => void onSave(event)} noValidate>
              <TextField label={t.field} hint={t.fieldHint} type="password" autoComplete="off" value={value} onChange={(v) => { setValue(v); setInvalid(false); }} maxLength={30} required error={invalid ? t.invalid : null} />
              {save.error && (
                <Banner tone="negative" live="assertive">
                  {save.error}
                </Banner>
              )}
              <FormActions>
                <button type="submit" className="button button--primary" disabled={save.pending}>
                  {save.pending ? t.saving : t.save}
                </button>
                <button type="button" className="button button--ghost" onClick={() => { setEditing(false); setValue(""); }}>
                  {t.cancel}
                </button>
              </FormActions>
            </form>
          )}
          {(reveal.error || remove.error) && (
            <Banner tone="negative" live="assertive">
              {reveal.error ?? remove.error}
            </Banner>
          )}
        </>
      )}
    </Section>
  );
}
