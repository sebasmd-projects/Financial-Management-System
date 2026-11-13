"use client";

import { useEffect, useState } from "react";
import { api } from "@/api";
import type { BankQuote } from "@/api/models";
import { paths } from "@/api/paths";
import { compareAmounts } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { Banner, Money } from "../kit";

/** Lo que se le pregunta al servidor: o un préstamo tuyo, o los términos de uno que aún no existe. Los montos viajan en el cuerpo, nunca en la URL. */
export type QuoteSource = { loan_id: string } | { principal: string; rate: string; rate_convention: string; term: number; system: string };

/**
 * La cuota que cobra el banco frente a capital + interés: el servidor calcula (con `Decimal`) cuánto de más cobra el banco. Es una lectura
 * por POST (no escribe nada). Sin cuota escrita, o con términos incompletos, no se pide.
 */
export function useBankQuote(bank: string | null, source: QuoteSource | null): { quote: BankQuote | null; error: string | null; pending: boolean } {
  const [state, setState] = useState<{ key: string; quote: BankQuote | null; error: string | null } | null>(null);
  const body = bank !== null && source !== null ? { bank_installment: bank, ...source } : null;
  const key = body ? JSON.stringify(body) : null;
  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api.post<BankQuote>(paths.bankQuote(), JSON.parse(key) as unknown, { signal: controller.signal }).then((result) => {
        if (controller.signal.aborted) return;
        setState(result.ok ? { key, quote: result.data, error: null } : { key, quote: null, error: result.code });
      });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);
  const current = key !== null && state?.key === key ? state : null;
  return { quote: current?.quote ?? null, error: current?.error ?? null, pending: key !== null && current === null };
}

/** El resultado: capital + interés de la tabla, el cargo mensual adicional implícito y, si se da `onSave`, el botón para guardarlo. */
export function BankQuoteResult({ quote, pending, onSave, saving }: { quote: BankQuote | null; pending: boolean; onSave?: (extra: string) => void; saving?: boolean }) {
  const { dict } = useI18n();
  const t = dict.fin.own.bank;
  if (pending) return <p className="hint" role="status">{t.computing}</p>;
  if (!quote) return null;
  const negative = compareAmounts(quote.implied_extra, "0") < 0;
  return (
    <div className="fin-phrase" role="status" data-testid="bank-quote">
      <p>
        {t.installment}: <Money value={quote.principal_interest} />
      </p>
      {negative ? (
        <Banner tone="warning">{t.negative}</Banner>
      ) : compareAmounts(quote.implied_extra, "0") === 0 ? (
        <p>{t.extraNone}</p>
      ) : (
        <>
          <p>
            {t.extra}: <strong><Money value={quote.implied_extra} /></strong>
          </p>
          {onSave && (
            <button type="button" className="button button--ghost" disabled={saving} onClick={() => onSave(quote.implied_extra)}>
              {t.save}
            </button>
          )}
        </>
      )}
    </div>
  );
}
