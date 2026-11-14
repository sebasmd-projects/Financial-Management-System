"use client";

import Link from "next/link";
import { useState } from "react";
import type { Loan } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { formatUnits } from "@/lib/decimal";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { useAll, useHref } from "../hooks";
import { fill } from "../helpers";
import { Badge, ErrorState, Loading, Money, Progress, Section } from "../kit";
import { RemoveDialog, RowMenu } from "../shared/remove";
import { useCanWrite } from "../../household/scope-store";
import { isUvr } from "../uvr/logic";

/**
 * «Créditos y obligaciones» dentro de Cuentas (como la sección de tarjetas): nombre, tipo, lo que debes, «Cuota N de M», la próxima cuota con su
 * fecha y el enlace al detalle. Los créditos cuentan en «Debes» (el servidor suma todas las cuentas de pasivo, préstamos incluidos).
 */
export function LoansSection({ onChanged }: { onChanged?: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.loans;
  const o = dict.fin.own.section;
  const href = useHref();
  const loans = useAll<Loan>(paths.loans());
  const canWrite = useCanWrite();
  const [removing, setRemoving] = useState<Loan | null>(null);
  const shown = loans.items.filter((loan) => loan.status !== "closed");
  return (
    <Section
      title={o.title}
      aside={
        <Link className="button button--ghost" href={href("creditos")}>
          {o.viewAll}
        </Link>
      }
    >
      {loans.loading && !loans.data && <Loading />}
      {loans.failure && <ErrorState message={dict.fin.errors.generic} onRetry={loans.reload} />}
      {loans.data && shown.length === 0 && <p className="muted">{o.empty}</p>}
      {shown.length > 0 && (
        <ul className="fin-list" aria-label={o.title}>
          {shown.map((loan) => {
            const uvr = isUvr(loan);
            const next = loan.next_installment;
            const number = Math.min(loan.installments_paid + 1, loan.term);
            return (
              <li key={loan.id} className={canWrite ? "has-menu" : undefined}>
                <Link href={href("credito", [loan.id])} className="fin-row fin-row--loan">
                  <span className="fin-row__main">
                    <span className="fin-row__title">{loan.name}</span>
                    <span className="fin-row__badges">
                      <Badge>{dict.fin.credit.kinds[loan.kind]}</Badge>
                      {uvr && <Badge tone="info">{dict.fin.uvr.units.UVR}</Badge>}
                      {loan.status === "paid" && <Badge tone="positive">{t.paidOff}</Badge>}
                    </span>
                    <span className="fin-row__sub muted">
                      {o.owed} <Money value={loan.balance} />
                      {" · "}
                      {loan.status === "paid" ? t.paidOff : fill(o.installmentOf, { n: String(number), total: String(loan.term) })}
                    </span>
                    <Progress percent={loan.paid_percent} label={`${t.paidPercent}: ${loan.paid_percent}%`} tone="positive" />
                    <span className="fin-row__sub muted">
                      {next ? (
                        <>
                          {o.next}: {uvr ? <span className="tabular">{formatUnits(next.payment, "UVR")}</span> : <Money value={next.payment} />} · {formatDate(next.adjusted_due_date)}
                        </>
                      ) : (
                        o.none
                      )}
                    </span>
                  </span>
                  <Icon name="chevron-right" size={20} />
                </Link>
                {canWrite && <RowMenu name={loan.name} editHref={`${href("credito", [loan.id])}?editar=1`} onDelete={() => setRemoving(loan)} />}
              </li>
            );
          })}
        </ul>
      )}
      <RemoveDialog
        open={removing !== null}
        name={removing?.name ?? ""}
        kind="loan"
        id={removing?.id ?? ""}
        onClose={() => setRemoving(null)}
        onDone={() => {
          setRemoving(null);
          loans.reload();
          onChanged?.();
        }}
      />
    </Section>
  );
}
