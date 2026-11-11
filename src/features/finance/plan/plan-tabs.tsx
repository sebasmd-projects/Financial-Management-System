"use client";

import { useI18n } from "@/i18n/provider";
import type { RouteId } from "@/nav/routes";
import { useHref } from "../hooks";
import { LinkTabs } from "../kit";

const TABS: readonly RouteId[] = ["plan-presupuestos", "plan-ahorro", "plan-objetivos", "plan-indicadores"];

/** Presupuestos, Ahorro, Objetivos e Indicadores (las pestañas del propietario, §3.12). */
export function PlanTabs({ current }: { current: RouteId }) {
  const { dict } = useI18n();
  const href = useHref();
  return <LinkTabs label={dict.fin.plan.tabs} items={TABS.map((route) => ({ href: href(route), label: dict.screens[route], current: route === current }))} />;
}
