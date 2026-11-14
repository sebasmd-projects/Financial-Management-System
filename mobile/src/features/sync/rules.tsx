import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { formatDate } from "@core/dates";
import { draftFromConditions, buildAutoRule, isAutoConfirmRule, suggestedRuleName, syncPaths, type CustomRule, type SyncCatalog, type SyncRuleSuggestion } from "@core/sync";
import { createIntents } from "@/api/ids";
import { bumpData } from "@/features/common/invalidate";
import { onMemoryWipe } from "@/features/common/memory";
import { paths } from "@/features/common/paths";
import { useResource } from "@/features/common/use-resource";
import { canWrite, scopedPath } from "@/features/scope/scope";
import { useHouseholds, useScope } from "@/features/scope/store";
import { es } from "@/i18n/es";
import { space } from "@/theme/tokens";
import { AppText, Button, Card, Notice, Screen, Title } from "@/ui/primitives";
import { describeConditions, failureText, fill } from "./logic";
import { useSyncApi } from "./use-sync";

const t = es.sync.rules;
const intents = createIntents();
onMemoryWipe(() => intents.done());

/**
 * Más → Reglas de autoconfirmación (M2, versión simple): la lista con la condición en lenguaje de persona, pausar, reactivar y borrar, y las
 * sugerencias (aceptar o descartar). Crear una regla a mano o editarla se hace en la web. Crear una regla —también aceptar una sugerencia— pide
 * reautenticación: la app abre el aviso sola y repite la petición. Son personales: en un hogar solo se avisa.
 */
