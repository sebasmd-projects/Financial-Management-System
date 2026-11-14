"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/api";
import type { Account, Entry, Page } from "@/api/models";
import { paths } from "@/api/paths";
import { compareAmounts } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { EntryTable } from "../movements/entry-table";
import { useHref, useResource, useSubmit } from "../hooks";
import { Badge, Banner, Checkbox, DefinitionList, ErrorState, FormActions, Loading, Modal, Money, Pager, ScreenHeader, Section, TextField } from "../kit";
import { accountGroup } from "../helpers";
import { RemoveDialog } from "../shared/remove";
import { Icon } from "@/ui/icons";
import { shareable } from "../../household/blockers";
import { ReadOnlyBanner } from "../../household/notices";
import { setScope, useCanWrite, useScope } from "../../household/scope-store";
import { ShareAccountDialog, UnshareAccountDialog } from "../../household/share-account";

/** Detalle de cuenta (diseño §3.6): saldos, acciones, bandera 4x1000 y «Ver asientos». */
export function AccountDetail({ id }: { id: string }) {
  const { dict } = useI18n();
  const t = dict.fin.accounts;
  const href = useHref();
  const account = useResource<Account>(paths.account(id));
  const [renaming, setRenaming] = useState(useSearchParams().get("editar") === "1");
  const [removing, setRemoving] = useState(false);
  const [showEntries, setShowEntries] = useState(false);
  const toggle = useSubmit();
  const router = useRouter();
  const scope = useScope();
  const canWrite = useCanWrite();
  const [moving, setMoving] = useState(false);

  const back = { href: href("cuentas"), label: dict.screens.cuentas };
  if (account.loading && !account.data) return <div className="screen"><ScreenHeader title={dict.screens.cuenta} back={back} /><Loading /></div>;
  if (account.failure || !account.data) {
    return (
      <div className="screen">
        <ScreenHeader title={dict.screens.cuenta} back={back} />
        <ErrorState message={account.failure?.status === 404 ? dict.fin.errors.notFound : dict.fin.errors.generic} onRetry={account.reload} />
      </div>
    );
  }
  const a = account.data;
  const differs = compareAmounts(a.projected_balance, a.posted_balance) !== 0;
  const group = accountGroup(a);

  async function setExempt(value: boolean) {
    const result = await toggle.run({ gmf_exempt: value }, (key) => api.patch<Account>(paths.account(id), { gmf_exempt: value }, { idempotencyKey: key }));
    if (result.ok) account.reload();
  }

  return (
    <div className="screen">
      <ScreenHeader
        title={a.name}
        eyebrow={dict.fin.accountKinds[a.kind] ?? a.kind}
        back={back}
        actions={
          canWrite ? (
            <>
              <button type="button" className="button button--ghost" onClick={() => setRenaming(true)}>
                {dict.fin.own.edit}
              </button>
              <button type="button" className="button button--ghost" onClick={() => setRemoving(true)}>
                {dict.fin.own.delete}
              </button>
            </>
          ) : undefined
        }
      />
      <ReadOnlyBanner />
      <section className="fin-card" aria-label={t.balances}>
        <p className="muted">{t.confirmedBalance}</p>
        <p className="fin-big">
          <Money value={a.posted_balance} />
        </p>
        {differs && (
          <p className="muted">
            {t.projected} <Money value={a.projected_balance} />
          </p>
        )}
        <p className="fin-row__badges">
          {a.is_default && (
            <Badge tone="info">
              <Icon name="star" size={14} /> {dict.fin.own.default.badge}
            </Badge>
          )}
          {a.gmf_exempt && <Badge tone="info">{t.exemptGmf}</Badge>}
          {a.status !== "active" && <Badge tone="warning">{t.status[a.status]}</Badge>}
        </p>
      </section>

      <div className="actions">
        {(group === "bancos" || group === "efectivo") && canWrite && (
          <Link className="button button--primary" href={`${href("movimiento-nuevo")}?tipo=transferencia&desde=${encodeURIComponent(a.id)}`}>
            {t.transfer}
          </Link>
        )}
        {(group === "bancos" || group === "efectivo") && scope.kind !== "household" && (
          <Link className="button button--ghost" href={href("cuenta-conciliar", [a.id])}>
            {dict.fin.recon.action}
          </Link>
        )}
        <Link className="button button--ghost" href={`${href("movimientos")}?cuenta=${encodeURIComponent(a.id)}`}>
          {t.viewMovements}
        </Link>
        {scope.kind !== "household" && shareable(a) && (
          <button type="button" className="button button--ghost" onClick={() => setMoving(true)}>
            {dict.fin.hh.share.action}
          </button>
        )}
        {scope.kind === "household" && canWrite && shareable(a) && (
          <button type="button" className="button button--ghost" onClick={() => setMoving(true)}>
            {dict.fin.hh.share.unshare}
          </button>
        )}
        <button type="button" className="button button--ghost" aria-expanded={showEntries} onClick={() => setShowEntries((v) => !v)}>
          {t.viewEntries}
        </button>
      </div>

      <Section title={t.settings}>
        <Checkbox label={t.fields.exempt} help={dict.fin.help.texts.gmfExempt} hint={t.fields.exemptHint} checked={a.gmf_exempt} disabled={!canWrite} onChange={(v) => void setExempt(v)} />
        {toggle.error && <Banner tone="negative" live="assertive">{toggle.error}</Banner>}
        <DefinitionList
          rows={[
            { label: t.fields.kind, value: dict.fin.accountKinds[a.kind] ?? a.kind },
            ...(a.institution ? [{ label: t.fields.institution, value: a.institution.name }] : []),
            ...(a.last4 ? [{ label: t.fields.last4, value: `•••• ${a.last4}` }] : []),
          ]}
        />
      </Section>

      {showEntries && <AccountEntries accountId={a.id} />}

      {scope.kind !== "household" ? (
        <ShareAccountDialog
          open={moving}
          account={a}
          onClose={() => setMoving(false)}
          onDone={(householdId) => {
            setMoving(false);
            setScope({ kind: "household", id: householdId });
            router.push(href("cuentas"));
          }}
        />
      ) : (
        <UnshareAccountDialog
          open={moving}
          householdId={scope.id}
          account={a}
          onClose={() => setMoving(false)}
          onDone={() => {
            setMoving(false);
            setScope({ kind: "personal" });
            router.push(href("cuentas"));
          }}
        />
      )}

      <RemoveDialog open={removing} kind="account" id={a.id} name={a.name} onClose={() => setRemoving(false)} onDone={() => { setRemoving(false); router.push(href("cuentas")); }} />
      <Modal open={renaming} title={dict.fin.own.account.editTitle} onClose={() => setRenaming(false)}>
        <RenameForm
          account={a}
          onCancel={() => setRenaming(false)}
          onDone={() => {
            setRenaming(false);
            account.reload();
          }}
        />
      </Modal>
    </div>
  );
}

