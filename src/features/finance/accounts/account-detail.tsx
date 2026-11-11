"use client";

import Link from "next/link";
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

/** Detalle de cuenta (diseño §3.6): saldos, acciones, bandera 4x1000 y «Ver asientos». */
export function AccountDetail({ id }: { id: string }) {
  const { dict } = useI18n();
  const t = dict.fin.accounts;
  const href = useHref();
  const account = useResource<Account>(paths.account(id));
  const [renaming, setRenaming] = useState(false);
  const [showEntries, setShowEntries] = useState(false);
  const toggle = useSubmit();

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
    const result = await toggle.run({ exempt_gmf: value }, (key) => api.patch<Account>(paths.account(id), { exempt_gmf: value }, { idempotencyKey: key }));
    if (result.ok) account.reload();
  }

  return (
    <div className="screen">
      <ScreenHeader
        title={a.name}
        eyebrow={dict.fin.accountKinds[a.kind] ?? a.kind}
        back={back}
        actions={
          <button type="button" className="button button--ghost" onClick={() => setRenaming(true)}>
            {t.rename}
          </button>
        }
      />
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
          {a.exempt_gmf && <Badge tone="info">{t.exemptGmf}</Badge>}
          {a.status !== "active" && <Badge tone="warning">{t.status[a.status]}</Badge>}
        </p>
      </section>

      <div className="actions">
        {(group === "bancos" || group === "efectivo") && (
          <Link className="button button--primary" href={`${href("movimiento-nuevo")}?tipo=transferencia&desde=${encodeURIComponent(a.id)}`}>
            {t.transfer}
          </Link>
        )}
        <Link className="button button--ghost" href={`${href("movimientos")}?cuenta=${encodeURIComponent(a.id)}`}>
          {t.viewMovements}
        </Link>
        <button type="button" className="button button--ghost" aria-expanded={showEntries} onClick={() => setShowEntries((v) => !v)}>
          {t.viewEntries}
        </button>
      </div>

      <Section title={t.settings}>
        <Checkbox label={t.fields.exempt} hint={t.fields.exemptHint} checked={a.exempt_gmf} onChange={(v) => void setExempt(v)} />
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

      <Modal open={renaming} title={t.rename} onClose={() => setRenaming(false)}>
        <RenameForm
          current={a.name}
          onCancel={() => setRenaming(false)}
          onDone={() => {
            setRenaming(false);
            account.reload();
          }}
          accountId={a.id}
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

function RenameForm({ accountId, current, onDone, onCancel }: { accountId: string; current: string; onDone: () => void; onCancel: () => void }) {
  const { dict } = useI18n();
  const submit = useSubmit();
  const [name, setName] = useState(current);
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim() === "") return;
    const result = await submit.run({ name }, (key) => api.patch(paths.account(accountId), { name: name.trim() }, { idempotencyKey: key }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={dict.fin.accounts.fields.name} value={name} onChange={setName} maxLength={80} required />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || name.trim() === ""}>
          {dict.fin.common.save}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}
