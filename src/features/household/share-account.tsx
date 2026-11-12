"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Account, MovedAccount } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import type { RouteId } from "@/nav/routes";
import { DrillLink } from "../finance/drill-link";
import { fill } from "../finance/helpers";
import { useHref, useSubmit } from "../finance/hooks";
import { Banner, FormActions, Modal, SelectField } from "../finance/kit";
import { moveBlocker, type InUseKind, type MoveBlocker } from "./blockers";
import { canWriteRole } from "./scope";
import { refreshHouseholds, useHouseholds } from "./scope-store";

const IN_USE_ROUTE: Record<Exclude<InUseKind, "other">, { route: RouteId; withAccount?: boolean; label: "goReconciliations" | "goRecurrences" | "goBudgets" | "goGoals" | "goImports" }> = {
  reconciliations: { route: "cuenta-conciliar", withAccount: true, label: "goReconciliations" },
  recurrences: { route: "pagos-fijos", label: "goRecurrences" },
  budgets: { route: "plan-presupuestos", label: "goBudgets" },
  goals: { route: "plan-objetivos", label: "goGoals" },
  imports: { route: "cuentas-importar", label: "goImports" },
};

/**
 * Lo que el servidor dijo para no mover la cuenta, en palabras y con el siguiente paso: pendientes por confirmar o descartar,
 * traslado entre ámbitos por anular, conciliados, o los módulos solo personales que la usan. Sin valores.
 */
export function BlockerPanel({ blocker, accountId, links }: { blocker: MoveBlocker; accountId: string; links: boolean }) {
  const { dict } = useI18n();
  const t = dict.fin.hh.share;
  const href = useHref();
  return (
    <div className="status status--negative hh-blocker" role="alert">
      <div>
        <p>
          <strong>{t.blockedTitle}.</strong> {t.blockers[blocker.code]}
        </p>
        {blocker.code === "account_in_use" && (
          <ul>
            {blocker.kinds.map((kind) => (
              <li key={kind}>
                {t.inUse[kind]}
                {links && kind !== "other" && (
                  <>
                    {" · "}
                    <Link href={href(IN_USE_ROUTE[kind].route, IN_USE_ROUTE[kind].withAccount ? [accountId] : [])}>{t[IN_USE_ROUTE[kind].label]}</Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {blocker.code === "pending_entries" && (
          <DrillLink filter={{ account: accountId, status: "pendiente" }}>{t.goPending}</DrillLink>
        )}
        {blocker.code === "linked_transfers" && <Link href={href("movimientos-transferencias")}>{t.goTransfers}</Link>}
      </div>
    </div>
  );
}

/** «Pasar al hogar»: elige el hogar (donde puedas escribir), explica qué ocurre y muestra los bloqueos del servidor si los hay. */
export function ShareAccountDialog({ open, account, onClose, onDone }: { open: boolean; account: Account; onClose: () => void; onDone: (householdId: string) => void }) {
  const { dict } = useI18n();
  return (
    <Modal open={open} title={fill(dict.fin.hh.share.title, { name: account.name })} onClose={onClose}>
      <ShareForm account={account} onClose={onClose} onDone={onDone} />
    </Modal>
  );
}

function ShareForm({ account, onClose, onDone }: { account: Account; onClose: () => void; onDone: (householdId: string) => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.hh.share;
  const submit = useSubmit();
  const { data } = useHouseholds();
  const writable = (data?.households ?? []).filter((h) => canWriteRole(h.role));
  const [chosen, setChosen] = useState("");
  const [blocker, setBlocker] = useState<MoveBlocker | null>(null);
  const householdId = chosen || writable[0]?.id || "";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!householdId) return;
    setBlocker(null);
    const body = { household_id: householdId };
    const result = await submit.run(body, async (key) => {
      const response = await api.post<MovedAccount>(paths.accountShare(account.id), body, { idempotencyKey: key, locale, unscoped: true });
      if (!response.ok) setBlocker(moveBlocker(response));
      return response;
    });
    if (result.ok) {
      await refreshHouseholds();
      onDone(householdId);
    }
  }

  if (data && writable.length === 0) {
    return (
      <div className="fin-form">
        <p className="muted">{t.noHouseholds}</p>
        <button type="button" className="button button--ghost" onClick={onClose}>
          {dict.common.cancel}
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <p className="muted">{t.intro}</p>
      <SelectField label={t.household} value={householdId} onChange={setChosen} options={writable.map((h) => ({ value: h.id, label: h.name }))} />
      {blocker ? (
        <BlockerPanel blocker={blocker} accountId={account.id} links />
      ) : (
        submit.error && (
          <Banner tone="negative" live="assertive">
            {submit.error}
          </Banner>
        )
      )}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || !householdId}>
          {submit.pending ? dict.fin.common.saving : t.confirm}
        </button>
        <button type="button" className="button button--ghost" onClick={onClose}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

/** «Sacar del hogar»: la cuenta vuelve a lo personal (solo quien la trajo; el servidor lo decide y aquí se explica el motivo). */
export function UnshareAccountDialog({ open, householdId, account, onClose, onDone }: { open: boolean; householdId: string; account: Account; onClose: () => void; onDone: () => void }) {
  const { dict } = useI18n();
  return (
    <Modal open={open} title={fill(dict.fin.hh.share.unshareTitle, { name: account.name })} onClose={onClose}>
      <UnshareForm householdId={householdId} account={account} onClose={onClose} onDone={onDone} />
    </Modal>
  );
}

function UnshareForm({ householdId, account, onClose, onDone }: { householdId: string; account: Account; onClose: () => void; onDone: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.hh.share;
  const submit = useSubmit();
  const [blocker, setBlocker] = useState<MoveBlocker | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBlocker(null);
    const result = await submit.run({ unshare: account.id }, async (key) => {
      const response = await api.post<MovedAccount>(paths.accountUnshare(householdId, account.id), undefined, { idempotencyKey: key, locale, unscoped: true });
      if (!response.ok) setBlocker(moveBlocker(response));
      return response;
    });
    if (result.ok) {
      await refreshHouseholds();
      onDone();
    }
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <p className="muted">{t.unshareIntro}</p>
      {blocker ? (
        <BlockerPanel blocker={blocker} accountId={account.id} links={false} />
      ) : (
        submit.error && (
          <Banner tone="negative" live="assertive">
            {submit.error}
          </Banner>
        )
      )}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : t.unshareConfirm}
        </button>
        <button type="button" className="button button--ghost" onClick={onClose}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}
