import { Pressable, StyleSheet, Text, View } from "react-native";
import { es } from "@/i18n/es";
import { radius, space, targetMin, type } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";
import type { Key } from "./keypad-logic";

const ROWS: Key[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["000", "0", ",", "back"],
];

function labelOf(key: Key): string {
  if (key === "back") return es.keypad.delete;
  if (key === ",") return es.keypad.decimal;
  if (key === "000") return es.keypad.zeros;
  return key;
}

/**
 * El teclado del alta rápida y de los filtros de monto: así nunca sale el teclado del sistema (que podría recordar lo escrito).
 * Tocar «⌫» borra una cifra; mantenerla pulsada borra todo.
 */
export function Keypad({ onKey, onClear }: { onKey: (key: Key) => void; onClear: () => void }) {
  const c = useTheme();
  return (
    <View accessibilityLabel={es.keypad.label} style={styles.pad}>
      {ROWS.map((row, index) => (
        <View key={index} style={styles.row}>
          {row.map((key) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={labelOf(key)}
              onPress={() => onKey(key)}
              onLongPress={key === "back" ? onClear : undefined}
              accessibilityActions={key === "back" ? [{ name: "longpress", label: es.keypad.clear }] : undefined}
              onAccessibilityAction={key === "back" ? () => onClear() : undefined}
              style={({ pressed }) => [styles.key, { backgroundColor: pressed ? c.primaryContainer : c.surface2 }]}
            >
              <Text style={[type.titleM, { color: c.textPrimary }]}>{key === "back" ? "⌫" : key}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { gap: space[8] },
  row: { flexDirection: "row", gap: space[8] },
  key: { flex: 1, minHeight: targetMin + 4, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
});
