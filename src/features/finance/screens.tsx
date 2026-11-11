"use client";

import { Suspense, type ReactNode } from "react";
import type { RouteId } from "@/nav/routes";
import { Loading } from "./kit";
import { AmortizationsScreen } from "./credit/amortizations-screen";
import { DebtsScreen } from "./credit/debts-screen";
import { InstallmentsScreen } from "./credit/installments-screen";
import { InterestScreen } from "./credit/interest-screen";
import { AccountDetail } from "./accounts/account-detail";
import { AccountsScreen } from "./accounts/accounts-screen";
import { CalendarScreen } from "./calendar/calendar-screen";
import { CardDetail } from "./cards/card-detail";
import { CardPay } from "./cards/card-pay";
import { CardSimulateScreen } from "./cards/card-purchase";
import { CardStatement } from "./cards/card-statement";
import { CategoriesScreen, TagsScreen } from "./catalog/catalog-screens";
import { NotificationsScreen } from "./notifications/notifications-screen";
import { RulesScreen } from "./notifications/rules-screen";
import { LoanDetail } from "./loans/loan-detail";
import { LoanTable } from "./loans/loan-table";
import { LoansScreen } from "./loans/loans-screen";
import { MovementDetail, MovementEntriesScreen } from "./movements/movement-detail";
import { MovementForm } from "./movements/movement-form";
import { MovementsScreen } from "./movements/movements-screen";
import { FixedExpensesScreen } from "./payments/fixed-expenses";
import { OccurrencePay } from "./payments/occurrence-pay";
import { RecurrenceDetail } from "./payments/recurrence-detail";
import { RecurrenceForm } from "./payments/recurrence-form";
import { ParametersScreen } from "./parameters/parameters-screen";
import { ReconcileScreen } from "./reconcile/reconcile-screen";
import { SubscriptionsScreen } from "./payments/subscriptions";
import { SummaryScreen } from "./summary/summary-screen";

function render(routeId: RouteId, params: readonly string[]): ReactNode {
  const [first = "", second = ""] = params;
  switch (routeId) {
    case "resumen":
      return <SummaryScreen />;
    case "cuentas":
      return <AccountsScreen tab="todas" />;
    case "cuentas-bancos":
      return <AccountsScreen tab="bancos" />;
    case "cuentas-efectivo":
      return <AccountsScreen tab="efectivo" />;
    case "cuentas-debito":
      return <AccountsScreen tab="debito" />;
    case "cuentas-credito":
      return <AccountsScreen tab="credito" />;
    case "cuenta":
      return <AccountDetail id={first} />;
    case "cuenta-conciliar":
      return <ReconcileScreen id={first} />;
    case "movimientos":
    case "movimientos-historial":
      return <MovementsScreen preset="all" routeId={routeId} />;
    case "movimientos-ingresos":
      return <MovementsScreen preset="income" routeId={routeId} />;
    case "movimientos-egresos":
      return <MovementsScreen preset="expense" routeId={routeId} />;
    case "movimientos-transferencias":
      return <MovementsScreen preset="transfer" routeId={routeId} />;
    case "movimiento-nuevo":
      return <MovementForm />;
    case "movimiento":
      return <MovementDetail id={first} />;
    case "movimiento-asientos":
      return <MovementEntriesScreen id={first} />;
    case "tarjeta":
      return <CardDetail id={first} />;
    case "tarjeta-extracto":
      return <CardStatement id={first} period={second} />;
    case "tarjeta-pagar":
      return <CardPay id={first} />;
    case "tarjeta-simular":
      return <CardSimulateScreen id={first} />;
    case "pagos":
    case "pagos-fijos":
      return <FixedExpensesScreen />;
    case "pagos-fijo-pagar":
      return <OccurrencePay id={first} />;
    case "pagos-calendario":
      return <CalendarScreen />;
    case "pagos-suscripciones":
      return <SubscriptionsScreen />;
    case "pagos-recurrencia-nueva":
      return <RecurrenceForm />;
    case "pagos-recurrencia":
      return <RecurrenceDetail id={first} />;
    case "creditos":
      return <LoansScreen />;
    case "creditos-cuotas":
      return <InstallmentsScreen />;
    case "creditos-intereses":
      return <InterestScreen />;
    case "creditos-amortizaciones":
      return <AmortizationsScreen />;
    case "creditos-deudas":
      return <DebtsScreen />;
    case "credito":
      return <LoanDetail id={first} />;
    case "credito-tabla":
      return <LoanTable id={first} />;
    case "config-categorias":
      return <CategoriesScreen />;
    case "config-etiquetas":
      return <TagsScreen />;
    case "config-parametros":
      return <ParametersScreen />;
    case "config-reglas":
      return <RulesScreen />;
    case "notificaciones":
      return <NotificationsScreen />;
    default:
      return null;
  }
}

/**
 * La pantalla financiera de una ruta de la tabla. `key` = la ruta y sus parámetros: al cambiar de pantalla (o de id) el estado
 * de los formularios se descarta, y con él la clave de idempotencia de lo que se estaba haciendo.
 */
export function FinanceScreen({ routeId, params }: { routeId: RouteId; params: readonly string[] }) {
  return (
    <Suspense fallback={<Loading />}>
      <div key={`${routeId}:${params.join("/")}`}>{render(routeId, params)}</div>
    </Suspense>
  );
}
