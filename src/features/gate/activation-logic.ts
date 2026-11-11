import type { Dictionary } from "@/i18n/get-dictionary";
import type { ApiClient } from "@/api/client";
import { isActivationErrorCode, type ActivationRequest } from "@/api/types";

export interface ActivationInput {
  mfaVerified: boolean;
  consent: boolean;
  submitting: boolean;
  /** Si solo falta la verificación en dos pasos (cuenta ya activa), no hay nada que aceptar. */
  needsConsent: boolean;
}

/** Se puede activar solo con 2FA verificado y la casilla marcada: la API lo vuelve a exigir, esto es la guía. */
export function canActivate({ mfaVerified, consent, submitting, needsConsent }: ActivationInput): boolean {
  return mfaVerified && needsConsent && consent && !submitting;
}

/** Por qué todavía no, en palabras (para el botón deshabilitado). */
export function activationBlocker(input: ActivationInput, dict: Dictionary): string | null {
  if (!input.mfaVerified) return dict.activation.needMfa;
  if (input.needsConsent && !input.consent) return dict.activation.needConsent;
  return null;
}

/** Mensaje en español de un fallo de la activación. Nunca el `detail` del servidor. */
export function activationErrorMessage(code: string, dict: Dictionary): string {
  if (isActivationErrorCode(code)) return dict.activation.errors[code];
  if (code === "network") return dict.activation.errors.network;
  if (code === "csrf") return dict.activation.errors.csrf;
  return dict.activation.errors.generic;
}

/** Tras estos fallos el estado de la cuenta cambió o puede haber cambiado: se vuelve a leer `/me`. */
export function shouldReloadAfter(code: string): boolean {
  return code === "mfa_required" || code === "consent_mismatch" || code === "email_unverified";
}

/**
 * `POST /api/fms/v1/activation` con la versión que la persona vio y aceptó. Sin reintento (un POST): si falla, la
 * persona decide. Devuelve el `code` del 403 (`email_unverified`, `mfa_required`, `account_blocked`, `consent_mismatch`).
 */
export async function submitActivation(client: Pick<ApiClient, "post">, acceptVersion: string): Promise<{ ok: true } | { ok: false; code: string }> {
  const body: ActivationRequest = { accept_version: acceptVersion };
  const result = await client.post("/activation", body);
  return result.ok ? { ok: true } : { ok: false, code: result.code };
}
