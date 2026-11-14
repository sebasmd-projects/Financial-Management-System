"use client";

import { api } from "@/api";
import { formatDate, formatTime } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { fill, signedAmount } from "../helpers";
import { useSubmit } from "../hooks";
import { Badge, Banner, Money } from "../kit";
import { canUndo, editableFields, eventMoneyType, isProposed, safeMailUrl, syncApi, type SyncEvent } from "../../../../core/sync";

const sync = syncApi(api);

export type Decision = "approved" | "modified" | "discarded" | "undone";

const STATUS_TONE: Record<string, "neutral" | "info" | "positive" | "warning" | "negative"> = {
  proposed: "info",
  auto_confirmed: "positive",
  approved: "positive",
  modified: "positive",
  discarded: "neutral",
  undone: "neutral",
  rejected_auth: "negative",
  parse_error: "warning",
};

/**
 * Una propuesta del correo: solo los campos que el servidor extrajo (fecha, monto, tipo, comercio, últimos 4) y «Ir al correo». Nunca se muestra el
 * correo. Aprobar y descartar llevan `Idempotency-Key`; «Modificar» abre el formulario; lo decidido se puede deshacer (anula con reverso).
 */
export function EventCard({ event, where, canWrite, onDecided, onModify }: { event: SyncEvent; where: string | null; canWrite: boolean; onDecided: (event: SyncEvent, decision: Decision) => void; onModify: (event: SyncEvent) => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.sync.review;
  const submit = useSubmit();
  const type = eventMoneyType(event.kind);
  const amount = event.amount === null ? null : signedAmount({ type: type ?? "transfer", amount: event.amount });
  const fields = editableFields(event);
  const title = event.counterparty || t.untitled;

  async function decide(decision: "approved" | "discarded" | "undone") {
    const call = decision === "approved" ? sync.approve : decision === "discarded" ? sync.discard : sync.undo;
    const result = await submit.run({ [decision]: event.id }, (key) => call(event.id, key, { locale }));
    if (result.ok) onDecided(result.data, decision);
  }

  const mail = safeMailUrl(event.mail_link);
  const hint = event.mail_link?.search_hint ?? "";
  const match = event.match ? t.match[event.match] : undefined;
  return (
    <li className="fin-row fin-row--static sync-event" data-event={event.id}>
      <div className="fin-row__main">
        <span className="fin-row__title">{title}</span>
        <span className="fin-row__sub muted">
          {t.kinds[event.kind] ?? ""}
          {event.date ? ` · ${formatDate(event.date)}` : ""}
          {event.last4 ? ` · ${fill(t.card, { last4: event.last4 })}` : ""}
        </span>
        {where && <span className="fin-row__sub muted">{fill(t.account, { name: where })}</span>}
        <span className="fin-row__sub muted">{fill(t.received, { date: formatDate(event.received_at), time: formatTime(event.received_at) })}</span>
        <span className="fin-row__badges">
          <Badge tone={STATUS_TONE[event.status] ?? "neutral"}>{t.status[event.status] ?? event.status}</Badge>
        </span>
        {isProposed(event) && match && <span className="fin-row__sub">{match}</span>}
        {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
        <span className="actions">
          {isProposed(event) && canWrite && (
            <>
              <button type="button" className="button button--primary" disabled={submit.pending} onClick={() => void decide("approved")}>
                {submit.pending ? t.working : t.approve}
                <span className="visually-hidden"> {title}</span>
              </button>
              {fields.modify && (
                <button type="button" className="button button--ghost" disabled={submit.pending} onClick={() => onModify(event)}>
                  {t.modify}
                  <span className="visually-hidden"> {title}</span>
                </button>
              )}
              <button type="button" className="button button--ghost" disabled={submit.pending} onClick={() => void decide("discarded")}>
                {t.discard}
                <span className="visually-hidden"> {title}</span>
              </button>
            </>
          )}
          {canUndo(event) && canWrite && (
            <button type="button" className="button button--ghost" disabled={submit.pending} onClick={() => void decide("undone")}>
              {submit.pending ? t.working : t.undo}
              <span className="visually-hidden"> {title}</span>
            </button>
          )}
          {mail ? (
            <a className="button button--ghost" href={mail} target="_blank" rel="noopener noreferrer">
              {t.mail}
              <span className="visually-hidden">
                {" "}
                {title} ({t.mailNewTab})
              </span>
            </a>
          ) : null}
        </span>
        {hint && !(mail && event.mail_link?.exact) && <span className="fin-row__sub muted">{fill(mail ? t.mailHint : t.mailNone, { hint })}</span>}
      </div>
      {amount && (
        <div className="fin-row__amount">
          <Money value={amount.value} sign={amount.sign} kind={type === "income" ? "ingreso" : type === "expense" ? "egreso" : "transferencia"} />
        </div>
      )}
    </li>
  );
}
