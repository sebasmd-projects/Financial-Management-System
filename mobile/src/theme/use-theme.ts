import { useColorScheme } from "react-native";
import { darkColors, lightColors, type Palette } from "./tokens";

/** La paleta del tema del sistema (la app no guarda preferencia de tema: nada en disco). */
export function useTheme(): Palette {
  return useColorScheme() === "dark" ? darkColors : lightColors;
}
