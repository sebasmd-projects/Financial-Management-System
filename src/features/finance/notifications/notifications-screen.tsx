"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Notification, NotificationList } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { formatDate, formatTime } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { fill } from "../helpers";
import { useHref, useResource, useSubmit } from "../hooks";
import { Badge, Banner, Empty, ErrorState, Loading, ScreenHeader, Section, Segmented, SelectField } from "../kit";
import { groupNotifications, paymentTarget } from "./logic";
import { PrefsPanel } from "./prefs-panel";

/** Centro de notificaciones (`/notificaciones`, diseño §3.16): grupos Hoy / Esta semana / Anteriores, leído, posponer y preferencias. */
export function NotificationsScreen() {
  const { dict } = useI18n();
  const t = dict.fin.notif;
  const href = useHref();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [rule, setRule] = useState("");
  const [snoozed, setSnoozed] = useState(false);
  const list = useResource<NotificationList>(paths.notifications({ unread: unreadOnly ? true : undefined, rule: rule || undefined }));
  const submit = useSubmit();
  const data = list.data;
  const groups = data ? groupNotifications(data.results) : [];

  async function markAll() {
    const body = {};
    const result = await submit.run({ all: true }, (key) => api.post(roots.notificationsRead, body, { idempotencyKey: key }));
    if (result.ok) list.reload();
  }

  return (
    <div className="screen notifications">
      <ScreenHeader
        title={dict.screens.notificaciones}
        eyebrow={data ? (data.unread === 0 ? t.allRead : data.unread === 1 ? t.unreadOne : fill(t.unread, { n: String(data.unread) })) : undefined}
        actions={
          data && data.unread > 0 ? (
            <button type="button" className="button button--ghost" disabled={submit.pending} onClick={() => void markAll()}>
              <Icon name="check" size={20} />
              {t.markAllRead}
            </button>
          ) : undefined
        }
      />
      <div className="fin-filters">
        <Segmented legend={t.filterLegend} hideLegend variant="chips" options={[{ value: "all", label: t.filterAll }, { value: "unread", label: t.filterUnread }]} value={unreadOnly ? "unread" : "all"} onChange={(v) => setUnreadOnly(v === "unread")} />
        <SelectField label={t.ruleFilter} value={rule} onChange={setRule} placeholder={t.ruleAll} options={Object.keys(t.rules).map((key) => ({ value: key, label: t.rules[key].title }))} />
      </div>
      {snoozed && (
        <Banner tone="positive">
          <p>{t.snoozed}</p>
        </Banner>
      )}
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
        </Banner>
      )}

      {list.loading && !data && <Loading />}
      {list.failure && <ErrorState message={t.loadError} onRetry={list.reload} />}
      {data && groups.length === 0 && <Empty icon="bell" title={unreadOnly || rule ? t.emptyUnreadTitle : t.emptyTitle} body={unreadOnly || rule ? undefined : t.emptyBody} />}
      {groups.map(({ group, items }) => (
        <Section key={group} title={t.groups[group]}>
          <ul className="fin-list">
            {items.map((n) => (
              <li key={n.id}>
                <NoticeRow notification={n} onChanged={(wasSnooze) => { setSnoozed(wasSnooze); list.reload(); }} />
              </li>
            ))}
          </ul>
        </Section>
      ))}

      <PrefsPanel />
      <p>
        <Link className="button button--ghost" href={href("config-reglas")}>
          {t.rulesTitle}
        </Link>
      </p>
    </div>
  );
}

const SEVERITY_TONE = { info: "info", warning: "warning", critical: "negative" } as const;

function NoticeRow({ notification: n, onChanged }: { notification: Notification; onChanged: (snoozed: boolean) => void }) {
  const { dict } = useI18n();
  const t = dict.fin.notif;
  const href = useHref();
  const submit = useSubmit();
  const pay = paymentTarget(n);

  async function markRead() {
    const body = { ids: [n.id] };
    const result = await submit.run(body, (key) => api.post(roots.notificationsRead, body, { idempotencyKey: key }));
    if (result.ok) onChanged(false);
  }
  async function snooze() {
    const result = await submit.run({ snooze: n.id }, (key) => api.post(paths.notificationSnooze(n.id), undefined, { idempotencyKey: key }));
    if (result.ok) onChanged(true);
  }

  return (
    <div className={`fin-row fin-row--static notice${n.is_read ? "" : " notice--unread"}`}>
      <div className="fin-row__main">
        <span className="fin-row__title">
          {!n.is_read && (
            <>
              <span className="notice__dot" aria-hidden="true" />
              <span className="visually-hidden">{t.unreadDot}: </span>
            </>
          )}
          {n.title}
        </span>
        <span className="fin-row__sub">{n.body}</span>
        <span className="fin-row__sub muted">
          <Badge tone={SEVERITY_TONE[n.severity]}>{t.severity[n.severity]}</Badge> {formatDate(n.visible_at)} {formatTime(n.visible_at)}
        </span>
        {submit.error && (
          <span className="field__error" role="alert">
            {submit.error}
          </span>
        )}
      </div>
      <div className="notice__actions">
        {pay && (
          <Link className="button button--primary" href={href(pay.route, pay.params)}>
            {pay.route === "pagos-fijo-pagar" ? t.markPaid : t.pay}
            <span className="visually-hidden"> {n.title}</span>
          </Link>
        )}
        <button type="button" className="button button--ghost" disabled={submit.pending} onClick={() => void snooze()}>
          {t.snooze}
          <span className="visually-hidden"> {n.title}</span>
        </button>
        {!n.is_read && (
          <button type="button" className="button button--ghost" disabled={submit.pending} onClick={() => void markRead()}>
            {t.markRead}
            <span className="visually-hidden"> {n.title}</span>
          </button>
        )}
      </div>
    </div>
  );
}
