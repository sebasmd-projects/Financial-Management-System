"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { PROFILE_HREF } from "@/nav/routes";
import { searchScreens } from "@/nav/search";
import { Icon } from "@/ui/icons";

/**
 * La hoja «Más» (diseño §1.2) y, en pantallas grandes, el buscador de pantallas (`Ctrl/⌘+K`): un <dialog> modal nativo,
 * que ya atrapa el foco, cierra con Esc y devuelve el foco a quien lo abrió. Lista las 8 secciones con sus subelementos.
 */
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dict } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const hits = searchScreens(query, dict);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="more-title"
      onClose={() => {
        setQuery("");
        onClose();
      }}
      onClick={(event) => {
        // Un toque en el velo (el propio <dialog>, fuera de su contenido) lo cierra.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="sheet__header">
        <h2 id="more-title" className="title-m">
          {dict.nav.moreTitle}
        </h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={dict.common.close}>
          <Icon name="x" />
        </button>
      </div>
      <div className="sheet__search">
        <label className="visually-hidden" htmlFor="more-search">
          {dict.nav.searchLabel}
        </label>
        <Icon name="search" size={20} />
        <input id="more-search" type="search" autoComplete="off" value={query} placeholder={dict.nav.searchPlaceholder} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <nav aria-label={dict.nav.moreTitle} className="sheet__list">
        {hits.length === 0 && <p className="muted">{dict.nav.searchEmpty}</p>}
        {hits.map(({ section, items }) => (
          <section key={section.id} className="sheet__group">
            <h3 className="sheet__section">
              <Link href={section.href} onClick={onClose} className="sheet__row">
                <Icon name={section.icon} size={20} />
                <span>{dict.nav.sections[section.id]}</span>
                <Icon name="chevron-right" size={20} />
              </Link>
            </h3>
            {items.length > 0 && (
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} onClick={onClose} className="sheet__row sheet__row--item">
                      {dict.nav.items[item.id]}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </nav>
      <div className="sheet__footer">
        <Link href={PROFILE_HREF} onClick={onClose} className="sheet__row">
          <Icon name="user" size={20} />
          <span>{dict.nav.profile}</span>
          <Icon name="chevron-right" size={20} />
        </Link>
      </div>
    </dialog>
  );
}
