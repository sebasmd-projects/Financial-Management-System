"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { MeResponse } from "@/api/types";
import { locales } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { alternatePath, fmsHref, PROFILE_ROUTE } from "@/nav/routes";
import { Icon } from "@/ui/icons";

/**
 * El menú de la persona: su perfil y el CAMBIO DE IDIOMA, que lleva a la página equivalente en el otro idioma
 * (`/es/finanzas/pagos/fijos` ⇄ `/en/finance/payments/fixed`). Se abre con el botón, se cierra con Esc, con un
 * toque fuera o al elegir algo; devuelve el foco al botón.
 */
export function UserMenu({ me }: { me: MeResponse }) {
  const { dict, locale } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const other = locales.find((l) => l !== locale)!;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div className="menu" ref={root}>
      <button ref={button} type="button" className="icon-button" aria-label={dict.userMenu.label} aria-haspopup="true" aria-expanded={open} aria-controls="user-menu" onClick={() => setOpen(!open)}>
        <Icon name="user" />
      </button>
      {open && (
        <div id="user-menu" className="menu__panel" role="group" aria-label={dict.userMenu.label}>
          <p className="menu__who">
            <span className="caption">{dict.userMenu.signedInAs}</span>
            <strong>{me.user.display_name}</strong>
          </p>
          <Link href={fmsHref(locale, PROFILE_ROUTE)} className="menu__item" onClick={() => setOpen(false)}>
            <Icon name="shield" size={20} />
            {dict.nav.profile}
          </Link>
          {/* Una navegación completa (no `next/link`): cambia `<html lang>` y el diccionario del servidor. */}
          <a className="menu__item" href={alternatePath(pathname, other)} hrefLang={other} lang={other} title={dict.language.switchLabel}>
            <Icon name="contrast" size={20} />
            <span>
              {dict.language.label}: {dict.language.otherName}
            </span>
          </a>
        </div>
      )}
    </div>
  );
}
