import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import type { components } from "@core/api/schema.gen";
import { formatDate, formatPeriod, periodOf, shiftPeriod, todayBogota } from "@core/dates";
import { useFms } from "@/auth/use-session";
import { useDataVersion } from "@/features/common/invalidate";
import { paths } from "@/features/common/paths";
import { useResource } from "@/features/common/use-resource";
import { Keypad } from "@/features/quick-add/keypad";
import { displayAmount, fromApiAmount, pressKey, toAmount } from "@/features/quick-add/keypad-logic";
import { movementAccounts } from "@/features/quick-add/logic";
import { canWrite, scopedPath, scopeKey } from "@/features/scope/scope";
import { useHouseholds, useScope } from "@/features/scope/store";
import { es } from "@/i18n/es";
import { radius, space, type } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";
import { Money } from "@/ui/money";
import { AppText, Button, Chip, Notice } from "@/ui/primitives";
import { Sheet } from "@/ui/sheet";
import { DeleteSheet } from "@/features/trash/delete-sheet";
import { groupByDay, hasFilters, NO_FILTERS, searchBody, signedAmount, type Filters, type Movement, type StatusFilter, type TypeFilter } from "./logic";

const t = es.movements;
type Account = components["schemas"]["Account"];
type Page = { count: number; page: number; results: Movement[] };
const PAGE_SIZE = 30;

/**
 * Historial de movimientos con filtros. La lista se pide SIEMPRE con `POST movements/search`: los filtros (incluidos los montos)
 * van en el cuerpo y nunca en la URL ni en el registro de nginx. Todo vive en memoria.
 */
