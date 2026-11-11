"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Balances, Page, PersonBalance, SharedPurchase } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { fill } from "../helpers";
import { useHref, useResource, useSubmit } from "../hooks";
import { Badge, Banner, Empty, ErrorState, FormActions, Loading, Modal, Money, ScreenHeader, Section, Slots, TextArea } from "../kit";
import { balanceSides } from "./logic";
import { PurchaseForm } from "./purchase-form";

/** «Laura te debe $85.000» / «Le debes a Andrés $40.000»: los dos sentidos de una persona, escritos con palabras (no solo con color). */
export function BalanceLines({ person }: { person: Pick<PersonBalance, "name" | "owed_to_me" | "i_owe"> }) {
  const { dict } = useI18n();
  const t = dict.fin.shared;
  const sides = balanceSides(person);
  return (
    <>
      {sides.owed && (
        <span className="fin-row__sub">
          <Slots template={t.owesYouLine} vars={{ name: <strong>{person.name}</strong>, amount: <Money value={person.owed_to_me} tone="positive" /> }} />
        </span>
      )}
      {sides.owe && (
        <span className="fin-row__sub">
          <Slots template={t.youOweLine} vars={{ name: <strong>{person.name}</strong>, amount: <Money value={person.i_owe} tone="negative" /> }} />
        </span>
      )}
      {!sides.owed && !sides.owe && <span className="fin-row__sub muted">{fill(t.settledLine, { name: person.name })}</span>}
    </>
  );
}

/**
 * Compartidos (`/movimientos/compartidos`, §3.14): saldos por persona («Laura te debe…», «Le debes a Andrés…») con [Saldar], y las
 * compras compartidas con su reparto. Mi parte es gasto; la de los demás es una cuenta por cobrar. Cancelar una compra anula todo junto.
 */
