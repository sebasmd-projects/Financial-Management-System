"use client";

import type { ReactNode } from "react";
import { useGateView } from "@/features/session/provider";

/**
 * Qué se ve en `/<idioma>/<raíz>`: la página de aterrizaje pública y, SOLO para quien tiene la cuenta activa y el segundo
 * factor, el Resumen.
 *
 * Cómo se garantiza que la página pública no lleva datos de nadie:
 *  1. `landing` es un componente de servidor que solo recibe el idioma (no lee cookies ni sesión): el HTML es el mismo para
 *     todas las personas, y por eso puede indexarse y no necesita `no-store`.
 *  2. Lo personal se decide en el NAVEGADOR: `useGateView` consulta `/api/fms/v1/me` después de hidratar. En el servidor y en
 *     la hidratación el estado es siempre «cargando», que pinta la página de aterrizaje.
 *  3. Con la cuenta activa, `summary` (y la cáscara) sustituyen a `landing`; esos datos vienen de la API con la sesión, nunca del HTML.
 * Coste: quien ya tiene sesión ve la página pública un instante antes del Resumen.
 */
export function LandingEntry({ landing, summary }: { landing: ReactNode; summary: ReactNode }) {
  const view = useGateView();
  return view.kind === "app" ? summary : landing;
}
