"use client";

import type { Account, ImportPreview, ImportPreviewRow } from "@/api/models";
import { formatDate } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { Banner, Segmented, SelectField } from "../kit";
import { isBlocked, kindsForAmount, MAX_INSTALLMENTS, SIGN_CHOICES, UNREGISTERED, type CardKind, type RowEdit, type SignChoice } from "./logic";

const INSTALLMENT_OPTIONS = Array.from({ length: MAX_INSTALLMENTS }, (_, index) => index + 1);

/** El signo de los valores del extracto de una tarjeta: se detecta, y la persona puede forzarlo. Un archivo ambiguo lo dice. */
export function SignControl({ preview, sign, onChange, busy }: { preview: ImportPreview; sign: SignChoice; onChange: (sign: SignChoice) => void; busy: boolean }) {
  const { dict } = useI18n();
  const t = dict.fin.imp.card;
  const detected = preview.sign_detected;
  return (
    <div className="fin-stack" data-testid="sign-control">
      <Segmented
        legend={t.signLegend}
        value={sign}
        onChange={(value) => onChange(value as SignChoice)}
        options={SIGN_CHOICES.map((choice) => ({ value: choice, label: t.signs[choice], disabled: busy }))}
      />
      {detected === "ambiguous" ? (
        <Banner tone="warning" live="polite">
          {t.signAmbiguous}
        </Banner>
      ) : (
        detected && (
          <p className="hint" data-testid="sign-detected">
            {fill(t.signDetected, { sign: t.signs[detected] })}
          </p>
        )
      )}
    </div>
  );
}

/** Cuántas filas hay de cada clase (lo que va a pasar, escrito). */
export function KindSummary({ preview }: { preview: ImportPreview }) {
  const { dict } = useI18n();
  const t = dict.fin.imp.card;
  const entries = Object.entries(preview.kind_counts).filter(([, count]) => count > 0);
  if (entries.length === 0) return null;
  return (
    <ul className="fin-list imp-summary" data-testid="kind-summary" aria-label={t.kindSummary}>
      {entries.map(([kind, count]) => (
        <li key={kind}>{fill(t.kindCount, { kind: t.kinds[kind] ?? kind, count: String(count) })}</li>
      ))}
    </ul>
  );
}

/**
 * Lo que se decide de una fila de tarjeta: su clase, las cuotas de una compra y la cuenta que pagó o recibió. Solo se edita lo que
 * se va a crear (una fila que cruza con algo que ya existe, o un duplicado, no se toca: lo decide el cruce).
 */
export function CardRowFields({ row, accounts, onEdit, busy }: { row: ImportPreviewRow; accounts: readonly Account[]; onEdit: (row: ImportPreviewRow, patch: RowEdit) => void; busy: boolean }) {
  const { dict } = useI18n();
  const t = dict.fin.imp.card;
  const kind = row.kind;
  if (!kind) return null;
  const editable = row.match === "new";
  const needsAccount = editable && (kind === "payment" || kind === "advance");
  return (
    <div className="imp-card-row" data-testid={`card-row-${row.number}`}>
      <span className="fin-row__sub muted">
        {fill(t.period, { start: row.period_start ? formatDate(row.period_start) : "—", end: row.period_end ? formatDate(row.period_end) : "—" })}
      </span>
      {editable ? (
        <div className="fin-grid-2">
          <SelectField
            label={fill(t.kindOf, { number: String(row.number) })}
            value={kind}
            onChange={(value) => onEdit(row, { kind: value as CardKind })}
            options={kindsForAmount(row.amount).map((k) => ({ value: k, label: t.kinds[k] ?? k, disabled: busy }))}
          />
          {kind === "purchase" && (
            <SelectField
              label={fill(t.installmentsOf, { number: String(row.number) })}
              value={String(row.installments ?? 1)}
              onChange={(value) => onEdit(row, { installments: +value })}
              options={INSTALLMENT_OPTIONS.map((n) => ({ value: String(n), label: n === 1 ? t.oneInstallment : fill(t.installments, { count: String(n) }), disabled: busy }))}
            />
          )}
          {needsAccount && (
            <SelectField
              label={fill(kind === "payment" ? t.paidFromOf : t.receivedInOf, { number: String(row.number) })}
              value={row.counter_account ?? ""}
              onChange={(value) => onEdit(row, { counterAccount: value })}
              placeholder={t.pickAccount}
              options={[
                ...accounts.map((a) => ({ value: a.id, label: a.name, disabled: busy })),
                ...(kind === "payment" ? [{ value: UNREGISTERED, label: t.unregistered, disabled: busy }] : []),
              ]}
            />
          )}
        </div>
      ) : (
        <span className="fin-row__sub muted">
          {t.kinds[kind] ?? kind}
          {kind === "purchase" && (row.installments ?? 1) > 1 ? ` · ${fill(t.installments, { count: String(row.installments) })}` : ""}
        </span>
      )}
      {row.issue !== "" && (
        <p className={isBlocked(row) ? "field__error" : "hint"} role="status" data-testid={`issue-${row.number}`}>
          {t.issues[row.issue] ?? row.issue}
        </p>
      )}
    </div>
  );
}
