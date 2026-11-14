import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { components } from "@core/api/schema.gen";
import { formatDate, formatTime } from "@core/dates";
import { absAmount, negateAmount } from "@core/money";
import { buildModify, canUndo, draftFromEvent, editableFields, eventMoneyType, isProposed, syncPaths, type ModifyDraft, type ModifyProblem, type SyncConnectionPage, type SyncEvent, type SyncEventPage } from "@core/sync";
import { createIntents } from "@/api/ids";
import { bumpData } from "@/features/common/invalidate";
import { onMemoryWipe } from "@/features/common/memory";
import { paths } from "@/features/common/paths";
import { useResource } from "@/features/common/use-resource";
import { clearPending, usePending } from "@/features/notifications/pending";
import { movementAccounts } from "@/features/quick-add/logic";
import { canWrite, scopedPath } from "@/features/scope/scope";
import { useHouseholds, useScope } from "@/features/scope/store";
import { es } from "@/i18n/es";
import { openMail } from "@/nav/external";
import { sanitizeMailLink } from "@/nav/deeplink";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";
import { Money } from "@/ui/money";
import { AppText, Button, Card, Chip, Field, Notice, Screen, Title } from "@/ui/primitives";
import { Sheet } from "@/ui/sheet";
import { failureText, fill } from "./logic";
import { useScopedPath, useSyncApi } from "./use-sync";

type Account = components["schemas"]["Account"];
type Category = components["schemas"]["Category"];
const t = es.sync.review;
type Tab = "pending" | "history";
type Decision = "approved" | "modified" | "discarded" | "undone";
/** Una `Idempotency-Key` por intención (aprobar, descartar, modificar, deshacer): repetir lo mismo manda la misma clave. Solo en memoria. */
const intents = createIntents();
onMemoryWipe(() => intents.done());

/**
 * Más → Por revisar (M2): las propuestas del correo con Aprobar | Modificar (todos los campos, el monto incluido) | Descartar | Deshacer y
 * «Ir al correo» (se abre FUERA de la app; el correo nunca se muestra aquí). Un aviso push de un movimiento propuesto llega a esta pantalla con
 * esa propuesta resaltada: el id solo viaja en memoria. Mismas reglas que la web (W2).
 */
export function ReviewScreen() {
  const api = useSyncApi();
  const scope = useScope();
  const households = useHouseholds();
  const writable = canWrite(scope, households);
  const pending = usePending();
  const focusId = pending?.target.objectKind === "sync_event" ? pending.target.objectId : null;
  const [tab, setTab] = useState<Tab>("pending");
  const events = useResource<SyncEventPage>(useScopedPath(syncPaths.events(tab === "pending" ? "proposed" : "all")));
  const connections = useResource<SyncConnectionPage>(useScopedPath("/sync/connections?page_size=100"));
  const [recent, setRecent] = useState<SyncEvent[]>([]);
  const [modifying, setModifying] = useState<SyncEvent | null>(null);
  const [note, setNote] = useState<{ text: string; tone: "positive" | "negative" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => () => clearPending(), []);

  const where = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of connections.data?.results ?? []) map.set(c.id, `${c.account_name} · ${c.institution_name}`);
    return map;
  }, [connections.data]);

  function decided(event: SyncEvent, decision: Decision) {
    setRecent((list) => [event, ...list.filter((row) => row.id !== event.id)].slice(0, 10));
    setNote({ text: decision === "approved" ? t.approved : decision === "discarded" ? t.discarded : decision === "undone" ? t.undone : t.modified, tone: "positive" });
    setModifying(null);
    bumpData();
    events.reload();
  }

  async function decide(event: SyncEvent, decision: "approved" | "discarded" | "undone") {
    if (busy) return;
    setBusy(event.id);
    const key = intents.keyFor(`${decision}:${event.id}`);
    const call = decision === "approved" ? api.approve : decision === "discarded" ? api.discard : api.undo;
    const result = await call(event.id, key);
    setBusy(null);
    if (result.ok) {
      intents.done();
      decided(result.data, decision);
    } else setNote({ text: failureText(result), tone: "negative" });
  }

  const recentIds = new Set(recent.map((row) => row.id));
  const rows = (events.data?.results ?? []).filter((event) => !recentIds.has(event.id));
  const noConnections = connections.data !== null && connections.data.results.length === 0;
  const card = (event: SyncEvent) => <EventCard key={event.id} event={event} where={where.get(event.connection_id) ?? null} writable={writable} focused={event.id === focusId} busy={busy === event.id} onApprove={() => void decide(event, "approved")} onDiscard={() => void decide(event, "discarded")} onUndo={() => void decide(event, "undone")} onModify={() => setModifying(event)} />;

  return (
    <Screen>
      <Title>{t.title}</Title>
      <AppText tone="secondary">{t.intro}</AppText>
      <View style={styles.chips}>
        <Chip label={t.tabPending} selected={tab === "pending"} onPress={() => setTab("pending")} />
        <Chip label={t.tabDecided} selected={tab === "history"} onPress={() => setTab("history")} />
      </View>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {events.loading && !events.data ? <AppText tone="secondary">{es.common.loading}</AppText> : null}
      {events.failure ? (
        <View style={styles.group}>
          <Notice>{events.failure === "network" ? es.common.network : t.loadFailed}</Notice>
          <Button label={es.common.retry} kind="secondary" onPress={events.reload} />
        </View>
      ) : null}
      {recent.map(card)}
      {events.data && rows.length === 0 && recent.length === 0 ? (
        <Card>
          <AppText kind="titleS">{tab === "pending" ? t.emptyTitle : t.emptyHistory}</AppText>
          {tab === "pending" ? <AppText tone="secondary">{noConnections ? t.noConnections : t.emptyBody}</AppText> : null}
        </Card>
      ) : null}
      {rows.map(card)}
      <Sheet open={modifying !== null} title={t.modifyTitle} onClose={() => setModifying(null)}>
        {modifying ? <ModifyForm event={modifying} onDone={(saved) => decided(saved, "modified")} /> : null}
      </Sheet>
    </Screen>
  );
}

