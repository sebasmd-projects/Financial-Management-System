"use client";

import Link from "next/link";
import type { Summary } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { isNegativeAmount } from "@/lib/money";
import { useHref, useResource } from "../finance/hooks";
import { ErrorState, Loading, Money } from "../finance/kit";

/** El Resumen de «Ambos»: las cifras de lo personal y del hogar sumadas por el servidor (`scope=both`, sin cuentas puente). */
export function ConsolidatedSummary({ householdId, period }: { householdId: string; period: string }) {
  const { dict } = useI18n();
  const t = dict.fin.hh.summary;
  const href = useHref();
  const data = useResource<Summary>(paths.summaryBoth(householdId, period));
  const s = data.data;
  return (
    <section className="fin-card" aria-label={t.title}>
      <p className="muted">{t.intro}</p>
      {data.loading && !s && <Loading />}
      {data.failure && <ErrorState message={dict.fin.dash.loadError} onRetry={data.reload} />}
      {s && (
        <dl className={`fin-kpis${data.loading ? " fin-stale" : ""}`}>
          <div className="fin-kpi">
            <dt className="muted">{t.available}</dt>
            <dd className="fin-kpi__value">
              <Money value={s.available_today} tone={isNegativeAmount(s.available_today) ? "negative" : undefined} />
            </dd>
          </div>
          <div className="fin-kpi">
            <dt className="muted">{t.spent}</dt>
            <dd className="fin-kpi__value">
              <Money value={s.spent} />
            </dd>
          </div>
          <div className="fin-kpi">
            <dt className="muted">{t.income}</dt>
            <dd className="fin-kpi__value">
              <Money value={s.income} />
            </dd>
          </div>
          <div className="fin-kpi">
            <dt className="muted">{t.owed}</dt>
            <dd className="fin-kpi__value">
              <Money value={s.owed} />
            </dd>
          </div>
        </dl>
      )}
      <Link className="button button--ghost" href={href("informes")}>
        {t.openReports}
      </Link>
    </section>
  );
}
