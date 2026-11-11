"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { NEW_MOVEMENT_HREF, NOTIFICATIONS_HREF, PROFILE_HREF } from "@/nav/routes";
import { Icon } from "@/ui/icons";
import { ThemeToggle } from "@/ui/theme/theme-toggle";

/** Cabecera: marca, «+ Movimiento (N)» y buscador en pantallas grandes; campana, tema y perfil siempre (diseño §1.1, §1.3). */
export function TopBar({ onSearch }: { onSearch: () => void }) {
  const { dict } = useI18n();
  return (
    <header className="topbar">
      <span className="topbar__brand">{dict.appName}</span>
      <div className="topbar__actions">
        <Link href={NEW_MOVEMENT_HREF} className="button button--accent topbar__new" aria-keyshortcuts="N">
          <Icon name="plus" size={20} />
          <span>{dict.nav.newMovement}</span>
          <kbd aria-hidden="true">N</kbd>
        </Link>
        <button type="button" className="icon-button topbar__search" onClick={onSearch} aria-label={dict.nav.searchLabel} aria-keyshortcuts="Control+K Meta+K">
          <Icon name="search" />
        </button>
        <ThemeToggle />
        <Link href={NOTIFICATIONS_HREF} className="icon-button" aria-label={dict.nav.notifications}>
          <Icon name="bell" />
        </Link>
        <Link href={PROFILE_HREF} className="icon-button" aria-label={dict.nav.profile}>
          <Icon name="user" />
        </Link>
      </div>
    </header>
  );
}