function EventCard({ event, where, writable, focused, busy, onApprove, onDiscard, onUndo, onModify }: { event: SyncEvent; where: string | null; writable: boolean; focused: boolean; busy: boolean; onApprove: () => void; onDiscard: () => void; onUndo: () => void; onModify: () => void }) {
  const c = useTheme();
  const [mailFailed, setMailFailed] = useState(false);
  const type = eventMoneyType(event.kind);
  const title = event.counterparty || t.untitled;
  const fields = editableFields(event);
  const hint = event.mail_link?.search_hint ?? "";
  const mail = sanitizeMailLink(event.mail_link);
  const magnitude = event.amount === null ? null : absAmount(event.amount);
  const amount = magnitude === null ? null : type === "expense" ? { value: negateAmount(magnitude), sign: "auto" as const } : { value: magnitude, sign: type === "income" ? ("always" as const) : ("auto" as const) };
  const match = event.match ? t.match[event.match] : undefined;
  async function goToMail() {
    setMailFailed(!(await openMail(event.mail_link)));
  }
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: focused ? c.primary : c.border, borderWidth: focused ? 2 : 1 }]}>
      <View accessible accessibilityLabel={`${title}. ${es.sync.kinds[event.kind] ?? ""}. ${t.status[event.status] ?? event.status}`} style={styles.group}>
        <AppText kind="titleS">{title}</AppText>
        {amount ? <Money value={amount.value} sign={amount.sign} kind="titleM" /> : null}
        <AppText kind="bodyS" tone="secondary">
          {es.sync.kinds[event.kind] ?? ""}
          {event.date ? ` · ${formatDate(event.date)}` : ""}
          {event.last4 ? ` · ${fill(t.card, { last4: event.last4 })}` : ""}
        </AppText>
        {where ? (
          <AppText kind="caption" tone="secondary">
            {fill(t.account, { name: where })}
          </AppText>
        ) : null}
        <AppText kind="caption" tone="secondary">
          {fill(t.received, { date: formatDate(event.received_at), time: formatTime(event.received_at) })}
          {focused ? ` · ${t.opened}` : ""}
        </AppText>
        <AppText kind="caption" tone={event.status === "rejected_auth" || event.status === "parse_error" ? "negative" : "secondary"}>
          {t.status[event.status] ?? event.status}
        </AppText>
        {isProposed(event) && match ? <AppText kind="bodyS">{match}</AppText> : null}
      </View>
      {isProposed(event) && writable ? (
        <View style={styles.group}>
          <Button label={busy ? t.working : t.approve} busy={busy} onPress={onApprove} />
          {fields.modify ? <Button label={t.modify} kind="secondary" disabled={busy} onPress={onModify} /> : null}
          <Button label={t.discard} kind="ghost" disabled={busy} onPress={onDiscard} />
        </View>
      ) : null}
      {canUndo(event) && writable ? <Button label={busy ? t.working : t.undo} kind="secondary" busy={busy} onPress={onUndo} /> : null}
      {mail ? <Button label={t.mail} kind="secondary" onPress={() => void goToMail()} /> : null}
      {mailFailed ? <Notice>{fill(t.mailFailed, { hint })}</Notice> : null}
      {hint && !mail ? (
        <AppText kind="caption" tone="secondary">
          {fill(t.mailNone, { hint })}
        </AppText>
      ) : null}
      {hint && mail && !event.mail_link?.exact && !mailFailed ? (
        <AppText kind="caption" tone="secondary">
          {fill(t.mailHint, { hint })}
        </AppText>
      ) : null}
    </View>
  );
}

