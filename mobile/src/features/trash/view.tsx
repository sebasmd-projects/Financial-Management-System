import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { trashApi, trashPaths, type Deletion } from "@core/trash";
import { useFms } from "@/auth/use-session";
import { bumpData } from "@/features/common/invalidate";
import { useResource } from "@/features/common/use-resource";
import { canWrite, scopedPath } from "@/features/scope/scope";
import { useHouseholds, useScope } from "@/features/scope/store";
import { es } from "@/i18n/es";
import { space } from "@/theme/tokens";
import { AppText, Button, Card, Notice, Screen, Title } from "@/ui/primitives";
import { affectedLines, daysLeftText, deletedByText, scopedClient } from "./logic";

const t = es.trash;

/** «Papelera»: lo eliminado que aún se puede restaurar (30 días), con los días que quedan. Todo vive en memoria. */
export function TrashScreen() {
  const fms = useFms();
  const scope = useScope();
  const households = useHouseholds();
  const api = useMemo(() => trashApi(scopedClient(fms, scope)), [fms, scope]);
  const list = useResource<Deletion[]>(scopedPath(trashPaths.list, scope));
  const [note, setNote] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const writable = canWrite(scope, households);

  async function restore(row: Deletion) {
    if (busy) return;
    setBusy(row.id);
    setFailure(null);
    const result = await api.restore(row.id);
    setBusy(null);
    if (result.ok) {
      setNote(t.restored);
      bumpData();
      list.reload();
    } else setFailure(result.status === 0 ? es.common.network : (t.errors[result.code] ?? es.common.generic));
  }

  return (
    <Screen>
      <Title>{t.title}</Title>
      <AppText tone="secondary">{t.intro}</AppText>
      {note ? (
        <AppText tone="positive" accessibilityLiveRegion="polite">
          {note}
        </AppText>
      ) : null}
      {failure ? <Notice>{failure}</Notice> : null}
      {list.failure ? (
        <View style={styles.group}>
          <Notice>{list.failure === "network" ? es.common.network : t.loadFailed}</Notice>
          <Button label={es.common.retry} kind="secondary" onPress={list.reload} />
        </View>
      ) : null}
      {list.data && list.data.length === 0 ? (
        <Card>
          <AppText kind="titleS">{t.emptyTitle}</AppText>
          <AppText tone="secondary">{t.emptyBody}</AppText>
        </Card>
      ) : null}
      {(list.data ?? []).map((row) => {
        const also = affectedLines(row, t.affected);
        return (
          <Card key={row.id}>
            <AppText kind="titleS">{row.label || (t.kinds[row.kind] ?? row.kind)}</AppText>
            <AppText tone="secondary">{t.kinds[row.kind] ?? row.kind}</AppText>
            <AppText kind="caption" tone="secondary">
              {deletedByText(row, t)}
            </AppText>
            <AppText kind="caption" tone="secondary">
              {daysLeftText(row, t)}
            </AppText>
            {also.length > 0 ? (
              <AppText kind="caption" tone="secondary">
                {t.alsoFell.replace("{list}", also.join(", "))}
              </AppText>
            ) : null}
            {writable ? <Button label={busy === row.id ? t.restoring : t.restore} kind="secondary" busy={busy === row.id} onPress={() => void restore(row)} /> : null}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({ group: { gap: space[8] } });
