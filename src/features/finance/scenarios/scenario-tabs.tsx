"use client";

import { useI18n } from "@/i18n/provider";
import type { RouteId } from "@/nav/routes";
import { useHref } from "../hooks";
import { LinkTabs } from "../kit";

const TABS: readonly RouteId[] = ["informes-proyecciones", "informes-comparar", "informes-independencia"];

/** Proyecciones › Proyecciones · Comparar · Independencia (diseño §1.1: son las pantallas hermanas de «Proyecciones»). */
export function ProjectionTabs({ current }: { current: RouteId }) {
  const { dict } = useI18n();
  const href = useHref();
  return <LinkTabs label={dict.fin.scen.tabs} items={TABS.map((route) => ({ href: href(route), label: dict.screens[route], current: route === current }))} />;
}
