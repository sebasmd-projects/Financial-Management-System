"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/api";
import type { NotificationList } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import type { MeResponse } from "@/api/types";
import { fmsHref, NEW_MOVEMENT_ROUTE, NOTIFICATIONS_ROUTE } from "@/nav/routes";
import { ScopeSwitcher } from "@/features/household/scope-switcher";
import { UserMenu } from "./user-menu";
import { Icon } from "@/ui/icons";
import { ThemeToggle } from "@/ui/theme/theme-toggle";

/** Cuántos avisos sin leer hay; se vuelve a preguntar al cambiar de pantalla. Solo el número: nada de sus textos se queda aquí. */
function useUnreadCount(pathname: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api.get<NotificationList>(paths.notifications({ unread: true }), { signal: controller.signal, redirectOn401: false }).then((result) => {
      if (!controller.signal.aborted && result.ok) setCount(result.data.unread);
    });
    return () => controller.abort();
  }, [pathname]);
  return count;
}

/** Cabecera: marca, «+ Movimiento (N)» y buscador en pantallas grandes; campana, tema y perfil siempre (diseño §1.1, §1.3). */
export function TopBar({ onSearch, me }: { onSearch: () => void; me: MeResponse }) {
  const { dict, locale } = useI18n();
  const unread = useUnreadCount(usePathname());
  return (
    <header className="topbar">
      <span className="topbar__brand">{dict.appName}</span>
      <ScopeSwitcher />
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
        <Link href={fmsHref(locale, NOTIFICATIONS_ROUTE)} className="icon-button topbar__bell" aria-label={unread > 0 ? dict.fin.notif.bellUnread.replace("{n}", String(unread)) : dict.nav.notifications}>
          <Icon name="bell" />
          {unread > 0 && (
            <span className="topbar__count" aria-hidden="true">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
<UserMenu me={me} />
      </div>
    </header>
  );
}