export function RulesScreen() {
  const api = useSyncApi();
  const scope = useScope();
  const households = useHouseholds();
  const inHousehold = scope.kind === "household";
  const writable = canWrite(scope, households);
  const rules = useResource<{ results: CustomRule[] }>(inHousehold ? null : syncPaths.rules);
  const suggestions = useResource<{ results: SyncRuleSuggestion[] }>(inHousehold ? null : syncPaths.suggestions);
  const catalog = useResource<SyncCatalog>(inHousehold ? null : "/sync/catalog");
  const categories = useResource<{ results: { id: string; name: string }[] }>(inHousehold ? null : scopedPath(paths.categories, scope));
  const [note, setNote] = useState<{ text: string; tone: "positive" | "negative" } | null>(null);
  const list = (rules.data?.results ?? []).filter(isAutoConfirmRule);
  const institutions = catalog.data?.institutions ?? [];
  const institutionName = (code: string) => institutions.find((i) => i.code === code)?.name;
  const categoryName = (id: string | null) => (id ? categories.data?.results.find((c) => c.id === id)?.name : undefined);
  const done = (text: string) => {
    setNote({ text, tone: "positive" });
    bumpData();
    rules.reload();
    suggestions.reload();
  };

  async function toggle(rule: CustomRule) {
    const result = await api.patchRule(rule.id, { enabled: !rule.enabled });
    if (result.ok) done(rule.enabled ? t.pausedOk : t.resumedOk);
    else setNote({ text: failureText(result), tone: "negative" });
  }
  function confirmRemove(rule: CustomRule) {
    Alert.alert(t.removeTitle, fill(t.removeBody, { name: rule.name }), [
      { text: es.common.cancel, style: "cancel" },
      {
        text: t.removeYes,
        style: "destructive",
        onPress: () => {
          void (async () => {
            const result = await api.deleteRule(rule.id);
            if (result.ok) done(t.removedOk);
            else setNote({ text: failureText(result), tone: "negative" });
          })();
        },
      },
    ]);
  }
  function confirmAccept(suggestion: SyncRuleSuggestion) {
    const draft = draftFromConditions(suggestion.conditions);
    if (!draft) return;
    const built = buildAutoRule({ ...draft, name: suggestedRuleName(suggestion, t.suggestionPrefix) });
    if (!built.ok) return;
    Alert.alert(t.acceptTitle, `${t.acceptBody}\n${describeConditions(suggestion.conditions, institutionName).map((line) => `• ${line}`).join("\n")}`, [
      { text: es.common.cancel, style: "cancel" },
      {
        text: t.acceptYes,
        onPress: () => {
          void (async () => {
            const result = await api.createRule(built.body, intents.keyFor(JSON.stringify(built.body)));
            if (result.ok) {
              intents.done();
              done(t.created);
            } else setNote({ text: failureText(result), tone: "negative" });
          })();
        },
      },
    ]);
  }
  async function dismiss(suggestion: SyncRuleSuggestion) {
    const result = await api.dismissSuggestion(suggestion.key);
    if (result.ok) done(t.dismissed);
    else setNote({ text: failureText(result), tone: "negative" });
  }

  if (inHousehold) {
    return (
      <Screen>
        <Title>{t.title}</Title>
        <Notice tone="secondary">{t.personalOnly}</Notice>
      </Screen>
    );
  }
  return (
    <Screen>
      <Title>{t.title}</Title>
      <AppText tone="secondary">{t.intro}</AppText>
      <AppText kind="caption" tone="secondary">
        {t.webNote}
      </AppText>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {rules.loading && !rules.data ? <AppText tone="secondary">{es.common.loading}</AppText> : null}
      {rules.failure ? (
        <View style={styles.group}>
          <Notice>{rules.failure === "network" ? es.common.network : t.loadFailed}</Notice>
          <Button label={es.common.retry} kind="secondary" onPress={rules.reload} />
        </View>
      ) : null}

      {writable && suggestions.data && suggestions.data.results.length > 0 ? (
        <View style={styles.group}>
          <AppText kind="titleS" accessibilityRole="header">
            {t.suggestionsTitle}
          </AppText>
          <AppText tone="secondary">{t.suggestionsIntro}</AppText>
          {suggestions.data.results.map((s) => (
            <Card key={s.key}>
              <AppText kind="titleS">{fill(t.suggestionCount, { n: String(s.count) })}</AppText>
              {describeConditions(s.conditions, institutionName).map((line) => (
                <AppText key={line} kind="bodyS">{`• ${line}`}</AppText>
              ))}
              <Button label={t.accept} onPress={() => confirmAccept(s)} />
              <Button label={t.dismiss} kind="ghost" onPress={() => void dismiss(s)} />
            </Card>
          ))}
        </View>
      ) : null}

      {rules.data && list.length === 0 ? (
        <Card>
          <AppText kind="titleS">{t.emptyTitle}</AppText>
          <AppText tone="secondary">{t.emptyBody}</AppText>
        </Card>
      ) : null}
      {list.map((rule) => (
        <Card key={rule.id}>
          <AppText kind="titleS">{rule.name}</AppText>
          <AppText kind="caption" tone={rule.enabled ? "positive" : "secondary"}>
            {rule.enabled ? t.active : t.paused}
          </AppText>
          <AppText kind="label" tone="secondary">
            {t.when}
          </AppText>
          {describeConditions(rule.conditions, institutionName).map((line) => (
            <AppText key={line} kind="bodyS">{`• ${line}`}</AppText>
          ))}
          {categoryName(rule.action_category_id) ? <AppText kind="bodyS">{fill(t.withCategory, { name: categoryName(rule.action_category_id) as string })}</AppText> : null}
          {rule.action_counterparty ? <AppText kind="bodyS">{fill(t.withCounterparty, { name: rule.action_counterparty })}</AppText> : null}
          <AppText kind="caption" tone="secondary">
            {rule.applied_count === 1 ? t.appliedOne : fill(t.applied, { n: String(rule.applied_count) })}
            {rule.last_applied_at ? ` · ${fill(t.lastApplied, { date: formatDate(rule.last_applied_at) })}` : ` · ${t.neverApplied}`}
          </AppText>
          {writable ? (
            <View style={styles.group}>
              <Button label={rule.enabled ? t.pause : t.resume} kind="secondary" onPress={() => void toggle(rule)} />
              <Button label={t.remove} kind="ghost" onPress={() => confirmRemove(rule)} />
            </View>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({ group: { gap: space[8] } });
