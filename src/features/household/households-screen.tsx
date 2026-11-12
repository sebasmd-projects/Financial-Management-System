"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Household } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { fill } from "../finance/helpers";
import { useHref, useSubmit } from "../finance/hooks";
import { Badge, Banner, Empty, ErrorState, FormActions, Loading, Modal, ScreenHeader, TextField } from "../finance/kit";
import { sameScope } from "./scope";
import { refreshHouseholds, setScope, useHouseholds, useScope } from "./scope-store";

/** Hogares (`/hogar`): los míos, el que estoy viendo, crear uno y las invitaciones pendientes. */
export function HouseholdsScreen() {
  const { dict } = useI18n();
  const t = dict.fin.hh.list;
  const href = useHref();
  const { data, status, reload } = useHouseholds();
  const [creating, setCreating] = useState(false);
  const scope = useScope();
  const invitations = data?.invitations.length ?? 0;

  return (
    <div className="screen">
      <ScreenHeader
        title={dict.screens.hogares}
        eyebrow={dict.nav.sections.cuentas}
        actions={
          <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={20} />
            {t.create}
          </button>
        }
      />
      <p className="muted">{t.intro}</p>
      {invitations > 0 && (
        <p className="fin-phrase" role="status">
          <Link href={href("hogar-invitaciones")}>{fill(t.invitationsLink, { n: String(invitations) })}</Link>
        </p>
      )}
      {status === "loading" && !data && <Loading />}
      {status === "error" && !data && <ErrorState message={dict.fin.hh.scope.loadError} onRetry={() => void reload()} />}
      {data && data.households.length === 0 && (
        <Empty
          icon="wallet"
          title={t.emptyTitle}
          body={t.emptyBody}
          action={
            <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
              {t.create}
            </button>
          }
        />
      )}
      {data && data.households.length > 0 && (
        <ul className="fin-list" aria-label={dict.screens.hogares}>
          {data.households.map((household) => (
            <li key={household.id}>
              <HouseholdRow household={household} viewing={sameScope(scope, { kind: "household", id: household.id }) || sameScope(scope, { kind: "both", id: household.id })} />
            </li>
          ))}
        </ul>
      )}
      <Modal open={creating} title={t.createTitle} onClose={() => setCreating(false)}>
        <CreateForm onDone={() => setCreating(false)} onCancel={() => setCreating(false)} />
      </Modal>
    </div>
  );
}

function HouseholdRow({ household, viewing }: { household: Household; viewing: boolean }) {
  const { dict } = useI18n();
  const t = dict.fin.hh;
  const href = useHref();
  return (
    <div className="fin-row hh-row">
      <span className="fin-row__main">
        <span className="fin-row__title">{household.name}</span>
        <span className="fin-row__sub muted">{household.members === 1 ? t.list.member : fill(t.list.members, { n: String(household.members) })}</span>
        <span className="fin-row__badges">
          <Badge tone="info">{t.roles[household.role]}</Badge>
          {household.rotating && <Badge tone="warning">{t.list.rotating}</Badge>}
          {viewing && <Badge tone="positive">{t.list.viewing}</Badge>}
        </span>
      </span>
      <span className="hh-row__actions">
        {!viewing && (
          <button type="button" className="button button--ghost" onClick={() => setScope({ kind: "household", id: household.id })}>
            {t.list.use}
          </button>
        )}
        <Link className="button button--ghost" href={href("hogar", [household.id])}>
          {t.list.open}
          <span className="visually-hidden"> {household.name}</span>
        </Link>
      </span>
    </div>
  );
}

function CreateForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.hh.list;
  const submit = useSubmit();
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const trimmed = name.trim();
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (trimmed === "") return;
    const body = { name: trimmed };
    const result = await submit.run(body, (key) => api.post<Household>(paths.households(), body, { idempotencyKey: key, locale }));
    if (result.ok) {
      await refreshHouseholds();
      setScope({ kind: "household", id: result.data.id });
      onDone();
    }
  }
  return (
    <form onSubmit={onSubmit} noValidate className="fin-form">
      <TextField label={t.name} hint={t.nameHint} value={name} onChange={setName} maxLength={80} required error={touched && trimmed === "" ? dict.fin.common.requiredField : null} />
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
        </Banner>
      )}
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
