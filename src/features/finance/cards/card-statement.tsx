"use client";

import Link from "next/link";
import { formatDate, formatPeriod, periodOf, shiftPeriod, todayBogota } from "@/lib/dates";
import type { Card, Statements } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { isPeriodParam } from "../helpers";
import { useHref, useResource } from "../hooks";
import { DefinitionList, Empty, ErrorState, Loading, Money, ScreenHeader } from "../kit";

/** Extracto (`/tarjetas/[id]/extractos/[periodo]`): una VISTA de los asientos de la tarjeta entre dos cortes; no se guarda. */
export function CardStatement({ id, period }: { id: string; period: string }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.cards;
  const href = useHref();
  const month = isPeriodParam(period) ? period : undefined;
  const card = useResource<Card>(paths.card(id));
  const statements = useResource<Statements>(paths.cardStatements(id, month));
  const s = statements.data?.statement ?? null;
  const shown = month ?? (s ? periodOf(s.cutoff) : periodOf(todayBogota()));
  return (
    <div className="screen">
      <ScreenHeader title={`${dict.screens["tarjeta-extracto"]} · ${formatPeriod(shown, locale)}`} eyebrow={card.data?.name} back={{ href: href("tarjeta", [id]), label: card.data?.name ?? dict.screens.tarjeta }} />
      <nav className="fin-periodbar" aria-label={t.statementNav}>
        <Link className="button button--ghost" href={href("tarjeta-extracto", [id, shiftPeriod(shown, -1)])}>
          {t.previousStatement}
        </Link>
        <Link className="button button--ghost" href={href("tarjeta-extracto", [id, shiftPeriod(shown, 1)])}>
          {t.nextStatement}
        </Link>
      </nav>
      {statements.loading && !statements.data && <Loading />}
      {statements.failure && <ErrorState message={statements.failure.status === 404 ? dict.fin.errors.notFound : dict.fin.errors.generic} onRetry={statements.reload} />}
      {statements.data && !s && <Empty icon="list" title={t.noStatement} body={t.noStatementBody} />}
      {s && (
        <>
          <p className="muted">
            {formatDate(s.period_start)} – {formatDate(s.cutoff)} · {t.dueOn} {formatDate(s.due_date)}
          </p>
          <DefinitionList
            rows={[
              { label: t.st.carried, value: <Money value={s.carried} /> },
              { label: t.st.purchases, value: <Money value={s.purchases} /> },
              { label: t.st.installments, value: <Money value={s.installments} /> },
              { label: t.st.advances, value: <Money value={s.advances} /> },
              { label: t.st.interest, value: <Money value={s.interest} /> },
              { label: t.st.fees, value: <Money value={s.fees} /> },
              { label: t.st.payments, value: <Money value={s.payments} /> },
              { label: t.payTotal, value: <Money value={s.total_due} /> },
              { label: t.payMinimum, value: <Money value={s.minimum_due} /> },
            ]}
          />
          <p className="hint">{t.statementHint}</p>
        </>
      )}
    </div>
  );
}
