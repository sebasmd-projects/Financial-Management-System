import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Switch, View } from "react-native";
import { formatDate } from "@core/dates";
import { activeForwardingCode, connectionHealth, syncPaths, type Provider, type SyncCatalog, type SyncConnection, type SyncConnectionHealth, type SyncConnectionPage } from "@core/sync";
import { createIntents } from "@/api/ids";
import { bumpData } from "@/features/common/invalidate";
import { onMemoryWipe } from "@/features/common/memory";
import { useResource } from "@/features/common/use-resource";
import { canWrite } from "@/features/scope/scope";
import { useHouseholds, useScope } from "@/features/scope/store";
import { es } from "@/i18n/es";
import { space } from "@/theme/tokens";
import { AppText, Button, Card, Notice, Screen, Title } from "@/ui/primitives";
import { Sheet } from "@/ui/sheet";
import { Guide } from "./guide";
import { failureText, fill } from "./logic";
import { useScopedPath, useSyncApi } from "./use-sync";
import { Created, Wizard } from "./wizard";

const t = es.sync.conn;
const intents = createIntents();
onMemoryWipe(() => intents.done());

type Dialog = { kind: "add"; institutionId: number | null } | { kind: "how"; connection: SyncConnection } | { kind: "rotated"; connection: SyncConnection } | null;

/**
 * Más → Conexiones de correo (M1): los bancos conectados con su salud, el asistente para conectar otro y los interruptores de Nequi y Nu, que
 * SOLO se activan desde la app (el servidor responde `403 activate_from_app` a la web). La app no lee nada del teléfono ni pide permisos nuevos:
 * la conexión es el mismo canal de correo de la web. Nada se guarda en el teléfono.
 */
export function ConnectionsScreen() {
  const api = useSyncApi();
  const scope = useScope();
  const households = useHouseholds();
  const writable = canWrite(scope, households);
  const catalog = useResource<SyncCatalog>("/sync/catalog");
  const list = useResource<SyncConnectionPage>(useScopedPath("/sync/connections?page_size=100"));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState<{ text: string; tone: "positive" | "negative" } | null>(null);
  const connections = list.data?.results ?? [];
  const cat = catalog.data;
  const configured = cat?.configured ?? true;
  const appOnly = (cat?.institutions ?? []).filter((i) => i.mobile_only);

  async function patch(connection: SyncConnection, status: "active" | "paused") {
    const result = await api.patchConnection(connection.id, { status });
    if (result.ok) {
      setNote({ text: status === "paused" ? t.pausedOk : t.resumedOk, tone: "positive" });
      bumpData();
      list.reload();
    } else setNote({ text: failureText(result), tone: "negative" });
  }
  function confirmRotate(connection: SyncConnection) {
    Alert.alert(t.rotateTitle, t.rotateBody, [
      { text: es.common.cancel, style: "cancel" },
      {
        text: t.rotateYes,
        onPress: () => {
          void (async () => {
            const result = await api.rotate(connection.id, intents.keyFor(`rotate:${connection.id}`));
            if (result.ok) {
              intents.done();
              setDialog({ kind: "rotated", connection: result.data });
            } else setNote({ text: failureText(result), tone: "negative" });
          })();
        },
      },
    ]);
  }
  function confirmRemove(connection: SyncConnection) {
    Alert.alert(t.removeTitle, t.removeBody, [
      { text: es.common.cancel, style: "cancel" },
      {
        text: t.removeYes,
        style: "destructive",
        onPress: () => {
          void (async () => {
            const result = await api.deleteConnection(connection.id);
            if (result.ok) {
              setNote({ text: t.removedOk, tone: "positive" });
              bumpData();
              list.reload();
            } else setNote({ text: failureText(result), tone: "negative" });
          })();
        },
      },
    ]);
  }
  function flip(institutionId: number, on: boolean) {
    const found = connections.find((c) => c.institution_id === institutionId);
    if (on) {
      if (found && found.status === "paused") void patch(found, "active");
      else if (!found) setDialog({ kind: "add", institutionId });
    } else if (found && found.status === "active") void patch(found, "paused");
  }

  const close = () => {
    setDialog(null);
    list.reload();
    bumpData();
  };
  return (
    <Screen>
      <Title>{t.title}</Title>
      <AppText tone="secondary">{t.intro}</AppText>
      {!writable ? <Notice tone="secondary">{t.readOnly}</Notice> : null}
      {cat && !configured ? <Notice tone="secondary">{t.notConfigured}</Notice> : null}
      {note ? (
        <Notice tone={note.tone}>{note.text}</Notice>
      ) : null}
      {list.loading && !list.data ? <AppText tone="secondary">{es.common.loading}</AppText> : null}
      {list.failure ? (
        <View style={styles.group}>
          <Notice>{list.failure === "network" ? es.common.network : t.loadFailed}</Notice>
          <Button label={es.common.retry} kind="secondary" onPress={list.reload} />
        </View>
      ) : null}
      {writable ? <Button label={t.add} disabled={!cat || !configured} onPress={() => setDialog({ kind: "add", institutionId: null })} /> : null}

      {appOnly.length > 0 ? (
        <Card>
          <AppText kind="titleS" accessibilityRole="header">
            {t.appOnlyTitle}
          </AppText>
          <AppText kind="bodyS" tone="secondary">
            {t.appOnlyBody}
          </AppText>
          {appOnly.map((institution) => {
            const found = connections.find((c) => c.institution_id === institution.id);
            const on = found?.status === "active";
            return (
              <View key={institution.id} style={styles.switchRow}>
                <View style={styles.fill}>
                  <AppText>{institution.name}</AppText>
                  <AppText kind="caption" tone="secondary">
                    {on ? t.switchOn : found ? t.switchPaused : t.switchOff}
                  </AppText>
                </View>
                <Switch accessibilityLabel={t.switchLabel(institution.name, on)} value={on} disabled={!writable || !configured || (found !== undefined && !found.is_manager)} onValueChange={(value) => flip(institution.id, value)} />
              </View>
            );
          })}
        </Card>
      ) : null}

      {list.data && connections.length === 0 ? (
        <Card>
          <AppText kind="titleS">{t.emptyTitle}</AppText>
          <AppText tone="secondary">{t.emptyBody}</AppText>
        </Card>
      ) : null}
      {connections.map((connection) => (
        <ConnectionCard key={connection.id} connection={connection} writable={writable} onHow={() => setDialog({ kind: "how", connection })} onFlip={() => void patch(connection, connection.status === "paused" ? "active" : "paused")} onRotate={() => confirmRotate(connection)} onRemove={() => confirmRemove(connection)} />
      ))}

      <Sheet open={dialog?.kind === "add"} title={es.sync.wizard.title} onClose={close}>
        {cat && dialog?.kind === "add" ? <Wizard catalog={cat} existing={connections} presetInstitutionId={dialog.institutionId} onDone={close} /> : null}
      </Sheet>
      <Sheet open={dialog?.kind === "how"} title={dialog?.kind === "how" ? es.sync.wizard.howTitle(dialog.connection.institution_name) : ""} onClose={() => setDialog(null)}>
        {dialog?.kind === "how" ? <Guide provider={(dialog.connection.provider ?? "other") as Provider} code={activeForwardingCode(dialog.connection)} /> : null}
      </Sheet>
      <Sheet open={dialog?.kind === "rotated"} title={t.rotate} onClose={close}>
        {dialog?.kind === "rotated" ? <Created connection={dialog.connection} onDone={close} onReplace={(next) => setDialog({ kind: "rotated", connection: next })} /> : null}
      </Sheet>
    </Screen>
  );
}

