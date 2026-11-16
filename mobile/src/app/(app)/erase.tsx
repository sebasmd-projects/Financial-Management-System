import { useMemo, useState } from "react";
import { Linking, View } from "react-native";
import { useRouter } from "expo-router";
import { canErase, countRows, eraseApi, hasAnything, householdGroups, phraseFor, sharedAccountsLeft, type ErasePreview } from "@core/erase";
import { createIntents } from "@/api/ids";
import { useFms, useSession } from "@/auth/use-session";
import { WEB_PAGES, apiOrigin } from "@/config";
import { onMemoryWipe } from "@/features/common/memory";
import { useResource } from "@/features/common/use-resource";
import { es } from "@/i18n/es";
import { AppText, Button, Card, Field, Notice, Screen, Title } from "@/ui/primitives";

const t = es.erase;
/** Una `Idempotency-Key` por intención (regla 9): reintentar el mismo borrado manda la misma clave. Solo en memoria. */
const intents = createIntents();
onMemoryWipe(() => intents.done());

/**
 * «Borrar todos mis datos de Finanzas» en la app (propietario, 2026-11-15): vista previa del servidor, aviso de las copias de seguridad, frase
 * escrita y, al confirmar, el cliente HTTP abre el aviso de reautenticación y repite la petición. Exportar antes se hace en la web (la app no
 * descarga archivos): el botón la abre. Tras borrar, la sesión vuelve a leer `/me` y la app pasa a la activación.
 */
export default function Erase() {
  const fms = useFms();
  const session = useSession();
  const router = useRouter();
  const api = useMemo(() => eraseApi(fms), [fms]);
  const preview = useResource<ErasePreview>("/me/erase/preview");
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<{ name: "idle" } | { name: "working" } | { name: "failed"; code: string; network: boolean }>({ name: "idle" });
  const p = preview.data;
  const ready = canErase(p, typed, "es") && state.name !== "working";

  async function confirm() {
    if (!ready) return;
    setState({ name: "working" });
    const result = await api.erase(typed, intents.keyFor("erase"));
    if (result.ok) {
      intents.done();
      setTyped("");
      await session.afterErase();
      return;
    }
    setState({ name: "failed", code: result.code, network: result.status === 0 });
  }

  const groups = p ? householdGroups(p) : null;
  return (
    <Screen>
      <Title>{t.title}</Title>
      <AppText tone="secondary">{t.intro}</AppText>
      {preview.loading && !p ? <AppText tone="secondary">{t.loading}</AppText> : null}
      {preview.failure ? (
        <View style={{ gap: 8 }}>
          <Notice>{preview.failure === "network" ? es.common.network : t.loadFailed}</Notice>
          <Button label={es.common.retry} kind="secondary" onPress={preview.reload} />
        </View>
      ) : null}
      {p && groups ? (
        <View style={{ gap: 12 }}>
          <Notice>{t.irreversible}</Notice>
          <Card>
            {hasAnything(p) ? (
              <>
                <AppText kind="titleS">{t.willDelete}</AppText>
                {countRows(p).map((row) => (
                  <AppText key={row.key}>{`• ${t.counts[row.key]}: ${row.count}`}</AppText>
                ))}
                {p.in_trash > 0 ? <AppText>{`• ${t.inTrash}: ${p.in_trash}`}</AppText> : null}
              </>
            ) : (
              <AppText tone="secondary">{t.nothing}</AppText>
            )}
          </Card>
          {groups.leave.length > 0 ? (
            <Card>
              <AppText kind="titleS">{t.leaveTitle}</AppText>
              {groups.leave.map((h) => (
                <AppText key={h.id}>{`• ${h.name}`}</AppText>
              ))}
              <AppText tone="secondary">{t.leaveBody(sharedAccountsLeft(p))}</AppText>
            </Card>
          ) : null}
          {groups.delete.length > 0 ? (
            <Card>
              <AppText kind="titleS">{t.deleteTitle}</AppText>
              {groups.delete.map((h) => (
                <AppText key={h.id}>{`• ${h.name}`}</AppText>
              ))}
              <AppText tone="secondary">{t.deleteBody}</AppText>
            </Card>
          ) : null}
          {groups.blocked.length > 0 ? (
            <Card>
              <AppText kind="titleS">{t.blockedTitle}</AppText>
              {groups.blocked.map((h) => (
                <AppText key={h.id}>{`• ${h.name}`}</AppText>
              ))}
              <AppText tone="secondary">{t.blockedBody}</AppText>
            </Card>
          ) : null}
          {hasAnything(p) && p.export_recommended ? (
            <Card>
              <AppText kind="titleS">{t.exportTitle}</AppText>
              <AppText tone="secondary">{t.exportBody}</AppText>
              <Button label={t.exportOpen} kind="secondary" onPress={() => void Linking.openURL(`${apiOrigin()}${WEB_PAGES.export}`).catch(() => undefined)} />
            </Card>
          ) : null}
          <Card>
            <AppText kind="titleS">{t.backupTitle}</AppText>
            <AppText tone="secondary">{t.backupBody}</AppText>
          </Card>
          {!p.blocked ? <Field label={t.phraseLabel(phraseFor("es", p))} value={typed} onChangeText={setTyped} autoCapitalize="characters" maxLength={64} /> : null}
          {!p.blocked ? <AppText kind="caption" tone="secondary">{t.phraseHint}</AppText> : null}
          {state.name === "failed" ? <Notice>{state.network ? es.common.network : (t.errors[state.code] ?? es.common.generic)}</Notice> : null}
          <Button label={state.name === "working" ? t.working : t.confirm} kind="danger" busy={state.name === "working"} disabled={!ready} onPress={() => void confirm()} />
        </View>
      ) : null}
      <Button label={es.common.back} kind="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
