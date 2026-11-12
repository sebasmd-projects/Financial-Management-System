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
import { moveBlocker, type BlockerKind, type MoveBlocker } from "./blockers";
import { canWriteRole } from "./scope";
import { refreshHouseholds, useHouseholds } from "./scope-store";

type KindLink = { route: RouteId; withAccount?: boolean; personalOnly: boolean };

/** El siguiente paso de cada tipo de bloqueo. Los módulos solo personales no se alcanzan desde el ámbito del Hogar (`personalOnly`). */
const KIND_ROUTE: Partial<Record<BlockerKind, KindLink>> = {
  reconciliation: { route: "cuenta-conciliar", withAccount: true, personalOnly: true },
  recurrence: { route: "pagos-fijos", personalOnly: true },
  budget: { route: "plan-presupuestos", personalOnly: true },
  goal: { route: "plan-objetivos", personalOnly: true },
  import: { route: "cuentas-importar", personalOnly: true },
  credit: { route: "creditos", personalOnly: true },
  asset: { route: "informes-patrimonio", personalOnly: true },
  category: { route: "config-categorias", personalOnly: false },
  linked_transfer: { route: "movimientos-transferencias", personalOnly: false },
};

function BlockerNextStep({ kind, accountId, links }: { kind: BlockerKind; accountId: string; links: boolean }) {
  const { dict } = useI18n();
  const href = useHref();
  const label = (dict.fin.hh.share.go as Partial<Record<BlockerKind, string>>)[kind];
  if (!label) return null;
  const target = KIND_ROUTE[kind];
  if (kind !== "pending_entry" && kind !== "reconciled_entry" && (!target || (target.personalOnly && !links))) return null;
  return (
    <>
      {" · "}
      {kind === "pending_entry" || kind === "reconciled_entry" ? (
        <DrillLink filter={{ account: accountId, status: kind === "pending_entry" ? "pendiente" : "conciliado" }}>{label}</DrillLink>
      ) : (
        <Link href={href(target!.route, target!.withAccount ? [accountId] : [])}>{label}</Link>
      )}
    </>
  );
}

/**
 * Lo que el servidor dijo para no mover la cuenta, en palabras y con el siguiente paso: un mensaje y un enlace por cada tipo de
 * `blockers`. Si el `409` no trae la lista (otro motivo, p. ej. un visor), se explica el `code`. Sin valores, solo cuentas de filas.
 */
export function BlockerPanel({ blocker, accountId, links }: { blocker: MoveBlocker; accountId: string; links: boolean }) {
  const { dict } = useI18n();
  const t = dict.fin.hh.share;
  return (
    <div className="status status--negative hh-blocker" role="alert">
      <div>
        <p>
          <strong>{t.blockedTitle}.</strong>{" "}
          {blocker.items.length === 0 ? t.blockers[blocker.code] : null}
        </p>
        {blocker.items.length > 0 && (
          <ul>
            {blocker.items.map((item) => (
              <li key={item.kind}>
                {fill(t.kinds[item.kind], { n: String(item.count) })}
                <BlockerNextStep kind={item.kind} accountId={accountId} links={links} />
              </li>
            ))}
          </ul>
        )}
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
