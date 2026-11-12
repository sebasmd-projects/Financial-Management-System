import type { Phase } from "./session";

/** A qué ruta va cada estado de la sesión (sin parámetros: nada de montos ni datos en rutas ni enlaces profundos). */
export type Destination = "/login" | "/otp" | "/setup" | "/home" | null;

export function destinationFor(phase: Phase): Destination {
  switch (phase.name) {
    case "signed_out":
      return "/login";
    case "second_factor":
      return "/otp";
    case "setup":
      return "/setup";
    case "ready":
    case "load_failed":
      return "/home";
    default:
      // booting, locked y loading los pinta la raíz (velo, bloqueo y carga): no hay ruta.
      return null;
  }
}

export type Area = "public" | "otp" | "setup" | "app";

/** ¿Puede este estado ver esta área? Si no, se le manda a su destino. */
export function allows(phase: Phase, area: Area): boolean {
  if (area === "public") return phase.name === "signed_out";
  if (area === "otp") return phase.name === "second_factor";
  if (area === "setup") return phase.name === "setup";
  return phase.name === "ready" || phase.name === "load_failed";
}
