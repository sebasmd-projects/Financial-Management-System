"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "./config";
import type { Dictionary } from "./get-dictionary";
import { setAccountKindLabels } from "@/features/finance/helpers";

interface I18n {
  locale: Locale;
  dict: Dictionary;
}

const Context = createContext<I18n | null>(null);

/** El diccionario llega del servidor (solo cadenas: se serializa) a los componentes de cliente. */
export function I18nProvider({ locale, dict, children }: I18n & { children: ReactNode }) {
  // Los selectores de cuentas desambiguan nombres repetidos con el tipo en el idioma actual.
  setAccountKindLabels(dict.fin.own.kindShort);
  return <Context.Provider value={{ locale, dict }}>{children}</Context.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(Context);
  if (!value) throw new Error("useI18n fuera de <I18nProvider>");
  return value;
}
