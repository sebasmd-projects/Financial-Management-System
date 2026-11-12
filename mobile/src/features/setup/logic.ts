import { es } from "@/i18n/es";

/** Los 403 de la activación (`email_unverified`, `mfa_required`, `account_blocked`, `consent_mismatch`) con su texto. */
export type ActivationErrorKey = "email_unverified" | "mfa_required" | "account_blocked" | "consent_mismatch";
const KEYS: readonly string[] = ["email_unverified", "mfa_required", "account_blocked", "consent_mismatch"] satisfies readonly (keyof typeof es.setup)[];

export function activationErrorKey(status: number, code: string): ActivationErrorKey | null {
  return status === 403 && KEYS.includes(code) ? (code as ActivationErrorKey) : null;
}

/**
 * El enlace `otpauth://` que abre un autenticador instalado con la clave ya puesta. El emisor es el del sitio (`Finanzas`).
 * La clave sale del servidor (allauth) y solo se usa para este enlace y para mostrarla; no se guarda.
 */
export function otpauthUrl(secret: string, account: string, issuer = "sebasmoralesd.com"): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}
