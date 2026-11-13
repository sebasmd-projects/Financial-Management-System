"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/api";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { fill } from "../helpers";
import { useSubmit } from "../hooks";
import { Banner, FormActions, Modal } from "../kit";

/**
 * «Eliminar» con las reglas del libro: pide confirmación, llama `DELETE` y, si el objeto tiene historia (`409 has_history`), no lo
 * borra: lo explica y ofrece «Archivar / Cerrar» (`PATCH status=closed`, que exige saldo cero). Nunca se borran asientos.
 */
export function RemoveDialog({ open, name, deletePath, closePath, onClose, onDone }: { open: boolean; name: string; deletePath: string; closePath?: string; onClose: () => void; onDone: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.own.remove;
  const del = useSubmit();
  const close = useSubmit();
  const [blocked, setBlocked] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function remove() {
    const result = await del.run({ delete: deletePath }, () => api.delete<undefined>(deletePath, { locale }));
    if (result.ok) {
      setNote(t.deleted);
      onDone();
    } else if (del.errorCode === "has_history" || blocked) setBlocked(true);
  }
  async function archive() {
    if (!closePath) return;
    const body = { status: "closed" };
    const result = await close.run(body, (key) => api.patch<unknown>(closePath, body, { idempotencyKey: key, locale }));
    if (result.ok) {
      setNote(t.closed);
      onDone();
    }
  }
  const hasHistory = blocked || del.errorCode === "has_history";
  return (
    <Modal open={open} title={hasHistory ? t.blockedTitle : fill(t.title, { name })} onClose={onClose}>
      {hasHistory ? (
        <div className="fin-form">
          <p>{t.blockedBody}</p>
          {closePath && <p className="hint">{t.closeBody}</p>}
          {close.error && <Banner tone="negative" live="assertive">{close.error}</Banner>}
          <FormActions>
            {closePath && (
              <button type="button" className="button button--primary" disabled={close.pending} onClick={() => void archive()}>
                {close.pending ? t.closing : dict.fin.own.close}
              </button>
            )}
            <button type="button" className="button button--ghost" onClick={onClose}>
              {dict.common.cancel}
            </button>
          </FormActions>
        </div>
      ) : (
        <div className="fin-form">
          <p>{t.body}</p>
          {del.error && <Banner tone="negative" live="assertive">{del.error}</Banner>}
          {note && <p role="status">{note}</p>}
          <FormActions>
            <button type="button" className="button button--danger" disabled={del.pending} onClick={() => void remove()}>
              {del.pending ? t.working : t.confirm}
            </button>
            <button type="button" className="button button--ghost" onClick={onClose}>
              {dict.common.cancel}
            </button>
          </FormActions>
        </div>
      )}
    </Modal>
  );
}

/** El menú «⋮» de una fila de lista (en el móvil, las acciones no caben en la fila): Editar y Eliminar. Un botón hermano del enlace de la fila. */
export function RowMenu({ name, editHref, onDelete }: { name: string; editHref: string; onDelete: () => void }) {
  const { dict } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="row-menu" ref={root}>
      <button type="button" className="icon-button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={fill(dict.fin.own.moreActions, { name })} onClick={() => setOpen((v) => !v)}>
        <Icon name="more" size={20} />
      </button>
      {open && (
        <ul id={id} role="menu" className="row-menu__list">
          <li role="none">
            <Link role="menuitem" href={editHref} onClick={() => setOpen(false)}>
              {dict.fin.own.edit}
            </Link>
          </li>
          <li role="none">
            <button type="button" role="menuitem" className="row-menu__danger" onClick={() => { setOpen(false); onDelete(); }}>
              {dict.fin.own.delete}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
