import { useEffect } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { useFms } from "@/auth/use-session";
import { es } from "@/i18n/es";
import { space } from "@/theme/tokens";
import { Chip } from "@/ui/primitives";
import { PERSONAL, scopeKey, sameScope, type Household, type Scope } from "./scope";
import { householdsStore, scopeStore, useHouseholds, useScope } from "./store";

/** Carga los hogares una vez por sesión desbloqueada. Si falla, solo hay «Personal» (no se inventa nada). */
export function useLoadHouseholds(): void {
  const fms = useFms();
  useEffect(() => {
    let alive = true;
    void fms.get<{ households: Household[] }>("/households").then((result) => {
      if (alive && result.ok) householdsStore.set(result.data.households);
    });
    return () => {
      alive = false;
    };
  }, [fms]);
}

/** Personal · Hogar · Ambos. Sin hogares no se muestra: no hay nada que elegir. */
export function ScopeSwitcher() {
  const scope = useScope();
  const households = useHouseholds();
  const t = es.scope;
  if (households.length === 0) return null;
  const options: { scope: Scope; label: string }[] = [
    { scope: PERSONAL, label: t.personal },
    ...households.flatMap((household) => [
      { scope: { kind: "household", id: household.id } as Scope, label: household.name },
      { scope: { kind: "both", id: household.id } as Scope, label: `${t.both} · ${household.name}` },
    ]),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="toolbar" accessibilityLabel={t.label} contentContainerStyle={styles.row}>
      {options.map((option) => (
        <Chip key={scopeKey(option.scope)} label={option.label} selected={sameScope(scope, option.scope)} onPress={() => scopeStore.set(option.scope)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space[8], paddingVertical: space[4] },
});