function AccountEntries({ accountId }: { accountId: string }) {
  const { dict } = useI18n();
  const [page, setPage] = useState(1);
  const entries = useResource<Page<Entry>>(paths.entries({ account: accountId, page, page_size: 20 }));
  return (
    <Section title={dict.fin.accounts.viewEntries}>
      {entries.loading && !entries.data && <Loading />}
      {entries.failure && <ErrorState message={dict.fin.errors.generic} onRetry={entries.reload} />}
      {entries.data && entries.data.results.length === 0 && <p className="muted">{dict.fin.entries.none}</p>}
      {entries.data?.results.map((entry) => (
        <EntryTable key={entry.id} entry={entry} highlightAccount={accountId} />
      ))}
      {entries.data && <Pager page={page} count={entries.data.count} pageSize={20} onPage={setPage} />}
    </Section>
  );
}

function RenameForm({ account, onDone, onCancel }: { account: Account; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const o = dict.fin.own;
  const submit = useSubmit();
  const [name, setName] = useState(account.name);
  const [last4, setLast4] = useState(account.last4 ?? "");
  const [isDefault, setDefault] = useState(account.is_default);
  const last4Bad = last4 !== "" && !/^\d{4}$/.test(last4);
  // La predeterminada es de una cuenta de activo o tarjeta abierta.
  const canDefault = account.status === "active" && accountGroup(account) !== "prestamo" && accountGroup(account) !== "otro";
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim() === "" || last4Bad) return;
    const body: Record<string, unknown> = {};
    if (name.trim() !== account.name) body.name = name.trim();
    if ((last4 || null) !== account.last4) body.last4 = last4 || null;
    if (isDefault !== account.is_default) body.is_default = isDefault;
    if (Object.keys(body).length === 0) return onDone();
    const result = await submit.run(body, (key) => api.patch(paths.account(account.id), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={dict.fin.accounts.fields.name} value={name} onChange={setName} maxLength={80} required />
      <TextField label={o.account.last4} value={last4} onChange={setLast4} inputMode="numeric" maxLength={4} error={last4Bad ? dict.fin.accounts.last4Invalid : null} />
      {canDefault && <Checkbox label={o.default.toggle} hint={o.default.hint} checked={isDefault} onChange={setDefault} />}
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || name.trim() === "" || last4Bad}>
          {o.save}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}
