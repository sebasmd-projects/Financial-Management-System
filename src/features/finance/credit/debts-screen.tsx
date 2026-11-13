"use client";

import { useState } from "react";
import type { Debt, DebtPayments, DebtSummary, Page } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { useResource } from "../hooks";
import { Badge, Empty, ErrorState, Loading, Modal, Money, Progress, ScreenHeader, Segmented } from "../kit";
import { CreditTabs } from "./credit-tabs";
import { RemoveDialog } from "../shared/remove";
import { DebtEditForm, DebtForm, DebtPayForm, DebtReminderView } from "./debt-dialogs";

type Direction = "owed" | "owe";
type Dialog = { kind: "new" } | { kind: "pay" | "edit" | "remind"; debt: Debt } | null;

/** Deudas personales (`/creditos/deudas-personales`, §3.8): «Me deben» y «Debo», con abonos parciales, recordatorios y el texto para compartir. */
export function DebtsScreen() {
  const { dict } = useI18n();
  const t = dict.fin.credit.debts;
  const [direction, setDirection] = useState<Direction>("owed");
  const [settled, setSettled] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [removing, setRemoving] = useState<Debt | null>(null);
  const summary = useResource<DebtSummary>(paths.debtsSummary());
  const list = useResource<Page<Debt>>(paths.debts({ direction, status: settled ? "settled" : "open" }));
  const close = () => setDialog(null);
  const refresh = () => {
    setDialog(null);
    list.reload();
    summary.reload();
  };
  return (
    <div className="screen">
      <ScreenHeader
        title={dict.screens["creditos-deudas"]}
        eyebrow={dict.nav.sections.creditos}
        actions={
          <button type="button" className="button button--primary" onClick={() => setDialog({ kind: "new" })}>
            {t.add}
          </button>
        }
      />
      <CreditTabs current="creditos-deudas" />
      {summary.data && (
        <section className="fin-kpis" aria-label={t.summary}>
          <div className="fin-kpi">
            <p className="muted">{t.theyOweMe}</p>
            <p className="fin-kpi__value"><Money value={summary.data.they_owe_me} /></p>
          </div>
          <div className="fin-kpi">
            <p className="muted">{t.iOwe}</p>
            <p className="fin-kpi__value"><Money value={summary.data.i_owe} /></p>
          </div>
        </section>
      )}
      <Segmented legend={t.direction} value={direction} onChange={(v) => setDirection(v as Direction)} options={[{ value: "owed", label: t.owed }, { value: "owe", label: t.owe }]} />
      <Segmented legend={t.status} value={settled ? "settled" : "open"} onChange={(v) => setSettled(v === "settled")} options={[{ value: "open", label: t.open }, { value: "settled", label: t.settled }]} variant="chips" />
      {list.loading && !list.data && <Loading />}
      {list.failure && <ErrorState message={dict.fin.errors.generic} onRetry={list.reload} />}
      {list.data && list.data.results.length === 0 && (
        <Empty
          icon="wallet"
          title={settled ? t.emptySettledTitle : direction === "owed" ? t.emptyOwedTitle : t.emptyOweTitle}
          body={t.emptyBody}
          action={
            !settled ? (
              <button type="button" className="button button--primary" onClick={() => setDialog({ kind: "new" })}>
                {t.add}
              </button>
            ) : undefined
          }
        />
      )}
      <ul className="fin-list">
        {list.data?.results.map((debt) => (
          <li key={debt.id}>
            <DebtCard debt={debt} onRemove={() => setRemoving(debt)} onPay={() => setDialog({ kind: "pay", debt })} onEdit={() => setDialog({ kind: "edit", debt })} onRemind={() => setDialog({ kind: "remind", debt })} />
          </li>
        ))}
      </ul>
      <RemoveDialog
        open={removing !== null}
        name={removing?.person ?? ""}
        deletePath={removing ? paths.debt(removing.id) : ""}
        onClose={() => setRemoving(null)}
        onDone={() => {
          setRemoving(null);
          refresh();
        }}
      />
      <Modal open={dialog?.kind === "new"} title={t.add} onClose={close}>
        {dialog?.kind === "new" && <DebtForm initialDirection={direction} onCancel={close} onDone={refresh} />}
      </Modal>
      <Modal open={dialog?.kind === "pay"} title={t.register} onClose={close}>
        {dialog?.kind === "pay" && <DebtPayForm debt={dialog.debt} onCancel={close} onDone={refresh} />}
      </Modal>
      <Modal open={dialog?.kind === "edit"} title={t.editReminder} onClose={close}>
        {dialog?.kind === "edit" && <DebtEditForm debt={dialog.debt} onCancel={close} onDone={refresh} />}
      </Modal>
      <Modal open={dialog?.kind === "remind"} title={t.remind} onClose={close}>
        {dialog?.kind === "remind" && <DebtReminderView debtId={dialog.debt.id} onClose={close} />}
      </Modal>
    </div>
  );
}