function ConnectionCard({ connection, writable, onHow, onFlip, onRotate, onRemove }: { connection: SyncConnection; writable: boolean; onHow: () => void; onFlip: () => void; onRotate: () => void; onRemove: () => void }) {
  // La salud la calcula el servidor (`sync/connections/{id}/health`); aquí no hay una regla de días.
  const serverHealth = useResource<SyncConnectionHealth>(useScopedPath(syncPaths.health(connection.id)));
  const reloadHealth = serverHealth.reload;
  const firstStatus = useRef(connection.status);
  useEffect(() => {
    if (firstStatus.current !== connection.status) {
      firstStatus.current = connection.status;
      reloadHealth();
    }
  }, [connection.status, reloadHealth]);
  const health = connectionHealth(connection, serverHealth.data);
  const paused = connection.status === "paused";
  const name = connection.label ? `${connection.institution_name} · ${connection.label}` : connection.institution_name;
  const code = activeForwardingCode(connection);
  const when = connection.last_event_at ? formatDate(connection.last_event_at) : "";
  const provider = connection.provider ? (es.sync.providers[connection.provider] ?? connection.provider) : null;
  return (
    <Card>
      <AppText kind="titleS">{name}</AppText>
      <AppText tone="secondary">{fill(t.account, { name: connection.account_name })}</AppText>
      {provider ? <AppText tone="secondary">{fill(t.provider, { name: provider })}</AppText> : null}
      <AppText kind="caption" tone={paused ? "secondary" : "positive"}>
        {paused ? t.paused : t.active}
        {connection.include_statements ? ` · ${t.statements}` : ""}
      </AppText>
      <AppText accessibilityLiveRegion="polite" tone={health.state === "quiet" || health.state === "error" ? "negative" : "secondary"}>
        {health.state === "ok" ? fill(t.health.ok, { date: when }) : health.state === "waiting" ? t.health.waiting : health.state === "quiet" ? fill(t.health.quiet, { n: String(health.days), date: when }) : health.state === "error" ? t.health.error : health.state === "paused" ? t.health.paused : ""}
      </AppText>
      {connection.rejected_count > 0 ? (
        <AppText kind="caption" tone="secondary">
          {fill(t.rejected, { n: String(connection.rejected_count) })}
        </AppText>
      ) : null}
      {connection.is_manager && code ? <AppText>{fill(t.forwardingCode, { code })}</AppText> : null}
      {!connection.is_manager ? (
        <AppText kind="caption" tone="secondary">
          {t.notManager}
        </AppText>
      ) : null}
      {connection.is_manager && writable ? (
        <View style={styles.group}>
          <Button label={t.howTo} kind="secondary" onPress={onHow} />
          <Button label={paused ? t.resume : t.pause} kind="secondary" onPress={onFlip} />
          <Button label={t.rotate} kind="secondary" onPress={onRotate} />
          <Button label={t.remove} kind="ghost" onPress={onRemove} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[8] },
  fill: { flex: 1 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space[12], minHeight: 48 },
});
