"use client";

import Link from "next/link";
import type { AmountDue } from "@/api/models";
import { formatDate } from "@/lib/dates";
import { compareAmounts, negateAmount } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { useHref } from "../hooks";
import { LATE_RATE_KEY } from "./conditions";
import { Badge, Banner, DefinitionList, ErrorState, Loading, Money } from "../kit";

/** El aviso de que falta la tasa de mora con vigencia: dice qué hacer y lleva a Parámetros. Nunca se inventa una tasa. */
export function LateRateMissing() {
  const { dict } = useI18n();
  const href = useHref();
  const t = dict.fin.occ;
  return (
    <Banner tone="warning" live="assertive">
      <p>
        <strong>{t.lateRateMissingTitle}</strong>
      </p>
      <p>{t.lateRateMissing}</p>
      <p>
        <Link className="button button--ghost" href={`${href("config-parametros")}?clave=${LATE_RATE_KEY}`}>
          {t.lateRateMissingLink}
        </Link>
      </p>
    </Banner>
  );
}

const STATE_TONE = { early: "positive", regular: "info", late: "negative" } as const;

/** «Lo que se paga hoy»: estado (pronto / a tiempo / tardío) y el desglose que calculó el servidor (`occurrences/{id}/quote`). */
export function QuotePanel({ quote, failureCode, loading, onRetry }: { quote: AmountDue | null; failureCode: string | null; loading: boolean; onRetry: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.occ;
  if (failureCode === "late_rate_missing") return <LateRateMissing />;
  if (failureCode) return <ErrorState message={t.quoteUnavailable} onRetry={onRetry} />;
  if (!quote) return loading ? <Loading /> : null;
  const stateLabel = quote.state === "early" ? t.stateEarly : quote.state === "late" ? t.stateLate : t.stateRegular;
  return (
    <section className="fin-card fin-quote" aria-label={t.quoteTitle} aria-live="polite">
      <div className="fin-quote__head">
        <h2 className="title-s">{t.quoteTitle}</h2>
        <Badge tone={STATE_TONE[quote.state]}>{stateLabel}</Badge>
      </div>
      <p className="muted">{fill(t.quoteOn, { date: formatDate(quote.on) })}</p>
      <DefinitionList
        rows={[
          { label: t.quotePrincipal, value: <Money value={quote.principal} /> },
          ...(compareAmounts(quote.discount, "0") > 0 ? [{ label: t.quoteDiscount, value: <Money value={negateAmount(quote.discount)} tone="positive" /> }] : []),
          ...(compareAmounts(quote.surcharge, "0") > 0 ? [{ label: t.quoteSurcharge, value: <Money value={quote.surcharge} sign="always" tone="negative" /> }] : []),
          { label: t.quoteTotal, value: <strong><Money value={quote.total} /></strong> },
        ]}
      />
      {quote.state === "early" && quote.early_deadline && <p className="hint">{fill(t.quoteEarlyUntil, { date: formatDate(quote.early_deadline) })}</p>}
      {quote.state === "late" && quote.days_late > 0 && <p className="hint">{fill(t.quoteDaysLate, { n: String(quote.days_late) })}</p>}
      <p className="hint">{t.quoteNote}</p>
    </section>
  );
}
