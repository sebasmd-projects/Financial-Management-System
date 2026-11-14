"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/api";
import type { Account } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { accountGroup, disambiguate, fill } from "../helpers";
import { useAll, useSubmit } from "../hooks";
import { Banner, Checkbox, FormActions, Segmented, SelectField, TextField } from "../kit";
import { activeForwardingCode, createConnectionBody, hasConnection, offeredInstitutions, offeredProviders, syncApi, type Provider, type SyncCatalog, type SyncConnection } from "../../../../core/sync";
import { AddressPanel, ForwardingGuide } from "./forwarding";

const sync = syncApi(api);
const POLL_MS = 8000;

/**
 * «Conectar un banco» (W1): elegir banco, cuenta y proveedor → crear la dirección única → mostrarla UNA vez con su botón de copiar → el filtro
 * paso a paso, el código de confirmación de Gmail y el monto mínimo de las alertas → «Comprobar si llegó». Nequi y Nu no se ofrecen: se
 * activan desde la app. La dirección vive solo en el estado de este componente.
 */
export function Wizard({ catalog, existing, onDone }: { catalog: SyncCatalog; existing: readonly SyncConnection[]; onDone: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.sync.wizard;
  const submit = useSubmit();
  const accounts = useAll<Account>(paths.accounts());
  const institutions = useMemo(() => offeredInstitutions(catalog, "web"), [catalog]);
  const providers = useMemo(() => offeredProviders(catalog), [catalog]);
  const banks = useMemo(() => disambiguate(accounts.items.filter((a) => a.status !== "closed" && accountGroup(a) === "bancos")), [accounts.items]);
  const [institutionId, setInstitutionId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [provider, setProvider] = useState<Provider>(providers[0] ?? "gmail");
  const [label, setLabel] = useState("");
  const [statements, setStatements] = useState(true);
  const [touched, setTouched] = useState(false);
  const [created, setCreated] = useState<SyncConnection | null>(null);

  const institution = institutions.find((i) => String(i.id) === institutionId);
  const duplicate = institution !== undefined && accountId !== "" && hasConnection(existing, institution.id, accountId);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!institution || !accountId) return;
    const body = createConnectionBody({ institutionId: institution.id, accountId, provider, label, includeStatements: statements, locale });
    const result = await submit.run(body, (key) => sync.createConnection(body, key, { locale }));
    if (result.ok) setCreated(result.data);
  }

  if (created) return <Created connection={created} onDone={onDone} onReplace={setCreated} />;

  const req = dict.fin.common.requiredField;
  return (
    <form className="fin-form" onSubmit={(event) => void onCreate(event)} noValidate>
      <h3 className="title-s">{t.step1}</h3>
      <SelectField label={t.institution} value={institutionId} onChange={setInstitutionId} placeholder={t.institutionPlaceholder} required error={touched && !institution ? req : null} options={institutions.map((i) => ({ value: String(i.id), label: i.name }))} />
      <SelectField label={t.account} value={accountId} onChange={setAccountId} placeholder={t.accountPlaceholder} required error={touched && !accountId ? req : null} options={banks.map((a) => ({ value: a.id, label: a.name }))} />
      {!accounts.loading && banks.length === 0 && <p className="muted">{t.noAccounts}</p>}
      <Segmented legend={t.provider} variant="chips" value={provider} onChange={(v) => setProvider(v as Provider)} options={providers.map((p) => ({ value: p, label: dict.fin.sync.conn.providers[p] ?? p }))} />
      <TextField label={t.label} hint={t.labelHint} value={label} onChange={setLabel} maxLength={60} />
      <Checkbox label={t.statements} checked={statements} onChange={setStatements} />
      {duplicate && <p className="hint">{t.duplicate}</p>}
      <p className="hint">{dict.fin.sync.conn.reauthNote}</p>
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
        </Banner>
      )}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? t.creating : t.create}
        </button>
        <button type="button" className="button button--ghost" onClick={onDone}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

/**
 * Después de crear (o de rotar): la dirección, la guía y «Comprobar». Mientras la ventana siga abierta se vuelve a preguntar cada 8 s por la
 * conexión: así llegan solos el código de confirmación de Gmail y el primer correo.
 */
export function Created({ connection, onDone, onReplace }: { connection: SyncConnection; onDone: () => void; onReplace: (next: SyncConnection) => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.sync.wizard;
  const [live, setLive] = useState<SyncConnection>(connection);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const rotate = useSubmit();
  const id = connection.id;

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void sync.connection(id, { redirectOn401: false }).then((result) => {
        if (active && result.ok) setLive((current) => ({ ...result.data, address: current.address }));
      });
    };
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id]);

  async function check() {
    setChecking(true);
    const result = await sync.connection(id, { redirectOn401: false });
    setChecking(false);
    setChecked(true);
    if (result.ok) setLive((current) => ({ ...result.data, address: current.address }));
  }
  async function rotateNow() {
    const result = await rotate.run({ rotate: id }, (key) => sync.rotate(id, key, { locale }));
    if (result.ok) {
      setLive(result.data);
      onReplace(result.data);
    }
  }

  const code = activeForwardingCode(live);
  return (
    <div className="fin-form">
      {live.address ? (
        <AddressPanel address={live.address} />
      ) : (
        <Banner tone="warning" live="assertive">
          <p>{dict.fin.sync.conn.rotateBody}</p>
          <button type="button" className="button button--primary" disabled={rotate.pending} onClick={() => void rotateNow()}>
            {rotate.pending ? dict.fin.sync.conn.working : dict.fin.sync.conn.rotate}
          </button>
        </Banner>
      )}
      {rotate.error && (
        <Banner tone="negative" live="assertive">
          {rotate.error}
        </Banner>
      )}
      <ForwardingGuide provider={(live.provider ?? "other") as Provider} bankName={live.institution_name} code={code} codeExpiresAt={code ? live.forwarding_code_expires_at : null} />
      <section aria-labelledby="sync-test-title" className="fin-card">
        <h3 id="sync-test-title" className="title-s">
          {t.step5}
        </h3>
        <p>{t.testBody}</p>
        <button type="button" className="button button--ghost" disabled={checking} onClick={() => void check()}>
          {checking ? t.testing : t.test}
        </button>
        <p role="status" aria-live="polite">
          {live.last_event_at ? fill(t.testArrived, { date: formatDate(live.last_event_at) }) : checked ? t.testWaiting : ""}
        </p>
      </section>
      <FormActions>
        <button type="button" className="button button--primary" onClick={onDone}>
          {t.done}
        </button>
      </FormActions>
    </div>
  );
}
