import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { createIntents } from "@/api/ids";
import { formatDate, formatTime } from "@core/dates";
import { useFms } from "@/auth/use-session";
import { bumpData } from "@/features/common/invalidate";
import { onMemoryWipe } from "@/features/common/memory";
import { paths } from "@/features/common/paths";
import { useResource } from "@/features/common/use-resource";
import { es } from "@/i18n/es";
import { radius, space, type } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";
import { AppText, Button, Card, Chip, Notice } from "@/ui/primitives";
import { groupNotifications, payAction, type Notification, type NotificationList } from "./logic";
import { clearPending, usePending } from "./pending";
import { usePushActions } from "./push-actions";
import { usePushState } from "./state";

const t = es.notif;
const payIntents = createIntents();
onMemoryWipe(() => payIntents.done());

/**
 * Centro de notificaciones (diseño §3.16): grupos Hoy / Esta semana / Anteriores, leer, posponer y «Marcar pagado» (gastos fijos).
 * Tocar un aviso push abre esta pantalla con ese aviso resaltado. Las acciones llevan `Idempotency-Key`.
 */
export function NotificationCenter() {
  const fms = useFms();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "positive" | "negative" } | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useResource<NotificationList>(paths.notifications(unreadOnly));
  const pending = usePending();
  const focusId = pending?.target.notificationId ?? null;
  const data = list.data;
  const groups = data ? groupNotifications(data.results) : [];

  useEffect(() => () => clearPending(), []);

  async function run(action: () => Promise<{ ok: boolean }>, success: string | null) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (result.ok) {
      setMessage(success ? { text: success, tone: "positive" } : null);
      bumpData();
    } else {
      setMessage({ text: t.actionFailed, tone: "negative" });
    }
  }

  const markRead = (n: Notification) => run(() => fms.post(paths.notificationsRead, { ids: [n.id] }), null);
  const markAll = () => run(() => fms.post(paths.notificationsRead, {}), null);
  const snooze = (n: Notification) => run(() => fms.post(paths.notificationSnooze(n.id)), t.snoozed);
  const markPaid = (n: Notification) =>
    Alert.alert(t.confirmPay, undefined, [
      { text: es.common.cancel, style: "cancel" },
      {
        text: t.yes,
        onPress: () => {
          // Una intención, una clave: si la respuesta se pierde y la persona repite, el servidor no paga dos veces.
          const key = payIntents.keyFor(`pay:${n.object_id}`);
          void run(async () => {
            const result = await fms.post(paths.occurrencePay(n.object_id as string), { mode: "remaining" }, { idempotencyKey: key });
            if (result.ok) payIntents.done();
            return result;
          }, t.paid);
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <PushBanner />
      <View style={styles.row}>
        <AppText tone="secondary" accessibilityLiveRegion="polite">
          {data ? t.unread(data.unread) : ""}
        </AppText>
      </View>
      <View style={styles.chips}>
        <Chip label={t.all} selected={!unreadOnly} onPress={() => setUnreadOnly(false)} />
        <Chip label={t.onlyUnread} selected={unreadOnly} onPress={() => setUnreadOnly(true)} />
      </View>
      {data && data.unread > 0 ? <Button label={t.markAllRead} kind="secondary" disabled={busy} onPress={() => void markAll()} /> : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {list.loading && !data ? <AppText tone="secondary">{es.common.loading}</AppText> : null}
      {list.failure ? (
        <View style={styles.stack}>
          <Notice>{list.failure === "network" ? es.common.network : t.loadFailed}</Notice>
          <Button label={es.common.retry} kind="secondary" onPress={list.reload} />
        </View>
      ) : null}
      {data && groups.length === 0 ? (
        <Card>
          <AppText kind="titleS">{unreadOnly ? t.emptyUnread : t.empty}</AppText>
          {unreadOnly ? null : <AppText tone="secondary">{t.emptyBody}</AppText>}
        </Card>
      ) : null}
      {groups.map(({ group, items }) => (
        <View key={group} style={styles.stack}>
          <AppText kind="titleS" accessibilityRole="header">
            {t.groups[group]}
          </AppText>
          {items.map((n) => (
            <NoticeRow key={n.id} n={n} focused={n.id === focusId} busy={busy} onRead={() => void markRead(n)} onSnooze={() => void snooze(n)} onPay={() => markPaid(n)} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function NoticeRow({ n, focused, busy, onRead, onSnooze, onPay }: { n: Notification; focused: boolean; busy: boolean; onRead: () => void; onSnooze: () => void; onPay: () => void }) {
  const c = useTheme();
  const pay = payAction(n);
  const tone = n.severity === "critical" ? c.negative : n.severity === "warning" ? c.warning : c.info;
  return (
    <View style={[styles.notice, { backgroundColor: c.surface, borderColor: focused ? c.primary : c.border, borderWidth: focused ? 2 : 1 }]}>
      <View accessible accessibilityLabel={`${n.is_read ? "" : `${t.unreadDot}. `}${t.severity[n.severity]}. ${n.title}. ${n.body}`} style={styles.stack}>
        <Text style={[type.titleS, { color: c.textPrimary }]}>
          {n.is_read ? "" : "● "}
          {n.title}
        </Text>
        <Text style={[type.bodyS, { color: c.textSecondary }]}>{n.body}</Text>
        <Text style={[type.caption, { color: tone }]}>
          {t.severity[n.severity]} · {formatDate(n.visible_at)} {formatTime(n.visible_at)}
          {focused ? ` · ${t.opened}` : ""}
        </Text>
      </View>
      <View style={styles.chips}>
        {pay === "mark_paid" ? <Button label={t.markPaid} disabled={busy} onPress={onPay} /> : null}
        {pay === "web" ? (
          <AppText kind="caption" tone="secondary">
            {t.payWeb}
          </AppText>
        ) : null}
        <Button label={t.snooze} kind="secondary" disabled={busy} onPress={onSnooze} />
        {n.is_read ? null : <Button label={t.markRead} kind="ghost" disabled={busy} onPress={onRead} />}
      </View>
    </View>
  );
}

/** Estado de los avisos push: se piden SOLO desde aquí, con un toque de la persona. */
function PushBanner() {
  const state = usePushState();
  const actions = usePushActions();
  const [busy, setBusy] = useState(false);
  if (state === "unknown" || state === "on") return null;
  async function enable() {
    setBusy(true);
    await actions.enable();
    setBusy(false);
  }
  return (
    <Card>
      {state === "off" || state === "failed" ? (
        <>
          <AppText kind="titleS">{t.pushOffTitle}</AppText>
          <AppText tone="secondary">{state === "failed" ? t.pushFailed : t.pushOffBody}</AppText>
          <Button label={t.pushEnable} busy={busy} onPress={() => void enable()} />
        </>
      ) : null}
      {state === "blocked" ? (
        <>
          <AppText tone="secondary">{t.pushBlocked}</AppText>
          <Button label={t.pushOpenSettings} kind="secondary" onPress={actions.openSettings} />
        </>
      ) : null}
      {state === "unavailable" ? <AppText tone="secondary">{t.pushUnavailable}</AppText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[16], gap: space[12] },
  row: { flexDirection: "row", justifyContent: "space-between" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[8] },
  stack: { gap: space[8] },
  notice: { borderRadius: radius.md, padding: space[12], gap: space[12] },
});
