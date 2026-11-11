import type { RouteId } from "@/nav/routes";

/**
 * Las pantallas que ya existen (FMS-1, cortes 1.1–1.6, y FMS-1b, cortes 1.7–1.10). El resto de la tabla de rutas sigue siendo la pantalla de relleno de
 * FMS-0 hasta que su corte llegue. Es un módulo SIN `"use client"` para que la página (servidor) pueda consultarlo.
 */
export const IMPLEMENTED: ReadonlySet<RouteId> = new Set<RouteId>([
  "resumen",
  "cuentas",
  "cuentas-bancos",
  "cuentas-efectivo",
  "cuentas-debito",
  "cuentas-credito",
  "cuenta",
  "cuenta-conciliar",
  "movimientos",
  "movimientos-ingresos",
  "movimientos-egresos",
  "movimientos-transferencias",
  "movimientos-historial",
  "movimiento-nuevo",
  "movimiento",
  "movimiento-asientos",
  "tarjeta",
  "tarjeta-extracto",
  "tarjeta-pagar",
  "tarjeta-simular",
  "pagos",
  "pagos-fijos",
  "pagos-fijo-pagar",
  "pagos-suscripciones",
  "pagos-recurrencia-nueva",
  "pagos-recurrencia",
  "pagos-calendario",
  "creditos",
  "credito",
  "credito-tabla",
  "config-categorias",
  "config-etiquetas",
  "config-reglas",
  "config-parametros",
  "notificaciones",
]);
