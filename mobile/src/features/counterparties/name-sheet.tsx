import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { fold, takenName, type OnConflict } from "@core/counterparties";
import { createIntents } from "@/api/ids";
import { useFms } from "@/auth/use-session";
import { bumpData } from "@/features/common/invalidate";
import { onMemoryWipe } from "@/features/common/memory";
import { paths } from "@/features/common/paths";
import { scopedPath } from "@/features/scope/scope";
import { useScope } from "@/features/scope/store";
import { es } from "@/i18n/es";
import { space } from "@/theme/tokens";
import { AppText, Button, Field, Notice } from "@/ui/primitives";
import { Sheet } from "@/ui/sheet";

const t = es.counterparties;
const intents = createIntents();
onMemoryWipe(() => intents.done());

/**
 * «Ponerle nombre» desde un movimiento (2026-11-16): el servidor lee la cuenta (celular, QR, PSE) de su descripción y le pone el nombre a **esa cuenta**,
 * así queda en todos los movimientos de ella. Si la cuenta ya tenía otro nombre responde `409 identifier_taken` con el nombre actual y aquí se
 * pregunta «¿Actualizar "anterior" → "nuevo"?» o «Crear otro». Nada de esto guarda datos en el teléfono.
 */
export function NameSheet({ open, movementId, onClose, onDone }: { open: boolean; movementId: string; onClose: () => void; onDone: (name: string) => void }) {
  const fms = useFms();
  const scope = useScope();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function save(onConflict?: OnConflict) {
    const wanted = name.trim();
    if (wanted === "" || busy) return;
    setBusy(true);
    setFailed(false);
    const body = { name: wanted, ...(onConflict ? { on_conflict: onConflict } : {}) };
    const result = await fms.post(scopedPath(paths.movementCounterparty(movementId), scope), body, { idempotencyKey: intents.keyFor(JSON.stringify([movementId, body])) });
    setBusy(false);
    if (result.ok) {
      intents.done();
      bumpData();
      setConflict(null);
      setName("");
      onDone(wanted);
      return;
    }
    const current = result.status === 409 && result.code === "identifier_taken" ? takenName(result.data) : null;
    if (current !== null && fold(current) !== fold(wanted)) setConflict(current);
    else setFailed(true);
  }

  const wanted = name.trim();
  return (
    <Sheet open={open} title={conflict ? t.conflictTitle : t.title} onClose={onClose}>
      {conflict ? (
        <View style={styles.group}>
          <AppText>{t.conflictAsk(conflict, wanted)}</AppText>
          <AppText tone="secondary">{t.conflictHelp(conflict, wanted)}</AppText>
          <Button label={t.conflictRename} busy={busy} onPress={() => void save("rename")} />
          <Button label={t.conflictMove} kind="secondary" busy={busy} onPress={() => void save("move")} />
        </View>
      ) : (
        <View style={styles.group}>
          <AppText tone="secondary">{t.intro}</AppText>
          <Field label={t.field} value={name} onChangeText={setName} maxLength={80} autoCapitalize="words" />
          <AppText kind="caption" tone="secondary">
            {t.hint}
          </AppText>
          {failed ? <Notice>{t.failed}</Notice> : null}
          <Button label={busy ? t.saving : t.save} busy={busy} disabled={wanted === ""} onPress={() => void save()} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[8] },
});