function DebtCard({ debt, onPay, onEdit, onRemind, onRemove }: { debt: Debt; onPay: () => void; onEdit: () => void; onRemind: () => void; onRemove: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.credit.debts;
  const [showPayments, setShowPayments] = useState(false);
  const open = debt.status === "open";
  return (
    <article className="fin-card" aria-label={debt.person}>
      <h2 className="title-s">{debt.person}</h2>
      <p>
        <span className="muted">{t.balance}</span> <strong><Money value={debt.balance} /></strong> <span className="muted">{dict.fin.loans.of}</span> <Money value={debt.principal} />
      </p>
      <Progress percent={debt.paid_percent} label={`${dict.fin.loans.paidPercent}: ${debt.paid_percent}%`} tone="positive" />
      <p className="muted">
        {fill(t.agreed, { date: formatDate(debt.agreed_date) })}
        {debt.due_date ? ` · ${fill(t.due, { date: formatDate(debt.due_date) })}` : ""}
        {debt.remind_on ? ` · ${fill(t.remindsOn, { date: formatDate(debt.remind_on) })}` : ""}
      </p>
      {debt.note && <p className="muted">{debt.note}</p>}
      <p className="fin-row__badges">
        {debt.overdue && open && <Badge tone="negative">{t.overdue}</Badge>}
        {!open && <Badge tone="positive">{t.settledBadge}</Badge>}
      </p>
      <div className="actions">
        {open && (
          <button type="button" className="button button--primary" onClick={onPay}>
            {t.register}
          </button>
        )}
        {open && (
          <button type="button" className="button button--ghost" onClick={onRemind}>
            {t.remind}
          </button>
        )}
        {open && (
          <button type="button" className="button button--ghost" onClick={onEdit}>
            {dict.fin.own.edit}
          </button>
        )}
        <button type="button" className="button button--ghost" aria-label={`${dict.fin.own.delete}: ${debt.person}`} onClick={onRemove}>
          {dict.fin.own.delete}
        </button>
        <button type="button" className="button button--ghost" aria-expanded={showPayments} onClick={() => setShowPayments((v) => !v)}>
          {t.payments}
        </button>
      </div>
      {showPayments && <PaymentsList debtId={debt.id} />}
    </article>
  );
}

function PaymentsList({ debtId }: { debtId: string }) {
  const { dict } = useI18n();
  const t = dict.fin.credit.debts;
  const payments = useResource<DebtPayments>(paths.debtPayments(debtId));
  return (
    <div>
      {payments.loading && !payments.data && <Loading />}
      {payments.failure && <ErrorState message={dict.fin.errors.generic} onRetry={payments.reload} />}
      {payments.data && payments.data.payments.length === 0 && <p className="muted">{t.noPayments}</p>}
      <ul className="fin-list">
        {payments.data?.payments.map((p) => (
          <li key={p.id} className="fin-row fin-row--static">
            <span className="fin-row__main">
              <span className="fin-row__title">{formatDate(p.date)}</span>
              {p.description && <span className="fin-row__sub muted">{p.description}</span>}
            </span>
            <span className="fin-row__amount"><Money value={p.amount} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
