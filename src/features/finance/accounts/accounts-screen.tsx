"use client";

import Link from "next/link";
import { useState } from "react";
import { type Account, type Institution, type PaymentMethod, type Summary } from "@/api/models";
import { api } from "@/api";
import { normalizeAmountInput } from "@/lib/amount-input";
import { toInt } from "@/lib/ints";
import { compareAmounts, formatCop } from "@/lib/money";
import { todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import type { RouteId } from "@/nav/routes";
import { Icon } from "@/ui/icons";
import { CardList } from "../cards/cards-screen";
import { useAll, useHref, useResource, useSubmit } from "../hooks";
import { accountGroup, SPENDABLE_KINDS } from "../helpers";
import { AmountField, Badge, Banner, Checkbox, Empty, ErrorState, FormActions, LinkTabs, Loading, Modal, Money, ScreenHeader, SelectField, TextField } from "../kit";
import { paths, roots } from "@/api/paths";
import { ReadOnlyBanner } from "../../household/notices";
import { setScope, useActiveHousehold, useCanWrite, useHouseholds, useScope } from "../../household/scope-store";

export type AccountsTab = "todas" | "bancos" | "efectivo" | "debito" | "credito";

const TAB_ROUTE: Record<AccountsTab, RouteId> = { todas: "cuentas", bancos: "cuentas-bancos", efectivo: "cuentas-efectivo", debito: "cuentas-debito", credito: "cuentas-credito" };

/** Cuentas y tarjetas (`/cuentas`, diseño §3.6): cabecera «Disponible hoy · Debes», pestañas del propietario y filas de 72 dp. */
export function AccountsScreen({ tab }: { tab: AccountsTab }) {
  const { dict } = useI18n();
  const t = dict.fin.accounts;
  const href = useHref();
  const accounts = useAll<Account>(paths.accounts());
  const scope = useScope();
  const canWrite = useCanWrite();
  const { household } = useActiveHousehold();
  const both = scope.kind === "both" ? scope : null;
  const inHousehold = scope.kind === "household";
  const summary = useResource<Summary>(both ? paths.summaryBoth(both.id) : paths.summary());
  // «Ambos»: además de las personales (la lista de arriba), las del hogar, pedidas por su ruta propia.
  const householdAccounts = useAll<Account>(both ? paths.householdAccounts(both.id) : null);
  const bothName = useHouseholdName(both?.id);
  const [creating, setCreating] = useState(false);

  const visible = accounts.items.filter((a) => {
    const group = accountGroup(a);
    if (tab === "bancos") return group === "bancos";
    if (tab === "efectivo") return group === "efectivo";
    if (tab === "todas") return group === "bancos" || group === "efectivo";
    return false;
  });

  return (
    <div className="screen">
      <ScreenHeader
        title={dict.screens[TAB_ROUTE[tab]]}
        eyebrow={dict.nav.sections.cuentas}
        actions={
          tab !== "credito" && tab !== "debito" && canWrite ? (
            <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={20} />
              {t.add}
            </button>
          ) : undefined
        }
      />

      <ReadOnlyBanner />
      {summary.data && (
        <dl className="fin-kpis">
          <div className="fin-kpi">
            <dt className="muted">{t.availableToday}</dt>
            <dd className="fin-kpi__value">
              <Money value={summary.data.available_today} />
            </dd>
          </div>
          <div className="fin-kpi">
            <dt className="muted">{t.owed}</dt>
            <dd className="fin-kpi__value">
              <Money value={summary.data.owed} />
            </dd>
          </div>
        </dl>
      )}

      <LinkTabs
        label={t.tabsLabel}
        items={(Object.keys(TAB_ROUTE) as AccountsTab[]).filter((key) => !(inHousehold && key === "credito")).map((key) => ({ href: href(TAB_ROUTE[key]), label: t.tabs[key], current: key === tab }))}
      />

      {(tab === "todas" || tab === "bancos" || tab === "efectivo") && (
        <>
          {accounts.loading && !accounts.data && <Loading />}
          {accounts.failure && <ErrorState message={dict.fin.errors.generic} onRetry={accounts.reload} />}
          {accounts.data && visible.length === 0 && (
            <Empty
              title={t.emptyTitle}
              body={t.emptyBody}
              action={
                canWrite ? (
                  <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
                    {t.addFirst}
                  </button>
                ) : undefined
              }
            />
          )}
          {visible.length > 0 && (
            <ul className="fin-list" aria-label={dict.screens[TAB_ROUTE[tab]]}>
              {visible.map((account) => (
                <li key={account.id}>
                  <AccountRow account={account} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {both && (tab === "todas" || tab === "bancos" || tab === "efectivo") && (
        <section aria-label={fillName(dict.fin.hh.accounts.householdSection, bothName)}>
          <h2 className="title-s">{fillName(dict.fin.hh.accounts.householdSection, bothName)}</h2>
          {householdAccounts.items.filter((a) => visibleIn(tab, a)).length === 0 && householdAccounts.data && <p className="muted">{t.emptyBody}</p>}
          <ul className="fin-list">
            {householdAccounts.items.filter((a) => visibleIn(tab, a)).map((account) => (
              <li key={account.id}>
                <AccountRow account={account} householdId={both.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {tab === "todas" && !inHousehold && <CardList embedded />}
      {tab === "todas" && inHousehold && household && <p className="muted">{dict.fin.hh.accounts.cardsPersonal}</p>}
      {tab === "credito" && <CardList />}
      {tab === "debito" && <DebitMethods />}

      <Modal open={creating} title={t.add} onClose={() => setCreating(false)}>
        <AccountForm
          onDone={() => {
            setCreating(false);
            accounts.reload();
            summary.reload();
          }}
          onCancel={() => setCreating(false)}
        />
      </Modal>
    </div>
  );
}

/** El nombre del hogar de «Ambos» (de la lista de hogares ya cargada). */
function useHouseholdName(id: string | undefined): string {
  const { data } = useHouseholds();
  return (id && data?.households.find((h) => h.id === id)?.name) || "";
}

const fillName = (template: string, name: string) => template.replace("{name}", name);

function visibleIn(tab: AccountsTab, account: Account): boolean {
  const group = accountGroup(account);
  if (tab === "bancos") return group === "bancos";
  if (tab === "efectivo") return group === "efectivo";
  return group === "bancos" || group === "efectivo";
}

/** `householdId`: la cuenta es del hogar y se ve desde «Ambos»; al abrirla el ámbito pasa a ese hogar (su detalle vive allí). */
export function AccountRow({ account, householdId }: { account: Account; householdId?: string }) {
  const { dict } = useI18n();
  const t = dict.fin.accounts;
  const href = useHref();
  const differs = compareAmounts(account.projected_balance, account.posted_balance) !== 0;
  return (
    <Link href={href("cuenta", [account.id])} className="fin-row" onClick={householdId ? () => setScope({ kind: "household", id: householdId }) : undefined}>
      <span className="fin-row__main">
        <span className="fin-row__title">{account.name}</span>
        <span className="fin-row__sub muted">
          {dict.fin.accountKinds[account.kind] ?? account.kind}
          {account.last4 ? ` · •••• ${account.last4}` : ""}
          {account.institution ? ` · ${account.institution.name}` : ""}
        </span>
        <span className="fin-row__badges">
          {account.gmf_exempt && <Badge tone="info">{t.exemptGmf}</Badge>}
          {account.status !== "active" && <Badge tone="warning">{t.status[account.status]}</Badge>}
        </span>
      </span>
      <span className="fin-row__amount">
        <Money value={account.posted_balance} />
        {differs && (
          <span className="fin-row__sub muted">
            {t.projected} <Money value={account.projected_balance} />
          </span>
        )}
      </span>
      <Icon name="chevron-right" size={20} />
    </Link>
  );
}

function DebitMethods() {
  const { dict } = useI18n();
  const t = dict.fin.accounts;
  const href = useHref();
  const methods = useResource<PaymentMethod[]>(paths.paymentMethods());
  const accounts = useAll<Account>(paths.accounts());
  if (methods.loading && !methods.data) return <Loading />;
  if (methods.failure) return <ErrorState message={dict.fin.errors.generic} onRetry={methods.reload} />;
  const debit = (methods.data ?? []).filter((m) => m.kind === "debit");
  if (debit.length === 0) return <Empty title={t.debitEmptyTitle} body={t.debitEmptyBody} />;
  return (
    <>
      <p className="muted">{t.debitIntro}</p>
      <ul className="fin-list">
        {debit.map((method) => {
          const account = accounts.items.find((a) => a.id === method.account_id);
          return (
            <li key={method.id}>
              <Link href={href("cuenta", [method.account_id])} className="fin-row">
                <span className="fin-row__main">
                  <span className="fin-row__title">{method.name}</span>
                  <span className="fin-row__sub muted">
                    {method.last4 ? `•••• ${method.last4} · ` : ""}
                    {account ? `${t.linkedTo} ${account.name}` : ""}
                  </span>
                </span>
                {account && <Money value={account.posted_balance} />}
                <Icon name="chevron-right" size={20} />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

type CreatableKind = (typeof SPENDABLE_KINDS)[number];

function AccountForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.accounts;
  const submit = useSubmit();
  const institutions = useResource<Institution[]>(paths.institutions());
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CreatableKind>("savings");
  const [institution, setInstitution] = useState("");
  const [opening, setOpening] = useState("");
  const [last4, setLast4] = useState("");
  const [exempt, setExempt] = useState(false);
  const [touched, setTouched] = useState(false);

  const openingValue = opening.trim() === "" ? "0" : normalizeAmountInput(opening);
  const nameError = touched && name.trim() === "" ? dict.fin.common.requiredField : null;
  const openingError = openingValue === null ? dict.fin.common.invalidAmount : null;
  const last4Error = last4 !== "" && !/^\d{4}$/.test(last4) ? t.last4Invalid : null;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (name.trim() === "" || openingValue === null || last4Error) return;
    const body = {
      name: name.trim(),
      kind,
      opening_balance: openingValue,
      opening_date: todayBogota(),
      gmf_exempt: exempt,
      ...(institution ? { institution_id: toInt(institution) } : {}),
      ...(last4 ? { last4 } : {}),
    };
    const result = await submit.run(body, (key) => api.post(roots.accounts, body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="fin-form">
      <TextField label={t.fields.name} value={name} onChange={setName} maxLength={80} required error={nameError} />
      <SelectField label={t.fields.kind} value={kind} onChange={(v) => setKind(v as CreatableKind)} options={SPENDABLE_KINDS.map((k) => ({ value: k, label: dict.fin.accountKinds[k] }))} />
      <SelectField label={t.fields.institution} value={institution} onChange={setInstitution} placeholder={t.noInstitution} options={(institutions.data ?? []).map((i) => ({ value: String(i.id), label: i.name }))} />
      <AmountField label={t.fields.opening} hint={t.fields.openingHint} value={opening} onChange={setOpening} error={openingError} preview={openingValue && openingValue !== "0" ? formatCop(openingValue) : null} />
      <TextField label={t.fields.last4} value={last4} onChange={setLast4} inputMode="numeric" maxLength={4} error={last4Error} />
      <Checkbox label={t.fields.exempt} hint={t.fields.exemptHint} checked={exempt} onChange={setExempt} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : t.create}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}
