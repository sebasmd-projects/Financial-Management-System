"use client";

import { useState, useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { applyTheme, nextTheme, readThemePreference, writeThemePreference, type ThemePreference } from "./storage";

const subscribe = () => () => {};

/** Un botón que cicla sistema → claro → oscuro. Anuncia el estado actual y a qué cambia. */
export function ThemeToggle() {
  const { dict } = useI18n();
  // En el servidor no hay preferencia: «system»; en el navegador, la guardada (sin parpadeo de hidratación).
  const stored = useSyncExternalStore(subscribe, readThemePreference, () => "system" as ThemePreference);
  const [override, setOverride] = useState<ThemePreference | null>(null);
  const current = override ?? stored;
  const next = nextTheme(current);

  return (
    <button
      type="button"
      className="icon-button"
      aria-label={`${dict.theme[current]}. ${dict.theme.switchTo[next]}`}
      onClick={() => {
        writeThemePreference(next);
        applyTheme(next);
        setOverride(next);
      }}
    >
      <Icon name={current === "dark" ? "moon" : current === "light" ? "sun" : "contrast"} />
    </button>
  );
}
