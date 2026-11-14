import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { deletionBody, hasReconciled, isSimple, reopenReason, shouldRefetchPreview, trashApi, trashPaths, type DeletionKind, type DeletionPreview } from "@core/trash";
import { createIntents } from "@/api/ids";
import { useFms } from "@/auth/use-session";
import { bumpData } from "@/features/common/invalidate";
import { onMemoryWipe } from "@/features/common/memory";
import { useResource } from "@/features/common/use-resource";
import { scopedPath } from "@/features/scope/scope";
import { useScope } from "@/features/scope/store";
import { es } from "@/i18n/es";
import { space } from "@/theme/tokens";
import { AppText, Button, Notice } from "@/ui/primitives";
import { Sheet } from "@/ui/sheet";
import { affectedLines, scopedClient } from "./logic";

const t = es.trash;
/** Una `Idempotency-Key` por intención (regla 9): reintentar la misma eliminación manda la misma clave. Solo en memoria. */
const intents = createIntents();
onMemoryWipe(() => intents.done());

/**
 * «Eliminar» con papelera en la app (propietario, 2026-11-14): antes de confirmar dice qué se verá afectado (productos relacionados y
 * cuántos movimientos), avisa de lo conciliado y deja reabrir la conciliación (opcional). Confirmar manda el `digest` de lo que se vio.
 */
export function DeleteSheet({ open, kind, id, name, canWrite, onClose, onDone }: { open: boolean; kind: DeletionKind; id: string; name: string; canWrite: boolean; onClose: () => void; onDone: () => void }) {
  const fms = useFms();
  const scope = useScope();
  const api = useMemo(() => trashApi(scopedClient(fms, scope)), [fms, scope]);
  const preview = useResource<DeletionPreview>(open ? scopedPath(trashPaths.preview(kind, id), scope) : null);
  const [state, setState] = useState<{ name: "idle" } | { name: "working" } | { name: "failed"; code: string; network: boolean } | { name: "done" }>({ name: "idle" });
  const [reopened, setReopened] = useState(false);
  const stale = state.name === "failed" && shouldRefetchPreview(state.code);
  const reload = preview.reload;
  useEffect(() => {
    if (stale) reload();
  }, [stale, reload]);

  async function confirm() {
    if (!preview.data || state.name === "working") return;
    setState({ name: "working" });
    const body = deletionBody(kind, id, preview.data);
    const result = await api.remove(kind, id, preview.data, intents.keyFor(JSON.stringify(body)));
    if (result.ok) {
      intents.done();
      bumpData();
      setState({ name: "done" });
      onDone();
    } else setState({ name: "failed", code: result.code, network: result.status === 0 });
  }

  async function reopen(reconciliationId: string) {
    const result = await api.reopenReconciliation(reconciliationId, reopenReason(t.reconciled.reason) ?? "");
    if (result.ok) {
      setReopened(true);
      preview.reload();
    }
  }

  const p = preview.data;
  return (
    <Sheet open={open} title={t.dialog.title.replace("{name}", name)} onClose={onClose}>
      {preview.loading && !p ? <AppText tone="secondary">{t.dialog.loading}</AppText> : null}
      {preview.failure ? (
        <View style={styles.group}>
          <Notice>{preview.failure === "network" ? es.common.network : t.dialog.loadFailed}</Notice>
          <Button label={es.common.retry} kind="secondary" onPress={preview.reload} />
        </View>
      ) : null}
      {p ? (
        <View style={styles.group}>
          <AppText>{t.dialog.intro}</AppText>
          {stale ? <Notice tone="secondary">{t.dialog.stale}</Notice> : null}
          {isSimple(p) ? (
            <AppText tone="secondary">{t.dialog.simple}</AppText>
          ) : (
            <View style={styles.group} accessible accessibilityLabel={t.dialog.affectedTitle}>
              <AppText kind="titleS">{t.dialog.affectedTitle}</AppText>
              {affectedLines(p, t.affected).map((line) => (
                <AppText key={line}>{`• ${line}`}</AppText>
              ))}
            </View>
          )}
          {p.returns_to.length > 0 ? <AppText tone="secondary">{t.dialog.returnsTo.replace("{list}", p.returns_to.map((a) => a.label).join(", "))}</AppText> : null}
          {hasReconciled(p) ? (
            <View style={styles.group}>
              <AppText kind="titleS">{t.reconciled.title}</AppText>
              <AppText>{t.reconciled.body.replace("{n}", String(p.reconciled.entries))}</AppText>
              {scope.kind !== "household"
                ? p.reconciled.reconciliations.map((r) => <Button key={r.id} label={t.reconciled.reopen} kind="secondary" onPress={() => void reopen(r.id)} />)
                : null}
            </View>
          ) : null}
          {reopened && !hasReconciled(p) ? <AppText tone="positive">{t.reconciled.reopened}</AppText> : null}
          {state.name === "failed" && !stale ? <Notice>{state.network ? es.common.network : (t.errors[state.code] ?? es.common.generic)}</Notice> : null}
          {!canWrite ? <Notice tone="secondary">{t.dialog.readOnly}</Notice> : null}
          {state.name === "done" ? (
            <AppText tone="positive" accessibilityLiveRegion="polite">
              {t.dialog.deleted}
            </AppText>
          ) : null}
          <Button label={state.name === "working" ? t.dialog.working : isSimple(p) ? t.dialog.confirm : t.dialog.confirmAll} kind="danger" busy={state.name === "working"} disabled={!canWrite || state.name === "done"} onPress={() => void confirm()} />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({ group: { gap: space[8] } });
