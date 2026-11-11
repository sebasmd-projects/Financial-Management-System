"use client";

import { useEffect, useState } from "react";
import type { UsuryCheck } from "@/api/models";
import { paths } from "@/api/paths";
import { fractionToPercent } from "@/lib/amount-input";
import { formatPercent } from "@/lib/percent";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { useResource } from "../hooks";
import { UsuryNote } from "./notes";

const DEBOUNCE_MS = 400;

/**
 * Aviso de usura al escribir una tasa (corte 2.8): compara la tasa (fracción) con la usura vigente EN SU FECHA. Si no hay una
 * usura registrada lo dice y lleva a Parámetros; nunca supone un valor. Superarla es un aviso, no un bloqueo, y el estado va escrito.
 */
export function UsuryRateCheck({ rate, convention, on }: { rate: string | null; convention: string; on?: string }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.usury;
  // La consulta espera a que la persona deje de escribir.
  const wanted = rate && /[1-9]/.test(rate) ? `${rate}|${convention}|${on ?? ""}` : null;
  const [settled, setSettled] = useState<string | null>(null);
  useEffect(() => {
    if (wanted === null) return;
    const timer = setTimeout(() => setSettled(wanted), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [wanted]);
  const [settledRate, settledConvention, settledOn] = (settled ?? "||").split("|");
  const check = useResource<UsuryCheck>(settled !== null && settled === wanted ? paths.usuryCheck({ rate: settledRate, convention: settledConvention, on: settledOn || undefined }) : null);
  if (wanted === null || settled !== wanted || !check.data) return null;
  const d = check.data;
  return (
    <div className="usury-check" data-testid="usury-check">
      <UsuryNote ea={d.usury_known ? d.usury : null} exceeded={d.usury_known ? d.exceeds : null} />
      <p className="hint">{fill(t.effective, { rate: formatPercent(fractionToPercent(d.effective_annual, 4), locale, 2) })}</p>
    </div>
  );
}
