"use client";

import { useEffect, type ReactNode } from "react";
import { loginRedirectUrl } from "@/api/login";
import { useI18n } from "@/i18n/provider";
import { useGateView, useSessionStore } from "@/features/session/provider";
import { AppShell } from "@/ui/shell/app-shell";
import { Activation } from "./activation";
import { Standalone } from "./standalone";

/**
 * La compuerta: nada de la app se pinta hasta saber quién eres (`/api/fms/v1/me`, ver `session/store.ts`).
 *   sin sesión → inicio de sesión del CV con `?next=/finanzas`; sin activar o sin aceptar la versión vigente →
 *   Activación; sin segundo factor → Activación solo con el paso del 2FA; activo → la cáscara.
 */
export function Gate({ children }: { children: ReactNode }) {
  const view = useGateView();
  const store = useSessionStore();
  const { dict } = useI18n();
  const loginUrl = view.kind === "redirect" ? loginRedirectUrl(view.loginUrl) : null;

  useEffect(() => {
    if (loginUrl) window.location.replace(loginUrl);
  }, [loginUrl]);

  switch (view.kind) {
    case "loading":
      return (
        <Standalone label={dict.loading}>
          <p role="status" className="muted">
            {dict.gate.checking}
          </p>
        </Standalone>
      );
    case "redirect":
      return (
        <Standalone label={dict.gate.redirecting}>
          <p role="status">{dict.gate.redirecting}</p>
          <a className="button button--primary" href={loginUrl ?? "#"}>
            {dict.gate.redirectingLink}
          </a>
        </Standalone>
      );
    case "error":
      return (
        <Standalone label={dict.gate.errorTitle}>
          <h1 className="title-l">{dict.gate.errorTitle}</h1>
          <p role="alert">{view.reason === "network" ? dict.gate.errorNetwork : dict.gate.errorServer}</p>
          <button type="button" className="button button--primary" onClick={() => void store.load()}>
            {dict.common.retry}
          </button>
        </Standalone>
      );
    case "activation":
      return <Activation me={view.me} mode={view.reason} />;
    case "mfa":
      return <Activation me={view.me} mode="mfa-only" />;
    case "app":
      return <AppShell me={view.me}>{children}</AppShell>;
  }
}
