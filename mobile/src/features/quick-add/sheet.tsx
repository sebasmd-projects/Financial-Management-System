import { useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFms } from "@/auth/use-session";
import { bumpData } from "@/features/common/invalidate";
import { paths } from "@/features/common/paths";
import { useResource } from "@/features/common/use-resource";
import { canWrite, scopedPath } from "@/features/scope/scope";
import { useHouseholds, useScope } from "@/features/scope/store";
import { es } from "@/i18n/es";
import { space } from "@/theme/tokens";
import { AppText, Button, Chip, Notice } from "@/ui/primitives";
import { Keypad } from "./keypad";
import { displayAmount, pressKey, toAmount, type Key } from "./keypad-logic";
import { defaultAccount, effectPhrase, movementAccounts, topByFrequency, warningText, type Account, type Category, type Movement } from "./logic";
import { saveMovement } from "./save";
import { clearQuickAdd, EMPTY_DRAFT, draftStore, useDraft, type QuickType } from "./store";

type Page<T> = { results: T[] };
type Status = { name: "idle" } | { name: "saving" } | { name: "failed"; network: boolean } | { name: "saved"; movement: Movement };

const t = es.quick;

/**
 * Alta rápida (diseño §3.2): una hoja con el borrador en memoria, el teclado numérico propio y «Guardar». Desde un atajo del
 * Resumen llega con monto, categoría y descripción, así que son DOS toques: el atajo y «Guardar». Si falla, «Reintentar» reenvía
 * con la MISMA `Idempotency-Key` (una intención, una clave). Nada de esto toca el disco.
 */
export function QuickAddSheet({ onClose }: { onClose: () => void }) {
  const fms = useFms();
  const scope = useScope();
  const households = useHouseholds();
  const stored = useDraft();
  const draft = stored ?? EMPTY_DRAFT;
  const accounts = useResource<Page<Account>>(scopedPath(paths.accounts, scope));
  const categories = useResource<Page<Category>>(scopedPath(paths.categories, scope));
  const recents = useResource<Page<Movement>>(scopedPath(paths.recentMovements, scope));
  const [status, setStatus] = useState<Status>({ name: "idle" });
  const busy = useRef(false);

  const usable = movementAccounts(accounts.data?.results ?? []);
  const recentItems = (recents.data?.results ?? []).filter((m) => !m.voided && m.type !== "transfer");
  const accountId = draft.accountId && usable.some((a) => a.id === draft.accountId) ? draft.accountId : defaultAccount(usable, recentItems);
  const account = usable.find((a) => a.id === accountId) ?? null;
  const kind = draft.type === "income" ? "income" : "expense";
  const allCategories = (categories.data?.results ?? []).filter((c) => c.kind === kind);
  const frequent = topByFrequency(
    recentItems.filter((m) => m.type === draft.type),
    (m) => m.category?.id ?? null,
    5,
  );
  const shown = [...new Set([...(draft.categoryId ? [draft.categoryId] : []), ...frequent])]
    .map((id) => allCategories.find((c) => c.id === id))
    .filter((c): c is Category => c !== undefined);

  const amount = toAmount(draft.amount);
  const writable = canWrite(scope, households);
  const set = (patch: Partial<typeof draft>) => draftStore.set({ ...draft, ...patch });
  const ready = amount !== null && account !== null && writable && status.name !== "saving";

  async function save() {
    if (!ready || busy.current) return;
    busy.current = true;
    setStatus({ name: "saving" });
    const result = await saveMovement({ post: fms.post, scope }, { type: draft.type, amount, accountId: account.id, categoryId: draft.categoryId, description: draft.description });
    busy.current = false;
    if (result.ok) {
      bumpData();
      setStatus({ name: "saved", movement: result.movement });
    } else {
      setStatus({ name: "failed", network: result.network });
    }
  }

  if (status.name === "saved") {
    return (
      <View style={styles.body}>
        <AppText kind="titleL" accessibilityRole="header">
          {status.movement.status === "pendiente" ? t.savedPending : t.saved}
        </AppText>
        {(status.movement.warnings ?? []).map((warning, index) => (
          <Notice key={`${warning.code}-${index}`} tone="secondary">
            {warningText(warning)}
          </Notice>
        ))}
        <Button
          label={t.addAnother}
          kind="secondary"
          onPress={() => {
            draftStore.set(EMPTY_DRAFT);
            setStatus({ name: "idle" });
          }}
        />
        <Button
          label={t.done}
          onPress={() => {
            clearQuickAdd();
            onClose();
          }}
        />
      </View>
    );
  }

  const onKey = (key: Key) => set({ amount: pressKey(draft.amount, key) });
  const phrase = effectPhrase(draft.type, account);
  const loading = accounts.loading && !accounts.data;

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View accessibilityRole="toolbar" accessibilityLabel={t.typeLabel} style={styles.chips}>
          {(["expense", "income"] as QuickType[]).map((type) => (
            <Chip key={type} label={t[type]} selected={draft.type === type} onPress={() => set({ type, categoryId: null })} />
          ))}
        </View>
        <AppText kind="display" accessibilityLiveRegion="polite" style={{ textAlign: "center" }}>
          {displayAmount(draft.amount)}
        </AppText>
        {draft.amount === "" ? (
          <AppText kind="caption" tone="secondary" style={{ textAlign: "center" }}>
            {t.amountEmpty}
          </AppText>
        ) : null}
        {draft.description ? (
          <AppText tone="secondary" style={{ textAlign: "center" }}>
            {draft.description}
          </AppText>
        ) : null}
        {phrase ? (
          <AppText kind="bodyS" tone="secondary" style={{ textAlign: "center" }}>
            {phrase}
          </AppText>
        ) : null}
        {!writable ? <Notice>{t.readOnly}</Notice> : null}
        {accounts.failure ? <Notice>{t.loadFailed}</Notice> : null}
        {accounts.data && usable.length === 0 ? (
          <View>
            <AppText kind="titleS">{t.noAccountsTitle}</AppText>
            <AppText tone="secondary">{t.noAccountsBody}</AppText>
          </View>
        ) : null}
        {usable.length > 0 ? (
          <View style={styles.group}>
            <AppText kind="label" tone="secondary">
              {t.account}
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {usable.map((a) => (
                <Chip key={a.id} label={a.name} selected={a.id === accountId} onPress={() => set({ accountId: a.id })} />
              ))}
            </ScrollView>
          </View>
        ) : null}
        {shown.length > 0 ? (
          <View style={styles.group}>
            <AppText kind="label" tone="secondary">
              {t.what}
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {shown.map((c) => (
                <Chip key={c.id} label={c.name} selected={c.id === draft.categoryId} onPress={() => set({ categoryId: c.id === draft.categoryId ? null : c.id })} />
              ))}
            </ScrollView>
          </View>
        ) : null}
        <AppText kind="caption" tone="secondary">
          {t.transferWeb}
        </AppText>
        <Keypad onKey={onKey} onClear={() => set({ amount: "" })} />
        {status.name === "failed" ? <Notice>{status.network ? t.failedNetwork : t.failed}</Notice> : null}
        <Button label={status.name === "saving" ? t.saving : status.name === "failed" ? t.retry : t.save} busy={status.name === "saving"} disabled={!ready || loading} onPress={() => void save()} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: space[16], gap: space[12] },
  chips: { flexDirection: "row", gap: space[8] },
  group: { gap: space[4] },
});
