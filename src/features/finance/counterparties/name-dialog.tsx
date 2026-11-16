"use client";

import { useId, useState } from "react";
import { api } from "@/api";
import { errorText } from "@/api/errors";
import type { Counterparty, CounterpartyNamed, Movement, Page } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { useResource } from "../hooks";
import { Banner, FormActions, Modal, TextField } from "../kit";
import { takenName } from "./logic";

/** A qué se le pone nombre: una cuenta que viene de una importación (canal y valor) o un movimiento (el servidor lee la cuenta de su texto). */
export type NameTarget =
  | { kind: "account"; channel: string; value: string; accountText: string; nameHint?: string }
  | { kind: "movement"; movementId: string; initialName?: string };

type Conflict = { current: string; next: string };

/**
 * «Ponerle nombre»: pide un nombre y lo guarda. Si la cuenta ya tenía otro nombre, el servidor contesta `409 identifier_taken` con el nombre actual
 * y aquí se pregunta «¿Actualizar "anterior" → "nuevo"?» (renombrar) o «Crear otro» (la cuenta pasa a otra contraparte). Un nombre que ya existe
 * en otra contraparte simplemente se le agrega la cuenta.
 */
export function NameDialog({ open, target, onClose, onDone }: { open: boolean; target: NameTarget; onClose: () => void; onDone: (message: string) => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.cp;
  const listId = useId();
  const initial = target.kind === "account" ? (target.nameHint ?? "") : (target.initialName ?? "");
  const [name, setName] = useState(initial);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const parties = useResource<Page<Counterparty>>(open ? paths.counterparties({ page_size: 100 }) : null);

  async function save(onConflict?: "rename" | "move") {
    const wanted = name.trim();
    if (wanted === "" || pending) return;
    setPending(true);
    setError(null);
    try {
      const body =
        target.kind === "account"
          ? { name: wanted, channel: target.channel, value: target.value, ...(onConflict ? { on_conflict: onConflict } : {}) }
          : { name: wanted, ...(onConflict ? { on_conflict: onConflict } : {}) };
      const result =
        target.kind === "account"
          ? await api.post<CounterpartyNamed>(paths.counterpartyName(), body, { locale })
          : await api.post<Movement>(paths.movementCounterparty(target.movementId), body, { locale });
      if (result.ok) {
        const updated = target.kind === "account" ? ((result.data as CounterpartyNamed).updated ?? 0) : 0;
        setConflict(null);
        onDone(updated > 0 ? fill(t.savedHistory, { name: wanted, count: String(updated) }) : fill(t.saved, { name: wanted }));
        return;
      }
      const current = result.status === 409 && result.code === "identifier_taken" ? takenName(result.data) : null;
      if (current !== null) setConflict({ current, next: wanted });
      else setError(errorText(result, dict.fin.errors));
    } finally {
      setPending(false);
    }
  }

  const accountLine = target.kind === "account" ? fill(t.nameFor, { account: target.accountText }) : null;
  return (
    <Modal open={open} title={conflict ? t.conflictTitle : t.nameTitle} onClose={onClose}>
      {conflict ? (
        <div className="fin-form" data-testid="name-conflict">
          <p>{fill(t.conflictAsk, { old: conflict.current, new: conflict.next })}</p>
          <p className="hint">{fill(t.conflictHelp, { old: conflict.current, new: conflict.next })}</p>
          {error && <Banner tone="negative" live="assertive">{error}</Banner>}
          <FormActions>
            <button type="button" className="button button--primary" disabled={pending} onClick={() => void save("rename")}>
              {t.conflictRename}
            </button>
            <button type="button" className="button button--secondary" disabled={pending} onClick={() => void save("move")}>
              {t.conflictMove}
            </button>
            <button type="button" className="button button--ghost" onClick={() => setConflict(null)}>
              {dict.common.cancel}
            </button>
          </FormActions>
        </div>
      ) : (
        <form
          className="fin-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <p className="muted">{t.nameIntro}</p>
          {accountLine && <p className="tabular">{accountLine}</p>}
          <TextField label={t.nameField} hint={t.nameHint} value={name} onChange={setName} maxLength={80} required />
          {parties.data && parties.data.results.length > 0 && (
            <ul className="fin-chips" aria-label={t.nameSuggestions} id={listId}>
              {parties.data.results.slice(0, 8).map((party) => (
                <li key={party.id}>
                  <button type="button" className="chip" onClick={() => setName(party.name)}>
                    {party.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <Banner tone="negative" live="assertive">{error}</Banner>}
          <FormActions>
            <button type="submit" className="button button--primary" disabled={pending || name.trim() === ""}>
              {pending ? dict.fin.common.saving : t.save}
            </button>
            <button type="button" className="button button--ghost" onClick={onClose}>
              {dict.common.cancel}
            </button>
          </FormActions>
        </form>
      )}
    </Modal>
  );
}
