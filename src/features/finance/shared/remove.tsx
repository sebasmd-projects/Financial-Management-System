"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { fill } from "../helpers";
import { DeleteDialog } from "../trash/delete-dialog";
import type { DeletionKind } from "../../../../core/trash";

/**
 * «Eliminar» (propietario, 2026-11-14): el diálogo con vista previa de lo que se verá afectado, «Exportar antes» y la conciliación; lo elegido va a
 * la Papelera 30 días. Ver `trash/delete-dialog.tsx`. Se queda con este nombre para las pantallas que ya lo usaban.
 */
export function RemoveDialog({ open, kind, id, name, onClose, onDone }: { open: boolean; kind: DeletionKind; id: string; name: string; onClose: () => void; onDone: () => void }) {
  return <DeleteDialog open={open} kind={kind} id={id} name={name} onClose={onClose} onDone={onDone} />;
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
