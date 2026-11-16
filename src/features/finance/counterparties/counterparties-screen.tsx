"use client";

import { useState } from "react";
import { api } from "@/api";
import { errorText } from "@/api/errors";
import type { Counterparty } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { ReadOnlyBanner } from "../../household/notices";
import { useCanWrite } from "../../household/scope-store";
import { fill } from "../helpers";
import { useAll, useSubmit } from "../hooks";
import { Badge, Banner, Empty, ErrorState, FormActions, Loading, Modal, ScreenHeader, SelectField, TextField } from "../kit";
import { RemoveDialog } from "../shared/remove";
import { CHANNELS, fold, identifierText, takenName } from "./logic";

type Editing = { kind: "new" } | { kind: "edit"; party: Counterparty } | { kind: "merge"; party: Counterparty };

/**
 * Contrapartes (`/configuracion/contrapartes`): las personas y comercios con nombre y sus cuentas (celular, cuenta, QR, PSE). Cambiar el nombre
 * lo cambia en todos sus movimientos; fusionar junta dos en una; eliminar la manda a la papelera de 30 días.
 */
export function CounterpartiesScreen() {
  const { dict } = useI18n();
  const t = dict.fin.cp;
  const s = t.screen;
  const canWrite = useCanWrite();
  const parties = useAll<Counterparty>(paths.counterparties({ page_size: 100 }));
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<Counterparty | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const digits = search.replace(/\D/g, "");
  const items = [...parties.items]
    .filter((p) => search.trim() === "" || fold(p.name).includes(fold(search)) || (digits.length > 0 && p.identifiers.some((i) => i.last4.endsWith(digits.slice(-4)))))
    .sort((a, b) => fold(a.name).localeCompare(fold(b.name)));

  function done(message?: string) {
    setEditing(null);
    if (message) setNotice(message);
    parties.reload();
  }

  return (
    <div className="screen">
      <ScreenHeader
        title={dict.screens["config-contrapartes"]}
        eyebrow={dict.nav.sections.config}
        actions={
          canWrite ? (
            <button type="button" className="button button--primary" onClick={() => setEditing({ kind: "new" })}>
              <Icon name="plus" size={20} />
              {s.add}
            </button>
          ) : undefined
        }
      />
      <ReadOnlyBanner />
      <p className="muted">{s.intro}</p>
      {notice && <Banner tone="positive">{notice}</Banner>}
      <TextField label={s.search} value={search} onChange={setSearch} maxLength={80} />
      {parties.loading && !parties.data && <Loading />}
      {parties.failure && <ErrorState message={dict.fin.errors.generic} onRetry={parties.reload} />}
      {parties.data && parties.items.length === 0 && <Empty title={s.emptyTitle} body={s.emptyBody} icon="list" />}
      {parties.items.length > 0 && items.length === 0 && <p className="muted">{s.noResults}</p>}
      <ul className="fin-list">
        {items.map((party) => (
          <li key={party.id} className="fin-row fin-row--static">
            <span className="fin-row__main">
              <span className="fin-row__title">{party.name}</span>
              <span className="fin-row__sub muted tabular" data-testid={`accounts-${party.id}`}>
                {party.identifiers.length === 0 ? s.noAccounts : party.identifiers.map((i) => identifierText(i, t)).join(" · ")}
              </span>
              <span className="fin-row__badges">
                <Badge>{fill(s.movements, { count: String(party.movements) })}</Badge>
                {party.archived && <Badge>{s.archived}</Badge>}
              </span>
            </span>
            {canWrite && (
              <>
                <button type="button" className="button button--ghost" onClick={() => setEditing({ kind: "edit", party })}>
                  {s.edit}
                  <span className="visually-hidden"> {party.name}</span>
                </button>
                <button type="button" className="button button--ghost" onClick={() => setEditing({ kind: "merge", party })}>
                  {s.merge}
                  <span className="visually-hidden"> {party.name}</span>
                </button>
                <button type="button" className="button button--ghost" onClick={() => setRemoving(party)}>
                  {s.delete}
                  <span className="visually-hidden"> {party.name}</span>
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <RemoveDialog
        open={removing !== null}
        kind="counterparty"
        id={removing?.id ?? ""}
        name={removing?.name ?? ""}
        onClose={() => setRemoving(null)}
        onDone={() => {
          if (removing) setNotice(fill(s.removed, { name: removing.name }));
          setRemoving(null);
          parties.reload();
        }}
      />
      <Modal open={editing?.kind === "new"} title={s.add} onClose={() => setEditing(null)}>
        <PartyForm party={null} onCancel={() => setEditing(null)} onDone={() => done()} />
      </Modal>
      <Modal open={editing?.kind === "edit"} title={editing?.kind === "edit" ? editing.party.name : s.edit} onClose={() => setEditing(null)}>
        {editing?.kind === "edit" && <PartyForm party={editing.party} onCancel={() => setEditing(null)} onDone={() => done()} />}
      </Modal>
      <Modal open={editing?.kind === "merge"} title={editing?.kind === "merge" ? fill(s.mergeTitle, { name: editing.party.name }) : s.merge} onClose={() => setEditing(null)}>
        {editing?.kind === "merge" && <MergeForm party={editing.party} all={parties.items} onCancel={() => setEditing(null)} onDone={() => done()} />}
      </Modal>
    </div>
  );
}

/** Alta o edición: el nombre y sus cuentas (agregar con canal y valor, quitar). Una cuenta de otra contraparte pregunta antes de pasarla. */
function PartyForm({ party, onDone, onCancel }: { party: Counterparty | null; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.cp;
  const submit = useSubmit();
  const [name, setName] = useState(party?.name ?? "");
  const [archived, setArchived] = useState(party?.archived ?? false);
  const [accounts, setAccounts] = useState(party?.identifiers ?? []);
  const [channel, setChannel] = useState<string>("nequi");
  const [value, setValue] = useState("");
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim() === "") return;
    const result = party
      ? await submit.run({ name, archived }, (key) => api.patch(paths.counterparty(party.id), { name: name.trim(), archived }, { idempotencyKey: key }))
      : await submit.run({ name }, (key) => api.post(roots.counterparties, { name: name.trim() }, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }

  async function addAccount(onConflict?: "move") {
    if (!party || value.trim() === "" || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await api.post<Counterparty>(paths.counterpartyIdentifiers(party.id), { channel, value: value.trim(), ...(onConflict ? { on_conflict: onConflict } : {}) }, { locale });
      if (result.ok) {
        setAccounts(result.data.identifiers);
        setValue("");
        setMoveFrom(null);
        return;
      }
      const current = result.status === 409 && result.code === "identifier_taken" ? takenName(result.data) : null;
      if (current !== null) setMoveFrom(current);
      else setError(errorText(result, dict.fin.errors));
    } finally {
      setPending(false);
    }
  }

  async function removeAccount(identifierId: string) {
    if (!party) return;
    const result = await api.delete(paths.counterpartyIdentifier(party.id, identifierId));
    if (result.ok) setAccounts((current) => current.filter((i) => i.id !== identifierId));
    else setError(errorText(result, dict.fin.errors));
  }

  return (
    <div className="fin-form">
      <form onSubmit={saveName} className="fin-form" noValidate>
        <TextField label={t.screen.name} value={name} onChange={setName} maxLength={80} required />
        {party && (
          <label className="checkbox">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> <span>{t.screen.archive}</span>
          </label>
        )}
        {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
        <FormActions>
          <button type="submit" className="button button--primary" disabled={submit.pending || name.trim() === ""}>
            {submit.pending ? dict.fin.common.saving : dict.fin.common.save}
          </button>
          <button type="button" className="button button--ghost" onClick={onCancel}>
            {dict.common.cancel}
          </button>
        </FormActions>
      </form>
      {party && (
        <section aria-label={t.screen.accountsTitle} className="fin-form">
          <h3 className="title-s">{t.screen.accountsTitle}</h3>
          {accounts.length === 0 && <p className="muted">{t.screen.noAccounts}</p>}
          <ul className="cp-accounts">
            {accounts.map((account) => (
              <li key={account.id} className="cp-account">
                <Badge>{identifierText(account, t)}</Badge>
                <button type="button" className="button button--ghost" onClick={() => void removeAccount(account.id)}>
                  {t.screen.removeAccount}
                  <span className="visually-hidden"> {identifierText(account, t)}</span>
                </button>
              </li>
            ))}
          </ul>
          <SelectField label={t.channelLabel} value={channel} onChange={setChannel} options={CHANNELS.map((c) => ({ value: c, label: t.channels[c] }))} />
          <TextField label={t.accountLabel} value={value} onChange={setValue} maxLength={60} />
          {moveFrom !== null && (
            <Banner tone="warning" live="assertive">
              <p>{fill(t.conflictAsk, { old: moveFrom, new: name })}</p>
              <p>
                <button type="button" className="button button--secondary" disabled={pending} onClick={() => void addAccount("move")}>
                  {t.conflictMove}
                </button>
              </p>
            </Banner>
          )}
          {error && <Banner tone="negative" live="assertive">{error}</Banner>}
          <p>
            <button type="button" className="button button--secondary" disabled={pending || value.trim() === ""} onClick={() => void addAccount()}>
              {t.screen.addAccount}
            </button>
          </p>
        </section>
      )}
    </div>
  );
}

function MergeForm({ party, all, onDone, onCancel }: { party: Counterparty; all: readonly Counterparty[]; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.cp.screen;
  const submit = useSubmit();
  const [into, setInto] = useState("");
  const options = all.filter((p) => p.id !== party.id).map((p) => ({ value: p.id, label: p.name }));
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!into) return;
    const result = await submit.run({ into }, () => api.post(paths.counterpartyMerge(party.id), { into }, { locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <p className="muted">{fill(t.mergeHelp, { name: party.name })}</p>
      <SelectField label={t.mergeInto} value={into} onChange={setInto} placeholder="—" options={options} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || !into}>
          {t.mergeConfirm}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}
