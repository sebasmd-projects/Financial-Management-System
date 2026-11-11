"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n/provider";
import { useHref } from "../hooks";
import { Banner, Money } from "../kit";
import { UVR_PARAMETER } from "../parameters/logic";

/** La clave del parámetro que el usuario escribe con su fuente (`POST user-parameters`); el servidor no siembra ninguna. */
export const UVR_KEY = UVR_PARAMETER;

/** El enlace a «Parámetros Colombia» con la UVR (o el índice) abierta para registrar su valor. Solo lleva la CLAVE: nada de montos en la URL. */
export function RegisterIndexLink({ indexKey = UVR_KEY, children }: { indexKey?: string; children?: ReactNode }) {
  const { dict } = useI18n();
  const href = useHref();
  return <Link href={`${href("config-parametros")}?clave=${encodeURIComponent(indexKey)}`}>{children ?? (indexKey === UVR_KEY ? dict.fin.uvr.registerUvr : dict.fin.uvr.registerIndex)}</Link>;
}

/** «Monto por definir (falta la UVR)»: un monto que no se puede estimar NUNCA se pinta como $0. Sin enlace (cabe dentro de filas que ya son enlaces). */
export function PendingAmount() {
  const { dict } = useI18n();
  return (
    <span className="money money--pending" data-pending="true">
      {dict.fin.uvr.pending}
    </span>
  );
}

/** Un monto de la API que puede venir `null` por falta de UVR: `null` → «monto por aclarar», no `$0`. */
export function AmountOrPending({ value, ...props }: { value: string | null } & Omit<React.ComponentProps<typeof Money>, "value">) {
  return value === null ? <PendingAmount /> : <Money value={value} {...props} />;
}

/** El aviso de las respuestas con `notices: [{code: "index_missing"}]`: qué falta y dónde se registra. */
export function IndexNoticeBanner({ notices }: { notices: readonly { code: string; key: string }[] | undefined }) {
  const { dict } = useI18n();
  const missing = (notices ?? []).filter((n) => n.code === "index_missing");
  if (missing.length === 0) return null;
  return (
    <Banner tone="warning">
      <p>{dict.fin.uvr.noticeBody}</p>
      <p>
        {[...new Set(missing.map((n) => n.key))].map((key, index) => (
          <span key={key}>
            {index > 0 ? " · " : ""}
            <RegisterIndexLink indexKey={key} />
          </span>
        ))}
      </p>
    </Banner>
  );
}
