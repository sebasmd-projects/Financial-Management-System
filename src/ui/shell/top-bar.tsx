"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import type { MeResponse } from "@/api/types";
import { fmsHref, NEW_MOVEMENT_ROUTE, NOTIFICATIONS_ROUTE } from "@/nav/routes";
import { UserMenu } from "./user-menu";
import { Icon } from "@/ui/icons";
import { ThemeToggle } from "@/ui/theme/theme-toggle";

/** Cabecera: marca, «+ Movimiento (N)» y buscador en pantallas grandes; campana, tema y perfil siempre (diseño §1.1, §1.3). */
export function TopBar({ onSearch, me }: { onSearch: () => void; me: MeResponse }) {
  const { dict, locale } = useI18n();
  return (
    <header className="topbar">
      <span className="topbar__brand">{dict.appName}</span>
      <div className="topbar__actions">
        <Link href={fmsHref(locale, NEW_MOVEMENT_ROUTE)} className="button button--accent topbar__new" aria-keyshortcuts="N">
          <Icon name="plus" size={20} />
          <span>{dict.nav.newMovement}</span>
          <kbd aria-hidden="true">N</kbd>
        </Link>
        <button type="button" className="icon-button topbar__search" onClick={onSearch} aria-label={dict.nav.searchLabel} aria-keyshortcuts="Control+K Meta+K">
          <Icon name="search" />
        </button>
        <ThemeToggle />
        <Link href={fmsHref(locale, NOTIFICATIONS_ROUTE)} className="icon-button" aria-label={dict.nav.notifications}>
          <Icon name="bell" />
        </Link>
<UserMenu me={me} />
      </div>
    </header>
  );
}