/**
 * «Modificar y aprobar»: todos los campos, el monto incluido. Se envía SOLO lo que cambió (`buildModify`); el servidor deja en la auditoría lo de
 * antes y lo de después. Si la propuesta cruzó con un pago pendiente, el tipo y la cuenta no cambian.
 */
function ModifyForm({ event, onDone }: { event: SyncEvent; onDone: (saved: SyncEvent) => void }) {
  const api = useSyncApi();
  const scope = useScope();
  const fields = editableFields(event);
  const accounts = useResource<{ results: Account[] }>(scopedPath(paths.accounts, scope));
  const categories = useResource<{ results: Category[] }>(scopedPath(paths.categories, scope));
  const [draft, setDraft] = useState<ModifyDraft>(() => draftFromEvent(event));
  const [problems, setProblems] = useState<ModifyProblem[]>([]);
  const [state, setState] = useState<{ name: "idle" } | { name: "working" } | { name: "failed"; message: string }>({ name: "idle" });
  const options = useMemo(() => movementAccounts(accounts.data?.results ?? []).filter((a) => a.kind !== "credit_card" || a.id === event.account_id), [accounts.data, event.account_id]);
  const kinds = (categories.data?.results ?? []).filter((cat) => cat.kind === draft.type && !cat.archived);
  const transfer = event.kind === "transfer_in" || event.kind === "transfer_out";
  const set = <K extends keyof ModifyDraft>(key: K, value: ModifyDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const problem = (key: ModifyProblem) => (problems.includes(key) ? t.problems[key] : null);

  async function submit() {
    if (state.name === "working") return;
    const built = buildModify(event, draft);
    if (!built.ok) {
      setProblems(built.problems);
      return;
    }
    setProblems([]);
    setState({ name: "working" });
    const result = await api.modify(event.id, built.body, intents.keyFor(`modify:${event.id}:${JSON.stringify(built.body)}`));
    if (result.ok) {
      intents.done();
      setState({ name: "idle" });
      onDone(result.data);
    } else setState({ name: "failed", message: failureText(result) });
  }

  return (
    <View style={styles.group}>
      <AppText>{t.modifyIntro}</AppText>
      {!fields.type ? <AppText kind="caption" tone="secondary">{t.modifyLimited}</AppText> : null}
      {fields.type && !transfer ? (
        <View style={styles.chips}>
          <Chip label={es.sync.kinds.expense} selected={draft.type === "expense"} onPress={() => set("type", "expense")} />
          <Chip label={es.sync.kinds.income} selected={draft.type === "income"} onPress={() => set("type", "income")} />
        </View>
      ) : null}
      <Field label={t.amount} value={draft.amount} onChangeText={(v) => set("amount", v)} keyboardType="decimal-pad" placeholder={t.amountHint} error={problem("amount")} />
      <Field label={t.date} value={draft.date} onChangeText={(v) => set("date", v)} keyboardType="numbers-and-punctuation" maxLength={10} error={problem("date")} />
      {fields.account ? (
        <View style={styles.group}>
          <AppText kind="label" tone="secondary">
            {t.accountField}
          </AppText>
          <View style={styles.chips}>
            {options.map((a) => (
              <Chip key={a.id} label={a.name} selected={draft.accountId === a.id} onPress={() => set("accountId", a.id)} />
            ))}
          </View>
        </View>
      ) : null}
      {!transfer ? (
        <View style={styles.group}>
          <AppText kind="label" tone="secondary">
            {t.category}
          </AppText>
          <View style={styles.chips}>
            <Chip label={t.noCategory} selected={draft.categoryId === ""} onPress={() => set("categoryId", "")} />
            {kinds.map((cat) => (
              <Chip key={cat.id} label={cat.name} selected={draft.categoryId === cat.id} onPress={() => set("categoryId", cat.id)} />
            ))}
          </View>
        </View>
      ) : null}
      <Field label={t.counterparty} value={draft.counterparty} onChangeText={(v) => set("counterparty", v)} maxLength={120} autoCapitalize="sentences" error={problem("counterparty")} />
      <Field label={t.description} value={draft.description} onChangeText={(v) => set("description", v)} maxLength={200} autoCapitalize="sentences" error={problem("description")} />
      <Field label={t.notes} value={draft.notes} onChangeText={(v) => set("notes", v)} maxLength={280} autoCapitalize="sentences" error={problem("notes")} />
      {problems.includes("no_changes") ? <Notice>{t.problems.no_changes}</Notice> : null}
      {state.name === "failed" ? <Notice>{state.message}</Notice> : null}
      <Button label={state.name === "working" ? t.working : t.saveApprove} busy={state.name === "working"} onPress={() => void submit()} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[8] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[8] },
  card: { borderRadius: radius.md, padding: space[16], gap: space[8] },
});