export function MovementsList() {
  const fms = useFms();
  const scope = useScope();
  const version = useDataVersion();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; items: Movement[]; page: number; count: number; failure: "network" | "server" | null }>({ key: "", items: [], page: 0, count: 0, failure: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [deleting, setDeleting] = useState<Movement | null>(null);
  const households = useHouseholds();
  const accounts = useResource<{ results: Account[] }>(scopedPath(paths.accounts, scope));
  // Cada cambio de filtros, ámbito o datos es una consulta nueva; mientras llega, `loading` es verdadero.
  const key = `${scopeKey(scope)}|${JSON.stringify(filters)}|${version}|${attempt}`;
  const loading = state.key !== key;
  const current = useRef(key);
  useEffect(() => {
    current.current = key;
  }, [key]);

  useEffect(() => {
    let alive = true;
    void fms.post<Page>(scopedPath(paths.movementsSearch, scope), searchBody(filters, 1, PAGE_SIZE)).then((result) => {
      if (!alive) return;
      if (!result.ok) setState({ key, items: [], page: 0, count: 0, failure: result.status === 0 ? "network" : "server" });
      else setState({ key, items: result.data.results, page: 1, count: result.data.count, failure: null });
    });
    return () => {
      alive = false;
    };
  }, [fms, scope, filters, key]);

  async function loadMore() {
    const asked = key;
    setLoadingMore(true);
    const result = await fms.post<Page>(scopedPath(paths.movementsSearch, scope), searchBody(filters, state.page + 1, PAGE_SIZE));
    setLoadingMore(false);
    if (asked !== current.current || !result.ok) return;
    setState((now) => (now.key === asked ? { ...now, items: [...now.items, ...result.data.results], page: now.page + 1, count: result.data.count } : now));
  }

  const groups = groupByDay(state.items);
  const filtered = hasFilters(filters);
  const more = state.items.length < state.count;

  return (
    <View style={styles.fill}>
      <View style={styles.bar}>
        <View style={styles.chips}>
          {(["all", "income", "expense", "transfer"] as TypeFilter[]).map((type) => (
            <Chip key={type} label={t[type]} selected={filters.type === type} onPress={() => setFilters({ ...filters, type })} />
          ))}
        </View>
        <View style={styles.chips}>
          <Chip label={filtered ? `${t.filters} •` : t.filters} a11yLabel={filtered ? `${t.filters}, activos` : t.filters} selected={filtered} onPress={() => setOpen(true)} />
          {filtered ? <Chip label={t.clearFilters} onPress={() => setFilters(NO_FILTERS)} /> : null}
        </View>
      </View>
      {state.failure ? (
        <View style={styles.pad}>
          <Notice>{state.failure === "network" ? es.common.network : t.loadFailed}</Notice>
          <Button label={es.common.retry} kind="secondary" onPress={() => setAttempt((n) => n + 1)} />
        </View>
      ) : null}
      {loading && !state.failure ? <ActivityIndicator accessibilityLabel={es.common.loading} style={styles.pad} /> : null}
      {!loading && !state.failure && state.items.length === 0 ? (
        <View style={styles.pad}>
          <AppText kind="titleS">{filtered ? t.noMatch : t.empty}</AppText>
          <AppText tone="secondary">{filtered ? t.noMatchBody : t.emptyBody}</AppText>
          {filtered ? <Button label={t.clearFilters} kind="secondary" onPress={() => setFilters(NO_FILTERS)} /> : null}
        </View>
      ) : null}
      <FlatList
        data={groups}
        keyExtractor={(group) => group.date}
        contentContainerStyle={styles.list}
        renderItem={({ item: group }) => (
          <View style={styles.day}>
            <View style={styles.dayHeader} accessible accessibilityRole="header">
              <AppText kind="label" tone="secondary">
                {formatDate(group.date)}
              </AppText>
              <Money value={group.net} kind="caption" tone="secondary" sign="always" />
            </View>
            {group.items.map((movement) => (
              <MovementRow key={movement.id} movement={movement} onDelete={() => setDeleting(movement)} />
            ))}
          </View>
        )}
        ListFooterComponent={more && !state.failure ? <Button label={t.more} kind="secondary" busy={loadingMore} onPress={() => void loadMore()} /> : undefined}
      />
      <DeleteSheet
        open={deleting !== null}
        kind="movement"
        id={deleting?.id ?? ""}
        name={deleting ? (deleting.counterparty?.name ?? deleting.description ?? deleting.category?.name ?? t.untitled) : ""}
        canWrite={canWrite(scope, households)}
        onClose={() => setDeleting(null)}
        onDone={() => setDeleting(null)}
      />
      <FilterSheet open={open} onClose={() => setOpen(false)} filters={filters} onChange={setFilters} accounts={movementAccounts(accounts.data?.results ?? [])} />
    </View>
  );
}

function MovementRow({ movement, onDelete }: { movement: Movement; onDelete: () => void }) {
  const c = useTheme();
  const signed = signedAmount(movement);
  const title = movement.counterparty?.name ?? movement.description ?? movement.category?.name ?? t.untitled;
  const sub = [movement.category?.name, movement.payment_method?.name ?? movement.account.name].filter(Boolean).join(" · ");
  const pending = movement.status === "pendiente";
  const annulled = movement.status === "anulado" || movement.voided;
  return (
    <View style={[styles.row, { borderColor: c.border }]}>
      <View style={styles.rowMain}>
        <Text numberOfLines={1} style={[type.body, { color: c.textPrimary }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[type.caption, { color: c.textSecondary }]}>
          {sub}
          {pending || annulled ? ` · ${annulled ? t.voided : t.status.pendiente}` : ""}
        </Text>
      </View>
      <Money value={signed.value} sign={signed.sign} tone={pending || annulled ? "secondary" : "primary"} style={annulled ? { textDecorationLine: "line-through" } : undefined} />
      <Chip label={t.delete} a11yLabel={t.deleteOf(title)} onPress={onDelete} />
    </View>
  );
}

function AmountFilter({ label, value, onChange }: { label: string; value: string | null; onChange: (next: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(value ? fromApiAmount(value) : "");
  return (
    <View style={styles.group}>
      <AppText kind="label" tone="secondary">
        {label}
      </AppText>
      <AppText>{value ? displayAmount(fromApiAmount(value)) : t.noAmount}</AppText>
      {editing ? (
        <View style={styles.group}>
          <AppText kind="titleM" accessibilityLiveRegion="polite">
            {displayAmount(raw)}
          </AppText>
          <Keypad onKey={(key) => setRaw(pressKey(raw, key))} onClear={() => setRaw("")} />
          <Button
            label={t.setAmount}
            onPress={() => {
              onChange(toAmount(raw));
              setEditing(false);
            }}
          />
        </View>
      ) : (
        <View style={styles.chips}>
          <Chip label={t.setAmount} onPress={() => setEditing(true)} a11yLabel={`${t.setAmount} ${label}`} />
          {value ? (
            <Chip
              label={t.removeAmount}
              onPress={() => {
                setRaw("");
                onChange(null);
              }}
              a11yLabel={`${t.removeAmount} ${label}`}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

function FilterSheet({ open, onClose, filters, onChange, accounts }: { open: boolean; onClose: () => void; filters: Filters; onChange: (next: Filters) => void; accounts: Account[] }) {
  const current = periodOf(todayBogota());
  return (
    <Sheet open={open} title={t.filters} onClose={onClose}>
      <View style={styles.group}>
        <AppText kind="label" tone="secondary">
          {t.period}
        </AppText>
        <View style={styles.chips}>
          <Chip label={t.allPeriods} selected={filters.period === null} onPress={() => onChange({ ...filters, period: null })} />
          <Chip label={filters.period ? formatPeriod(filters.period) : formatPeriod(current)} selected={filters.period !== null} onPress={() => onChange({ ...filters, period: filters.period ?? current })} />
        </View>
        {filters.period ? (
          <View style={styles.chips}>
            <Chip label="‹" a11yLabel={es.summary.previousPeriod} onPress={() => onChange({ ...filters, period: shiftPeriod(filters.period as string, -1) })} />
            <Chip label="›" a11yLabel={es.summary.nextPeriod} onPress={() => onChange({ ...filters, period: filters.period && filters.period < current ? shiftPeriod(filters.period, 1) : filters.period })} />
          </View>
        ) : null}
      </View>
      <View style={styles.group}>
        <AppText kind="label" tone="secondary">
          {t.statusAll}
        </AppText>
        <View style={styles.chips}>
          {(["all", "pendiente", "confirmado", "conciliado", "anulado"] as StatusFilter[]).map((status) => (
            <Chip key={status} label={status === "all" ? t.statusAll : t.status[status]} selected={filters.status === status} onPress={() => onChange({ ...filters, status })} />
          ))}
        </View>
      </View>
      {accounts.length > 0 ? (
        <View style={styles.group}>
          <AppText kind="label" tone="secondary">
            {t.account}
          </AppText>
          <View style={styles.chips}>
            <Chip label={t.anyAccount} selected={filters.accountId === null} onPress={() => onChange({ ...filters, accountId: null })} />
            {accounts.map((account) => (
              <Chip key={account.id} label={account.name} selected={filters.accountId === account.id} onPress={() => onChange({ ...filters, accountId: account.id })} />
            ))}
          </View>
        </View>
      ) : null}
      <AmountFilter key={`min-${filters.minAmount ?? ""}`} label={t.minAmount} value={filters.minAmount} onChange={(next) => onChange({ ...filters, minAmount: next })} />
      <AmountFilter key={`max-${filters.maxAmount ?? ""}`} label={t.maxAmount} value={filters.maxAmount} onChange={(next) => onChange({ ...filters, maxAmount: next })} />
      <Button label={t.clearFilters} kind="ghost" onPress={() => onChange(NO_FILTERS)} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { padding: space[16], gap: space[8] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[8] },
  pad: { padding: space[16], gap: space[8] },
  list: { paddingHorizontal: space[16], paddingBottom: space[24] },
  day: { gap: space[2] },
  dayHeader: { flexDirection: "row", justifyContent: "space-between", paddingTop: space[12], paddingBottom: space[4] },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[12], borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: radius.xs },
  rowMain: { flex: 1, gap: space[2] },
  group: { gap: space[8] },
});