export function SharedScreen() {
  const { dict } = useI18n();
  const t = dict.fin.shared;
  const href = useHref();
  const balances = useResource<Balances>(paths.sharedBalances());
  const purchases = useResource<Page<SharedPurchase>>(paths.sharedPurchases());
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<SharedPurchase | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reload = () => {
    balances.reload();
    purchases.reload();
  };
  const people = balances.data?.people ?? [];
  const list = purchases.data?.results ?? [];
  return (
    <div className="screen">
      <ScreenHeader
        title={dict.screens.compartidos}
        eyebrow={dict.nav.sections.movimientos}
        back={{ href: href("movimientos"), label: dict.nav.sections.movimientos }}
        actions={
          <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={20} />
            {t.add}
          </button>
        }
      />
      <p className="muted">{t.intro}</p>
      {notice && <Banner tone="positive">{notice}</Banner>}

      <Section title={t.balancesTitle}>
        {balances.loading && !balances.data && <Loading />}
        {balances.failure && <ErrorState message={dict.fin.errors.generic} onRetry={balances.reload} />}
        {balances.data && (
          <>
            {people.length > 0 && (
              <p className="fin-phrase" data-testid="balance-totals">
                <Slots template={t.totals} vars={{ owed: <Money value={balances.data.owed_to_me} />, owe: <Money value={balances.data.i_owe} /> }} />
              </p>
            )}
            {people.length === 0 && <Empty icon="wallet" title={t.balancesEmptyTitle} body={t.balancesEmptyBody} />}
            <ul className="fin-list">
              {people.map((person) => (
                <li key={person.counterparty_id}>
                  <Link href={href("compartidos-persona", [person.counterparty_id])} className="fin-row">
                    <span className="fin-row__main">
                      <BalanceLines person={person} />
                      <span className="fin-row__sub muted">{fill(person.debts.length === 1 ? t.debtsOne : t.debts, { n: String(person.debts.length) })}</span>
                    </span>
                    <span className="button button--ghost" aria-hidden="true">
                      {t.settle}
                    </span>
                    <span className="visually-hidden">
                      {t.settle} {person.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title={t.purchasesTitle}>
        {purchases.loading && !purchases.data && <Loading />}
        {purchases.failure && <ErrorState message={dict.fin.errors.generic} onRetry={purchases.reload} />}
        {purchases.data && list.length === 0 && (
          <Empty
            icon="list"
            title={t.purchasesEmptyTitle}
            body={t.purchasesEmptyBody}
            action={
              <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
                {t.add}
              </button>
            }
          />
        )}
        <ul className="fin-list">
          {list.map((purchase) => (
            <PurchaseRow key={purchase.id} purchase={purchase} onCancel={() => setCancelling(purchase)} />
          ))}
        </ul>
      </Section>

      <Modal open={creating} title={t.newPurchase} onClose={() => setCreating(false)}>
        <PurchaseForm
          onCancel={() => setCreating(false)}
          onDone={(created) => {
            setCreating(false);
            setNotice(fill(t.created, { people: String(created.shares.length) }));
            reload();
          }}
        />
      </Modal>
      <Modal open={cancelling !== null} title={t.cancelTitle} onClose={() => setCancelling(null)}>
        {cancelling && (
          <CancelPurchase
            purchase={cancelling}
            onClose={() => setCancelling(null)}
            onDone={() => {
              setCancelling(null);
              setNotice(t.cancelled);
              reload();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function PurchaseRow({ purchase, onCancel }: { purchase: SharedPurchase; onCancel: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.shared;
  const cancelled = purchase.cancelled_on !== null;
  return (
    <li className={`fin-row fin-row--static${cancelled ? " imp-row--skipped" : ""}`}>
      <span className="fin-row__main">
        <span className="fin-row__title">{purchase.description || t.untitled}</span>
        <span className="fin-row__sub muted">
          {formatDate(purchase.date)} · {t.modes[purchase.mode]} · {t.total} <Money value={purchase.total} strike={cancelled} />
        </span>
        <span className="fin-row__sub">
          {t.myShare} <Money value={purchase.my_share} strike={cancelled} />
        </span>
        <ul className="fin-list">
          {purchase.shares.map((share) => (
            <li key={share.debt_id} className="fin-row__sub muted">
              {share.name}: <Money value={share.amount} strike={cancelled} />
              {share.percent ? ` (${share.percent} %)` : ""} · {t.pending} <Money value={share.balance} />
            </li>
          ))}
        </ul>
        {cancelled && <Badge tone="negative">{fill(t.cancelledOn, { date: formatDate(purchase.cancelled_on!) })}</Badge>}
        {!cancelled && (
          <span className="actions">
            <button type="button" className="button button--ghost" onClick={onCancel}>
              {t.cancel}
              <span className="visually-hidden"> {purchase.description ?? formatDate(purchase.date)}</span>
            </button>
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * Cancelar la compra: anula JUNTOS el gasto de mi parte y la transferencia a cada cuenta por cobrar (todo o nada). Si alguien ya
 * abonó, `409 shares_already_paid`: hay que anular primero esos abonos; se dice con claridad y no se deshace nada.
 */
function CancelPurchase({ purchase, onDone, onClose }: { purchase: SharedPurchase; onDone: () => void; onClose: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.shared;
  const href = useHref();
  const submit = useSubmit();
  const [reason, setReason] = useState("");
  async function cancel(event: React.FormEvent) {
    event.preventDefault();
    if (reason.trim() === "") return;
    const body = { reason: reason.trim() };
    const result = await submit.run(body, () => api.post<SharedPurchase>(paths.sharedCancel(purchase.id), body, { locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={cancel} className="fin-form" noValidate>
      <p>{t.cancelBody}</p>
      <TextArea label={t.cancelReason} hint={t.cancelReasonHint} value={reason} onChange={setReason} maxLength={200} required />
      {submit.error && (
        <Banner tone="negative" live="assertive">
          <p>{submit.error}</p>
          {submit.errorCode === "shares_already_paid" && (
            <p>
              {purchase.shares.map((share, index) => (
                <span key={share.debt_id}>
                  {index > 0 ? " · " : ""}
                  <Link href={href("compartidos-persona", [share.counterparty_id])}>{fill(t.seePayments, { name: share.name })}</Link>
                </span>
              ))}
            </p>
          )}
        </Banner>
      )}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || reason.trim() === ""}>
          {submit.pending ? dict.fin.common.saving : t.cancelConfirm}
        </button>
        <button type="button" className="button button--ghost" onClick={onClose}>
          {dict.common.close}
        </button>
      </FormActions>
    </form>
  );
}
