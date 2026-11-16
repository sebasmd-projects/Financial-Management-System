/**
 * Tokens de diseño «Añil y Coral» de la web (`src/ui/tokens.css`, docs/design-spec.md §4), en valores que React Native entiende.
 * `tokens.test.ts` los compara con el CSS: si la web cambia un color y aquí no, falla. Los egresos NO se pintan de rojo:
 * `negative` es solo para vencido, saldo bajo cero y error (§4.1).
 */
export const lightColors = {
  canvas: "#f6f5f1",
  surface: "#ffffff",
  surface2: "#edebe4",
  border: "#d9d6cc",
  borderStrong: "#8a867a",
  track: "#c9c5b8",
  textPrimary: "#1b1a17",
  textSecondary: "#55524a",
  textTertiary: "#6b675d",
  primary: "#2f3eb8",
  onPrimary: "#ffffff",
  primaryContainer: "#e3e6fb",
  onPrimaryContainer: "#1c2580",
  accent: "#ae2d18",
  onAccent: "#ffffff",
  positive: "#12704a",
  positiveContainer: "#ddf3e7",
  onPositiveContainer: "#0c5236",
  negative: "#9a1d4b",
  negativeContainer: "#fbe4ec",
  onNegativeContainer: "#7a1539",
  warning: "#8a5a00",
  warningContainer: "#fbefd0",
  onWarningContainer: "#6b4600",
  info: "#1f5fa8",
  infoContainer: "#e0ecfa",
  onInfoContainer: "#17497f",
  chart1: "#2f3eb8",
  chart2: "#ae2d18",
  chart3: "#0e7c86",
  chart4: "#8a5a00",
  chart5: "#6d3fb5",
  chart6: "#12704a",
  chart7: "#5d6b00",
  chart8: "#55524a",
} as const;

export const darkColors = {
  canvas: "#111318",
  surface: "#1a1d24",
  surface2: "#242833",
  border: "#343947",
  borderStrong: "#7c8496",
  track: "#4a5062",
  textPrimary: "#f1f1ee",
  textSecondary: "#b9bcc6",
  textTertiary: "#9a9fad",
  primary: "#a5aeff",
  onPrimary: "#121a66",
  primaryContainer: "#2a3170",
  onPrimaryContainer: "#dde0ff",
  accent: "#ff8d6c",
  onAccent: "#141311",
  positive: "#5fd39a",
  positiveContainer: "#0f3d29",
  onPositiveContainer: "#a6ebc8",
  negative: "#ff93b4",
  negativeContainer: "#4a1228",
  onNegativeContainer: "#ffd0de",
  warning: "#f2c14e",
  warningContainer: "#453300",
  onWarningContainer: "#fbe3a6",
  info: "#8cbff5",
  infoContainer: "#12335a",
  onInfoContainer: "#cfe4fb",
  chart1: "#a5aeff",
  chart2: "#ff8d6c",
  chart3: "#5fd0da",
  chart4: "#f2c14e",
  chart5: "#c9a6ff",
  chart6: "#5fd39a",
  chart7: "#c8d96a",
  chart8: "#b9bcc6",
} as const;

export type Palette = { [K in keyof typeof lightColors]: string };

/** Espaciado (dp): 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48. */
export const space = { 0: 0, 2: 2, 4: 4, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32, 40: 40, 48: 48 } as const;
export const radius = { xs: 6, sm: 10, md: 14, lg: 20, full: 999 } as const;
/** Objetivo táctil mínimo (§5, §6). */
export const targetMin = 48;

/** Tamaño y interlineado en dp (la web usa rem sobre 16 px). */
export const type = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: "600" },
  kpi: { fontSize: 28, lineHeight: 34, fontWeight: "600" },
  titleL: { fontSize: 22, lineHeight: 28, fontWeight: "600" },
  titleM: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
  titleS: { fontSize: 16, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  bodyS: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
  label: { fontSize: 13, lineHeight: 16, fontWeight: "500" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
} as const;
