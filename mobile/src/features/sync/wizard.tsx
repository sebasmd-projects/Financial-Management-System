import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { components } from "@core/api/schema.gen";
import { formatDate } from "@core/dates";
import { activeForwardingCode, createConnectionBody, hasConnection, isBankAccount, offeredInstitutions, offeredProviders, type Provider, type SyncCatalog, type SyncConnection } from "@core/sync";
import { createIntents } from "@/api/ids";
import { onMemoryWipe } from "@/features/common/memory";
import { paths } from "@/features/common/paths";
import { useResource } from "@/features/common/use-resource";
import { scopedPath } from "@/features/scope/scope";
import { useScope } from "@/features/scope/store";
import { es } from "@/i18n/es";
import { space } from "@/theme/tokens";
import { AppText, Button, Check, Chip, Field, Notice } from "@/ui/primitives";
import { AddressBlock, Guide } from "./guide";
import { failureText, fill } from "./logic";
import { useSyncApi } from "./use-sync";

type Account = components["schemas"]["Account"];
const w = es.sync.wizard;
const POLL_MS = 8000;
/** Una `Idempotency-Key` por intención (crear y rotar): reintentar lo mismo manda la misma clave. Solo en memoria. */
const intents = createIntents();
onMemoryWipe(() => intents.done());

/**
 * «Conectar un banco» en la app (M1): elegir banco (Nequi y Nu incluidos: solo se activan aquí), cuenta y proveedor → crear la dirección única →
 * mostrarla UNA vez → el filtro paso a paso, el código de Gmail y el monto mínimo → «Comprobar si llegó». Crear pide reautenticación (la app abre el
 * aviso sola y repite la petición con la misma clave). La dirección vive solo en el estado de esta pantalla.
 */
export function Wizard({ catalog, existing, presetInstitutionId, onDone }: { catalog: SyncCatalog; existing: readonly SyncConnection[]; presetInstitutionId: number | null; onDone: () => void }) {
  const api = useSyncApi();
  const scope = useScope();
  const institutions = useMemo(() => offeredInstitutions(catalog, "app"), [catalog]);
  const providers = useMemo(() => offeredProviders(catalog), [catalog]);
  const accounts = useResource<{ results: Account[] }>(scopedPath(paths.accounts, scope));
  const banks = useMemo(() => (accounts.data?.results ?? []).filter(isBankAccount), [accounts.data]);
  const [institutionId, setInstitutionId] = useState<number | null>(presetInstitutionId);
  const [accountId, setAccountId] = useState("");
  const [provider, setProvider] = useState<Provider>(providers[0] ?? "gmail");
  const [label, setLabel] = useState("");
  const [statements, setStatements] = useState(true);
  const [state, setState] = useState<{ name: "idle" } | { name: "working" } | { name: "failed"; message: string }>({ name: "idle" });
  const [created, setCreated] = useState<SyncConnection | null>(null);
  const duplicate = institutionId !== null && accountId !== "" && hasConnection(existing, institutionId, accountId);

  async function create() {
    if (institutionId === null || !accountId || state.name === "working") return;
    setState({ name: "working" });
    const body = createConnectionBody({ institutionId, accountId, provider, label, includeStatements: statements, locale: "es" });
    const result = await api.createConnection(body, intents.keyFor(JSON.stringify(body)));
    if (result.ok) {
      intents.done();
      setState({ name: "idle" });
      setCreated(result.data);
    } else setState({ name: "failed", message: failureText(result) });
  }

  if (created) return <Created connection={created} onDone={onDone} onReplace={setCreated} />;
  return (
    <View style={styles.group}>
      <AppText kind="titleS" accessibilityRole="header">
        {w.step1}
      </AppText>
      <AppText kind="label" tone="secondary">
        {w.institution}
      </AppText>
      <View style={styles.chips}>
        {institutions.map((i) => (
          <Chip key={i.id} label={i.name} selected={institutionId === i.id} onPress={() => setInstitutionId(i.id)} />
        ))}
      </View>
      <AppText kind="label" tone="secondary">
        {w.account}
      </AppText>
      {accounts.data && banks.length === 0 ? <AppText tone="secondary">{w.noAccounts}</AppText> : null}
      <View style={styles.chips}>
        {banks.map((a) => (
          <Chip key={a.id} label={a.last4 ? `${a.name} ••${a.last4}` : a.name} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />
        ))}
      </View>
      <AppText kind="label" tone="secondary">
        {w.provider}
      </AppText>
      <View style={styles.chips}>
        {providers.map((p) => (
          <Chip key={p} label={es.sync.providers[p] ?? p} selected={provider === p} onPress={() => setProvider(p)} />
        ))}
      </View>
      <Field label={w.label} value={label} onChangeText={setLabel} maxLength={60} />
      <Check label={w.statements} hint={w.statementsHint} value={statements} onChange={setStatements} />
      {duplicate ? <Notice tone="secondary">{w.duplicate}</Notice> : null}
      {state.name === "failed" ? <Notice>{state.message}</Notice> : null}
      <Button label={state.name === "working" ? w.creating : w.create} busy={state.name === "working"} disabled={institutionId === null || !accountId} onPress={() => void create()} />
    </View>
  );
}

