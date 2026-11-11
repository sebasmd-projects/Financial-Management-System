import type { MeResponse } from "@/api/types";

/** Una cuenta de prueba activa, con 2FA y los términos vigentes aceptados (datos sintéticos). */
export const ME: MeResponse = {
  user: { id: 1, display_name: "Ana Prueba", email: "ana@example.test", email_verified: true },
  mfa_verified: true,
  finance_active: true,
  consent: { required_version: "2026-11-10", accepted_version: "2026-11-10" },
  mfa_setup_url: "/es/account/2fa",
  login_url: "/es/account/login",
};
