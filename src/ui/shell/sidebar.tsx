"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { PersonalTag } from "@/features/household/notices";
import { fmsHref, isItemActive, isSectionActive, SECTIONS, type SectionId } from "@/nav/routes";
import { Icon } from "@/ui/icons";
import { useMediaQuery } from "./use-media-query";

/**
 * Navegación lateral (≥ 600 dp, diseño §1.3). Expandida: las 8 secciones con sus subelementos, cada sección plegable.
 * Plegada: riel de iconos (80 dp en tableta, 64 dp plegada en escritorio). Por defecto, expandida desde 1024 dp.
 * Los estados de plegado viven solo en memoria.
 */
export function Sidebar() {
  const { dict, locale } = useI18n();
  const pathname = usePathname();
  const wide = useMediaQuery("(min-width: 1024px)");
  const [override, setOverride] = useState<boolean | null>(null);
  const [openSections, setOpenSections] = useState<Partial<Record<SectionId, boolean>>>({});
  const expanded = override ?? wide;

  return (
    <aside className="sidebar" data-expanded={expanded} aria-label={dict.nav.primary}>
      <div className="sidebar__header">
        <span className="brand-name">{expanded ? dict.appName : ""}</span>
        <button
          type="button"
          className="icon-button"
          aria-expanded={expanded}
          aria-label={expanded ? dict.nav.collapseMenu : dict.nav.expandMenu}
          onClick={() => setOverride(!expanded)}
        >
          <Icon name="panel-left" />
        </button>
      </div>
      <nav aria-label={dict.nav.primary}>
        <ul className="sidebar__list">
          {SECTIONS.map((section) => {
            const label = dict.nav.sections[section.id];
            const active = isSectionActive(section, pathname);
            const open = openSections[section.id] ?? active;
            const hasItems = section.items.length > 0;
            return (
              <li key={section.id}>
                <div className="sidebar__row">
                  <Link href={fmsHref(locale, section.route)} className="sidebar__link" aria-current={active && !hasItems ? "page" : undefined} title={expanded ? undefined : label} aria-label={expanded ? undefined : label}>
                    <Icon name={section.icon} />
                    {expanded && <span>{label}</span>}
                    {expanded && !hasItems && <PersonalTag route={section.route} />}
                  </Link>
                  {expanded && hasItems && (
                    <button
                      type="button"
                      className="icon-button icon-button--small"
                      aria-expanded={open}
                      aria-controls={`sub-${section.id}`}
                      aria-label={`${open ? dict.nav.collapseSection : dict.nav.expandSection} ${label}`}
                      onClick={() => setOpenSections((prev) => ({ ...prev, [section.id]: !open }))}
                    >
                      <Icon name={open ? "chevron-down" : "chevron-right"} size={20} />
                    </button>
                  )}
                </div>
                {expanded && hasItems && (
                  <ul id={`sub-${section.id}`} className="sidebar__sub" hidden={!open}>
                    {section.items.map((item) => (
                      <li key={item.id}>
                        <Link href={fmsHref(locale, item.route)} className="sidebar__sublink" aria-current={isItemActive(item, pathname) ? "page" : undefined}>
                          {dict.nav.items[item.id]}
                          <PersonalTag route={item.route} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
