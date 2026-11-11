"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Subscriptions } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { useHref, useResource, useSubmit } from "../hooks";
import { Badge, Banner, Empty, ErrorState, Loading, Money, ScreenHeader, Section } from "../kit";

/** Suscripciones (`/pagos/suscripciones`, diseño §3.10): total mensual y anual, activas, por confirmar, pausadas y canceladas. */
export function SubscriptionsScreen() {
  const { dict, locale } = useI18n();
  const t = dict.fin.subs;
  const href = useHref();
  const data = useResource<Subscriptions>(paths.subscriptions());
  const skip = useSubmit();
  const [busy, setBusy] = useState<string | null>(null);
  const s = data.data;
  const by = (status: "active" | "paused" | "cancelled") => (s?.items ?? []).filter((item) => item.recurrence.status === status);

  async function notCharged(occurrenceId: string) {
    setBusy(occurrenceId);
    const body = { reason: t.notChargedReason };
    const result = await skip.run({ occurrenceId, ...body }, (key) => api.post(paths.occurrenceAction(occurrenceId, "skip"), body, { idempotencyKey: key, locale }));
    setBusy(null);
    if (result.ok) data.reload();
  }

  return (
    <div className="screen">
      <ScreenHeader
        title={dict.screens["pagos-suscripciones"]}
        eyebrow={dict.nav.sections.pagos}
        actions={
          <Link className="button button--primary" href={href("pagos-recurrencia-nueva")}>
            <Icon name="plus" size={20} />
            {t.add}
          </Link>
        }
      />
      {data.loading && !s && <Loading />}
      {data.failure && <ErrorState message={dict.fin.errors.generic} onRetry={data.reload} />}
      {s && s.items.length === 0 && s.to_confirm.length === 0 && <Empty icon="calendar-check" title={t.emptyTitle} body={t.emptyBody} action={<Link className="button button--primary" href={href("pagos-recurrencia-nueva")}>{t.add}</Link>} />}
      {s && s.items.length > 0 && (
        <dl className="fin-kpis">
          <div className="fin-kpi">
            <dt className="muted">{t.perMonth}</dt>
            <dd className="fin-kpi__value"><Money value={s.monthly} /></dd>
          </div>
          <div className="fin-kpi">
            <dt className="muted">{t.perYear}</dt>
            <dd className="fin-kpi__value"><Money value={s.yearly} /></dd>
          </div>
        </dl>
      )}
      {skip.error && <Banner tone="negative" live="assertive">{skip.error}</Banner>}
      {s && by("active").length > 0 && (
        <Section title={t.active}>
          <SubList items={by("active")} />
        </Section>
      )}
      {s && s.to_confirm.length > 0 && (
        <Section title={t.toConfirm}>
          <ul className="fin-list">
            {s.to_confirm.map((o) => (
              <li key={o.id} className="fin-row fin-row--static">
                <span className="fin-row__main">
                  <span className="fin-row__title">{o.name}</span>
                  <span className="fin-row__sub muted">
                    <Money value={o.expected} estimated={o.estimated} /> · {t.expectedOn} {formatDate(o.adjusted_date)}
                  </span>
                </span>
                <span className="actions">
                  <Link className="button button--primary" href={href("pagos-fijo-pagar", [o.id])}>
                    {t.yesCharged}
                    <span className="visually-hidden"> {o.name}</span>
                  </Link>
                  <button type="button" className="button button--ghost" disabled={busy === o.id} onClick={() => void notCharged(o.id)}>
                    {t.notCharged}
                    <span className="visually-hidden"> {o.name}</span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {s && by("paused").length > 0 && (
        <Section title={t.paused}>
          <SubList items={by("paused")} />
        </Section>
      )}
      {s && by("cancelled").length > 0 && (
        <Section title={t.cancelled}>
          <SubList items={by("cancelled")} />
        </Section>
      )}
    </div>
  );
}

function SubList({ items }: { items: Subscriptions["items"] }) {
  const { dict } = useI18n();
  const t = dict.fin.subs;
  const href = useHref();
  return (
    <ul className="fin-list">
      {items.map(({ recurrence: r }) => (
        <li key={r.id}>
          <Link href={href("pagos-recurrencia", [r.id])} className="fin-row">
            <span className="fin-row__main">
              <span className="fin-row__title">{r.name}</span>
              <span className="fin-row__sub muted">
                <Money value={r.expected_amount} estimated={r.is_estimate} /> · {dict.fin.frequencies[r.frequency] ?? r.frequency}
                {r.next_dates[0] ? ` · ${t.next} ${formatDate(r.next_dates[0])}` : ""}
              </span>
              {r.provider && <span className="fin-row__badges"><Badge>{r.provider}</Badge></span>}
            </span>
            <Icon name="chevron-right" size={20} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
