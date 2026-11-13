"use client";

import { useI18n } from "@/i18n/provider";
import { SelectField } from "./kit";

/** Las convenciones de tasa que acepta la API (`RateConventionEnum`). */
export const RATE_CONVENTIONS = ["EA", "EM", "ET", "ED", "NMV", "NTV", "NAV"] as const;
export type RateConventionCode = (typeof RATE_CONVENTIONS)[number];

/** El nombre legible de una convención («Efectiva anual (EA)»); un código desconocido se muestra tal cual. */
export function useConventionLabel(): (code: string) => string {
  const { dict } = useI18n();
  return (code) => dict.fin.help.conventions[code] ?? code;
}

/** El selector de convención de TODA tasa de un formulario: nombres completos y la ayuda «(?)». */
export function ConventionSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: RateConventionCode) => void }) {
  const { dict } = useI18n();
  const name = useConventionLabel();
  return <SelectField label={label} help={dict.fin.help.texts.convention} value={value} onChange={(v) => onChange(v as RateConventionCode)} options={RATE_CONVENTIONS.map((code) => ({ value: code, label: name(code) }))} />;
}