/**
 * Después de crear o rotar: la dirección, la guía y «Comprobar». Mientras la hoja esté abierta se vuelve a preguntar cada 8 s por la conexión:
 * así llegan solos el código de confirmación de Gmail y el primer correo.
 */
export function Created({ connection, onDone, onReplace }: { connection: SyncConnection; onDone: () => void; onReplace: (next: SyncConnection) => void }) {
  const api = useSyncApi();
  const [live, setLive] = useState<SyncConnection>(connection);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [rotating, setRotating] = useState<{ name: "idle" } | { name: "working" } | { name: "failed"; message: string }>({ name: "idle" });
  const id = connection.id;

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void api.connection(id).then((result) => {
        if (active && result.ok) setLive((current) => ({ ...result.data, address: current.address }));
      });
    };
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, id]);

  async function check() {
    setChecking(true);
    const result = await api.connection(id);
    setChecking(false);
    setChecked(true);
    if (result.ok) setLive((current) => ({ ...result.data, address: current.address }));
  }
  async function rotate() {
    if (rotating.name === "working") return;
    setRotating({ name: "working" });
    const result = await api.rotate(id, intents.keyFor(`rotate:${id}`));
    if (result.ok) {
      intents.done();
      setRotating({ name: "idle" });
      setLive(result.data);
      onReplace(result.data);
    } else setRotating({ name: "failed", message: failureText(result) });
  }

  return (
    <View style={styles.group}>
      {live.address ? (
        <AddressBlock address={live.address} />
      ) : (
        <View style={styles.group}>
          <Notice tone="secondary">{w.lost}</Notice>
          <Button label={rotating.name === "working" ? es.sync.conn.working : es.sync.conn.rotate} busy={rotating.name === "working"} onPress={() => void rotate()} />
          {rotating.name === "failed" ? <Notice>{rotating.message}</Notice> : null}
        </View>
      )}
      <Guide provider={(live.provider ?? "other") as Provider} code={activeForwardingCode(live)} />
      <AppText kind="titleS" accessibilityRole="header">
        {w.step5}
      </AppText>
      <AppText>{w.testBody}</AppText>
      <Button label={checking ? w.testing : w.test} kind="secondary" busy={checking} onPress={() => void check()} />
      <AppText accessibilityLiveRegion="polite" tone={live.last_event_at ? "positive" : "secondary"}>
        {live.last_event_at ? fill(w.testArrived, { date: formatDate(live.last_event_at) }) : checked ? w.testWaiting : ""}
      </AppText>
      <Button label={w.done} onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[8] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[8] },
});
