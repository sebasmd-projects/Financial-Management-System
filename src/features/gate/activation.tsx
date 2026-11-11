"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/api";
import type { MeResponse } from "@/api/types";
import { useI18n } from "@/i18n/provider";
import { useSessionStore } from "@/features/session/provider";
import { Icon } from "@/ui/icons";
import { activationBlocker, activationErrorMessage, canActivate, shouldReloadAfter, submitActivation } from "./activation-logic";
import { Standalone } from "./standalone";

export type ActivationMode = "inactive" | "reconsent" | "mfa-only";

/**
 * La pantalla de activación: términos y privacidad, la casilla de consentimiento y el segundo factor.
 * Sin 2FA verificado no se puede activar; cada código 403 de la API tiene su mensaje.
 */
export function Activation({ me, mode }: { me: MeResponse; mode: ActivationMode }) {
  const { dict, locale } = useI18n();
  const store = useSessionStore();
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const needsConsent = mode !== "mfa-only";
  const input = { mfaVerified: me.mfa_verified, consent, submitting, needsConsent };
  const enabled = canActivate(input);
  const blocker = activationBlocker(input, dict);
  const t = dict.activation;
  const title = mode === "reconsent" ? t.reconsentTitle : mode === "mfa-only" ? t.mfaOnlyTitle : t.title;
  const intro = mode === "reconsent" ? t.reconsentIntro : mode === "mfa-only" ? t.mfaOnlyIntro : t.intro;

  // El error se anuncia (role="alert") y recibe el foco para quien navega con teclado o lector de pantalla.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!enabled) return;
    setSubmitting(true);
    setError(null);
    const result = await submitActivation(api, me.consent.required_version);
    if (result.ok) {
      await store.load({ quiet: true });
      return; // la compuerta cambia de pantalla: este componente se desmonta
    }
    setSubmitting(false);
    setError(activationErrorMessage(result.code, dict));
    if (result.code === "consent_mismatch") setConsent(false);
    if (shouldReloadAfter(result.code)) await store.load({ quiet: true });
  }

  // Los términos y la privacidad son del CV (otra aplicación): enlace normal, pestaña nueva y sin referrer.
  const terms = `/${locale}/terms`;
  const privacy = `/${locale}/privacy`;

  return (
    <Standalone label={title}>
      <div className="brand" aria-hidden="true">
        <Icon name="shield" size={28} />
      </div>
      <h1 className="title-l">{title}</h1>
      <p className="muted">{intro}</p>

      <section className="panel" aria-labelledby="mfa-heading">
        <h2 id="mfa-heading" className="title-s">
          {t.mfaHeading}
        </h2>
        <p className="body-s">{t.mfaExplain}</p>
        {me.mfa_verified ? (
          <p className="status status--positive" role="status">
            <Icon name="check" size={20} /> {t.mfaOk}
          </p>
        ) : (
          <>
            <p className="status status--warning" role="status">
              <Icon name="alert" size={20} /> {t.mfaMissing}
            </p>
            <div className="actions">
              <a className="button button--primary" href={me.mfa_setup_url}>
                {t.mfaButton}
              </a>
              <button type="button" className="button button--ghost" onClick={() => void store.load({ quiet: true })}>
                {t.mfaRecheck}
              </button>
            </div>
          </>
        )}
      </section>

      <form onSubmit={onSubmit} noValidate>
        {needsConsent && (
          <section className="panel" aria-labelledby="consent-heading">
            <h2 id="consent-heading" className="title-s">
              {t.consentHeading}
            </h2>
            <p className="body-s">
              <a href={terms} target="_blank" rel="noopener noreferrer">
                {t.termsLink}
                <span className="visually-hidden"> ({t.opensNewTab})</span>
              </a>
              {" · "}
              <a href={privacy} target="_blank" rel="noopener noreferrer">
                {t.privacyLink}
                <span className="visually-hidden"> ({t.opensNewTab})</span>
              </a>
              {" · "}
              <span className="muted">
                {t.consentVersion} {me.consent.required_version}
              </span>
            </p>
            <label className="check">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} aria-describedby={blocker ? "activation-hint" : undefined} />
              <span>{t.consentLabel}</span>
            </label>
          </section>
        )}

        {error && (
          <p ref={errorRef} tabIndex={-1} role="alert" className="status status--negative">
            <Icon name="alert" size={20} /> {error}
          </p>
        )}

        {needsConsent && (
          <>
            <button type="submit" className="button button--primary button--block" disabled={!enabled} aria-disabled={!enabled}>
              {submitting ? t.submitting : t.submit}
            </button>
            {blocker && (
              <p id="activation-hint" className="hint">
                {blocker}
              </p>
            )}
          </>
        )}
      </form>
    </Standalone>
  );
}
