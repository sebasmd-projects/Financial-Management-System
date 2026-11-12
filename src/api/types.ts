/**
 * TIPOS ESCRITOS A MANO desde el contrato FMS-0 con el backend (`/api/fms/v1/`).
 *
 * TODO(FMS-1): sustituir por los generados del `openapi-fms.yaml` del backend (`openapi-typescript`) y hacer que CI
 * falle si se desalinean, como en el CV. Hasta entonces, un cambio del contrato se refleja aquí a mano.
 *
 * Los montos (FMS-1 en adelante) viajan como CADENAS decimales: `type Amount = string`, nunca `number`.
 */

import type { Amount, ApiErrorBody } from "../../core/api/types";

export type { Amount, ApiErrorBody };

/** `GET /api/fms/v1/me` → 200. */
export interface MeResponse {
  user: {
    id: number | string;
    display_name: string;
    email: string;
    email_verified: boolean;
  };
  /** La sesión actual pasó el segundo factor. */
  mfa_verified: boolean;
  /** El FMS está activado para esta cuenta (hay perfil financiero). */
  finance_active: boolean;
  consent: {
    /** La versión vigente de términos y privacidad del FMS. */
    required_version: string;
    /** La que aceptó la persona; `null` si nunca aceptó. */
    accepted_version: string | null;
  };
  /** Ruta (del CV) para activar el segundo factor. */
  mfa_setup_url: string;
  /** Ruta (del CV) del inicio de sesión. */
  login_url: string;
}

/** `POST /api/fms/v1/activation`. */
export interface ActivationRequest {
  accept_version: string;
}

/** Códigos de un 403 de la activación. */
export type ActivationErrorCode = "email_unverified" | "mfa_required" | "account_blocked" | "consent_mismatch";

export const ACTIVATION_ERROR_CODES: readonly ActivationErrorCode[] = ["email_unverified", "mfa_required", "account_blocked", "consent_mismatch"];

export function isActivationErrorCode(value: unknown): value is ActivationErrorCode {
  return typeof value === "string" && (ACTIVATION_ERROR_CODES as readonly string[]).includes(value);
}
