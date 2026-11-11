import type { Dictionary } from "@/i18n/dictionaries/es";

type AutoTexts = Dictionary["fin"]["auto"];

/** Los nombres que el servidor manda están en español; el catálogo es cerrado, así que cada clave conocida tiene su texto en los dos idiomas. */
export const triggerLabel = (t: AutoTexts, key: string, fallback: string): string => (t.triggers as Record<string, string>)[key] ?? fallback;
export const fieldLabel = (t: AutoTexts, key: string, fallback?: string): string => (t.fields as Record<string, string>)[key] ?? fallback ?? key;
export const choiceLabel = (t: AutoTexts, value: string): string => (t.choices as Record<string, string>)[value] ?? value;
