"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { fractionToPercent } from "@/lib/amount-input";
import { formatPercent } from "@/lib/percent";
import { fill } from "../helpers";
import { useHref } from "../hooks";
import { Banner } from "../kit";

/** Las claves de Parámetros Colombia que estos avisos señalan (`config-parametros?clave=...`). */
export const LATE_RATE_PARAM = "LATE_INTEREST_EA";
export const USURY_PARAM = "USURY_RATE_EA";

/** `rate_missing`: no hay tasa de mora vigente. Nunca se inventa una; se manda a Parámetros. */
export function RateMissingNotice() {
  const { dict } = useI18n();
  const t = dict.fin.credit.notes;
  const href = useHref();
  return (
    <Banner tone="warning">
      <p>
        <strong>{t.rateMissingTitle}</strong>
      </p>
      <p>{t.rateMissingBody}</p>
      <Link className="button button--ghost" href={`${href("config-parametros")}?clave=${LATE_RATE_PARAM}`}>
        {t.goToParameters}
      </Link>
    </Banner>
  );
}

/**
 * La comparación con la tasa de usura vigente. `ea === null` (sin parámetro vigente): se dice y se lleva a Parámetros, no se
 * supone ningún valor. Superarla es un aviso, no un bloqueo. El estado va escrito: el color no es la única señal.
 */
export function UsuryNote({ ea, exceeded }: { ea: string | null; exceeded: boolean | null }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.credit.notes;
  const href = useHref();
  if (ea === null) {
    return (
      <p className="hint" data-testid="usury-null">
        {t.usuryMissing}{" "}
        <Link href={`${href("config-parametros")}?clave=${USURY_PARAM}`}>{t.goToParameters}</Link>
      </p>
    );
  }
  const shown = formatPercent(fractionToPercent(ea, 4), locale, 2);
  if (exceeded) {
    return (
      <Banner tone="warning">
        <strong>{t.usuryExceeded}</strong> {fill(t.usuryCurrent, { rate: shown })}
      </Banner>
    );
  }
  return <p className="hint">{exceeded === false ? fill(t.usuryBelow, { rate: shown }) : fill(t.usuryCurrent, { rate: shown })}</p>;
}
