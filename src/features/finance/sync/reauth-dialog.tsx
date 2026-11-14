"use client";

import { useState, useSyncExternalStore } from "react";
import { confirmReauthentication, reauth, type ReauthMode, type ReauthOutcome } from "@/api/reauth";
import { useI18n } from "@/i18n/provider";
import { Banner, FormActions, Modal, TextField } from "../kit";

/**
 * El aviso de reautenticación del navegador: se abre solo cuando una acción sensible responde `403 reauthentication_required` (crear, rotar o
 * borrar una conexión de correo, crear una regla que confirma sola, ver la cédula guardada). Contraseña o código del autenticador; lo escrito
 * vive solo aquí y se borra al cerrar. Confirmar repite la petición; cancelar la deja fallar.
 */
export function ReauthDialog() {
  const { dict } = useI18n();
  const open = useSyncExternalStore(reauth.subscribe, reauth.isOpen, () => false);
  return (
    <Modal open={open} title={dict.fin.sync.reauth.title} onClose={() => reauth.settle(false)}>
      <ReauthForm />
    </Modal>
  );
}

function ReauthForm() {
  const { dict } = useI18n();
  const t = dict.fin.sync.reauth;
  const [mode, setMode] = useState<ReauthMode>("password");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ReauthOutcome | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || value.trim() === "") return;
    setBusy(true);
    const outcome = await confirmReauthentication(mode, mode === "code" ? value.trim() : value);
    setBusy(false);
    if (outcome === "ok") {
      setValue("");
      reauth.settle(true);
    } else {
      setProblem(outcome);
    }
  }

  const message = problem === null ? null : problem === "wrong" ? t.wrong : problem === "too_many" ? t.tooMany : problem === "network" ? dict.fin.errors.network : t.error;
  return (
    <form className="fin-form" onSubmit={(event) => void submit(event)}>
      <p>{t.intro}</p>
      <TextField
        key={mode}
        label={mode === "password" ? t.password : t.code}
        type={mode === "password" ? "password" : "text"}
        inputMode={mode === "code" ? "numeric" : undefined}
        autoComplete={mode === "password" ? "current-password" : "one-time-code"}
        value={value}
        onChange={setValue}
        required
      />
      {message && (
        <Banner tone="negative" live="assertive">
          {message}
        </Banner>
      )}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={busy || value.trim() === ""}>
          {busy ? t.confirming : t.submit}
        </button>
        <button
          type="button"
          className="button button--ghost"
          onClick={() => {
            setMode(mode === "password" ? "code" : "password");
            setValue("");
            setProblem(null);
          }}
        >
          {mode === "password" ? t.useCode : t.usePassword}
        </button>
        <button type="button" className="button button--ghost" onClick={() => reauth.settle(false)}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}
