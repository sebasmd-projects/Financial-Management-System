"use client";

import { useI18n } from "@/i18n/provider";
import type { RouteId } from "@/nav/routes";
import { useHref } from "../hooks";
import { LinkTabs } from "../kit";

const TABS: readonly { route: RouteId; key: "loans" | "installments" | "interest" | "amortizations" | "debts" }[] = [
  { route: "creditos", key: "loans" },
  { route: "creditos-cuotas", key: "installments" },
  { route: "creditos-intereses", key: "interest" },
  { route: "creditos-amortizaciones", key: "amortizations" },
  { route: "creditos-deudas", key: "debts" },
];

/** Las pestañas del propietario de Créditos (§3.8): Préstamos, Cuotas, Intereses, Amortizaciones, Deudas personales. */
export function CreditTabs({ current }: { current: RouteId }) {
  const { dict } = useI18n();
  const href = useHref();
  return <LinkTabs label={dict.fin.credit.tabs.label} items={TABS.map((tab) => ({ href: href(tab.route), label: dict.fin.credit.tabs[tab.key], current: tab.route === current }))} />;
}
