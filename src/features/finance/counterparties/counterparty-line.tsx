"use client";

import type { CounterpartyIdentifier } from "@/api/models";
import { useI18n } from "@/i18n/provider";
import { identifierText } from "./logic";

/** El nombre en negrita y, debajo, la cuenta («Nequi ··3769»): lo que ve la persona en una lista o un detalle. */
export function CounterpartyLine({ name, identifier }: { name: string; identifier?: Pick<CounterpartyIdentifier, "channel" | "last4"> | null }) {
  const { dict } = useI18n();
  return (
    <span className="cp-line">
      <strong className="cp-line__name">{name}</strong>
      {identifier && <span className="cp-line__account muted tabular">{identifierText(identifier, dict.fin.cp)}</span>}
    </span>
  );
}

/** Solo la cuenta, como línea de apoyo bajo el título de una fila. */
export function AccountLine({ identifier }: { identifier: Pick<CounterpartyIdentifier, "channel" | "last4"> }) {
  const { dict } = useI18n();
  return <span className="fin-row__sub muted tabular">{identifierText(identifier, dict.fin.cp)}</span>;
}
