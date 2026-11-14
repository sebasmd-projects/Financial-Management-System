"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { formatDate, formatTime } from "@/lib/dates";
import { Banner } from "../kit";
import { fill } from "../helpers";
import { type Provider } from "../../../../core/sync";

/**
 * La dirección de reenvío, tal como la devuelve crear o rotar: se muestra UNA vez, solo en memoria (ni en la URL, ni en `localStorage`; nada la
 * guarda). Se puede copiar con un botón o seleccionar a mano. Cerrar la ventana la descarta.
 */
export function AddressPanel({ address }: { address: string }) {
  const { dict } = useI18n();
  const t = dict.fin.sync.wizard;
  const input = useRef<HTMLInputElement>(null);
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopy("done");
    } catch {
      input.current?.select();
      setCopy("failed");
    }
  }
  return (
    <section className="fin-card sync-address" aria-labelledby="sync-address-title">
      <h3 id="sync-address-title" className="title-s">
        {t.step2}
      </h3>
      <Banner tone="warning">{t.addressOnce}</Banner>
      <label className="field__label" htmlFor="sync-address">
        {t.addressLabel}
      </label>
      <input id="sync-address" ref={input} className="input sync-address__input" readOnly value={address} onFocus={(event) => event.currentTarget.select()} autoComplete="off" spellCheck={false} />
      <div className="actions">
        <button type="button" className="button button--primary" onClick={() => void copyAddress()}>
          {t.copy}
        </button>
      </div>
      <p role="status" className="muted">
        {copy === "done" ? t.copied : copy === "failed" ? t.copyFailed : ""}
      </p>
      <p className="hint">{t.addressSecret}</p>
    </section>
  );
}

/**
 * El filtro paso a paso para el proveedor del correo, el código de confirmación de Gmail (lo muestra el FMS cuando reconoce el correo de
 * Google: nunca hace clic por la persona) y la explicación del monto mínimo de las alertas (plan §3.1).
 */
export function ForwardingGuide({ provider, bankName, code, codeExpiresAt }: { provider: Provider; bankName: string; code: string | null; codeExpiresAt: string | null }) {
  const { dict } = useI18n();
  const t = dict.fin.sync.wizard;
  const steps = t.steps[provider] ?? t.steps.other;
  return (
    <div className="fin-form sync-guide">
      <section aria-label={fill(t.howTitle, { bank: bankName })}>
        <h3 className="title-s">{t.step3}</h3>
        <p className="hint">{t.senderTip}</p>
        <ol className="sync-steps">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {provider === "gmail" && (
          <div className="fin-card sync-code" role="status" aria-live="polite">
            {code ? (
              <>
                <p>
                  {t.codeShown.split("{code}")[0]}
                  <strong className="tabular sync-code__value">{code}</strong>
                </p>
                {codeExpiresAt && <p className="hint">{fill(dict.fin.sync.conn.forwardingCodeHelp, { date: formatDate(codeExpiresAt), time: formatTime(codeExpiresAt) })}</p>}
              </>
            ) : (
              <p className="muted">{t.codeWaiting}</p>
            )}
          </div>
        )}
      </section>
      <section aria-labelledby="sync-min-title">
        <h3 id="sync-min-title" className="title-s">
          {t.step4}
        </h3>
        <p className="title-s">{t.minTitle}</p>
        <p>{t.minBody}</p>
        <p className="title-s">{t.minWhere}</p>
        <ul className="fin-list">
          <li>{t.minBancolombia}</li>
          <li>{t.minOthers}</li>
        </ul>
      </section>
    </div>
  );
}
