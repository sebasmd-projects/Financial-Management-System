"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { isSectionActive, NEW_MOVEMENT_HREF, SECTIONS } from "@/nav/routes";
import { Icon } from "@/ui/icons";

/** Barra inferior del teléfono (< 600 dp): Resumen, Movimientos, «+», Pagos, Más (diseño §1.2). */
export function BottomTabBar({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const { dict } = useI18n();
  const pathname = usePathname();
  const tab = (id: "resumen" | "movimientos" | "pagos") => {
    const section = SECTIONS.find((s) => s.id === id)!;
    const active = isSectionActive(section, pathname);
    return (
      <li>
        <Link href={section.href} className="tab" aria-current={active ? "page" : undefined}>
          <Icon name={section.icon} />
          <span>{dict.nav.tabs[id]}</span>
        </Link>
      </li>
    );
  };
  return (
    <nav className="tabbar" aria-label={dict.nav.mobile}>
      <ul>
        {tab("resumen")}
        {tab("movimientos")}
        <li className="tabbar__fab-cell">
          <Link href={NEW_MOVEMENT_HREF} className="fab" aria-label={dict.nav.tabs.nuevo}>
            <Icon name="plus" size={28} />
          </Link>
        </li>
        {tab("pagos")}
        <li>
          <button type="button" className="tab" onClick={onMore} aria-haspopup="dialog" aria-expanded={moreOpen}>
            <Icon name="grid" />
            <span>{dict.nav.tabs.mas}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
