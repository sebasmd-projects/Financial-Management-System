import type { Locale } from "./config";
import { en } from "./dictionaries/en";
import { es, type Dictionary } from "./dictionaries/es";

export type { Dictionary };

export function getDictionary(locale: Locale): Dictionary {
  return locale === "en" ? en : es;
}
