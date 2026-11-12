import { Text, type TextStyle } from "react-native";
import { formatCop, formatCopCompact, HIDDEN_AMOUNT, spokenCop } from "@core/money";
import { useHidden } from "@/features/common/hidden";
import { es } from "@/i18n/es";
import { type } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type Tone = "primary" | "secondary" | "negative" | "positive";

/**
 * Un monto en pantalla. La cadena decimal de la API se formatea con `core/money` (nunca `Number`). Con «ocultar montos» sale
 * `•••••` y el lector de pantalla dice «monto oculto». Para el lector el valor va completo (`spokenCop`), nunca abreviado.
 */
export function Money({ value, compact = false, sign = "auto", estimated = false, tone = "primary", kind = "body", style }: { value: string; compact?: boolean; sign?: "auto" | "always"; estimated?: boolean; tone?: Tone; kind?: keyof typeof type; style?: TextStyle }) {
  const hidden = useHidden();
  const c = useTheme();
  const color = { primary: c.textPrimary, secondary: c.textSecondary, negative: c.negative, positive: c.positive }[tone];
  const text = hidden ? HIDDEN_AMOUNT : (compact ? formatCopCompact : formatCop)(value, { sign, estimated });
  return (
    <Text accessibilityLabel={hidden ? es.summary.hiddenAmount : spokenCop(value)} style={[type[kind], { color }, style]}>
      {text}
    </Text>
  );
}
