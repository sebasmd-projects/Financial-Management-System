"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Asset, AssetValuation, Page } from "@/api/models";
import { paths } from "@/api/paths";
import { parsePositiveAmount } from "@/lib/amount-input";
import { formatDate, todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { DrillLink } from "../drill-link";
import { fill } from "../helpers";
import { useHref, useResource, useSubmit } from "../hooks";
import { AmountField, Badge, Banner, DefinitionList, ErrorState, FormActions, Loading, Modal, Money, Pager, ScreenHeader, Section, TextArea, TextField } from "../kit";
import { valuationDelta } from "./logic";
import { VehicleSection } from "./vehicle-section";

/** `/informes/patrimonio/activos/[id]` (diseño §3.13, corte 2.7): valor actual, historial de avalúos y, si es un vehículo, todo lo suyo. */
export function AssetDetail({ id }: { id: string }) {
  const { dict } = useI18n();
  const t = dict.fin.assets.detail;
  const href = useHref();
  const asset = useResource<Asset>(paths.asset(id));
  const [page, setPage] = useState(1);
  const valuations = useResource<Page<AssetValuation>>(paths.assetValuations(id, { page }));
  const [valuing, setValuing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const archive = useSubmit();
  const back = { href: href("informes-patrimonio"), label: t.back };
  const title = asset.data?.name ?? dict.screens["informes-activo"];

  if (asset.loading && !asset.data) return <div className="screen"><ScreenHeader title={title} back={back} /><Loading /></div>;
  if (asset.failure || !asset.data) {
    return (
      <div className="screen">
        <ScreenHeader title={title} back={back} />
        <ErrorState message={asset.failure?.status === 404 ? t.notFound : dict.fin.errors.generic} onRetry={asset.reload} />
      </div>
    );
  }
  const a = asset.data;
  const refresh = () => {
    asset.reload();
    valuations.reload();
  };
  async function toggleArchive() {
    const result = await archive.run({ id, archived: !a.archived }, (key) => api.patch<Asset>(paths.asset(id), { archived: !a.archived }, { idempotencyKey: key }));
    if (result.ok) asset.reload();
  }
  return (
    <div className="screen">
      <ScreenHeader title={a.name} eyebrow={dict.fin.assets.kinds[a.kind]} back={back} />
      {notice && <Banner tone="positive">{notice}</Banner>}
      {a.archived && <Banner tone="warning" live="off">{t.archivedNote}</Banner>}
      <section className="fin-card" aria-label={t.value}>
        <p className="muted">{t.value}</p>
        <p className="fin-big" data-testid="asset-value">
          <Money value={a.value} />
        </p>
        <p className="fin-row__badges">
          <span className="muted">{a.last_valuation_on ? fill(t.valuedOn, { date: formatDate(a.last_valuation_on) }) : t.notValued}</span>
          {a.archived && <Badge>{dict.fin.assets.list.archived}</Badge>}
        </p>
      </section>

      <div className="actions">
        {!a.archived && (
          <button type="button" className="button button--primary" onClick={() => setValuing(true)}>
            {t.update}
          </button>
        )}
        <DrillLink filter={{ account: a.account_id }} className="button button--ghost">
          {t.movements}
        </DrillLink>
        <button type="button" className="button button--ghost" onClick={() => setEditing(true)}>
          {t.edit}
        </button>
        <button type="button" className="button button--ghost" onClick={() => void toggleArchive()} disabled={archive.pending}>
          {a.archived ? t.unarchive : t.archive}
        </button>
      </div>
      {archive.error && <Banner tone="negative" live="assertive">{archive.error}</Banner>}

      <Section title={t.info}>
        <DefinitionList
          rows={[
            { label: t.acquiredLabel, value: formatDate(a.acquired_on) },
            ...(a.purchase_value ? [{ label: t.purchase, value: <Money value={a.purchase_value} /> }] : []),
            ...(a.loan_id ? [{ label: t.loan, value: <Link href={href("credito", [a.loan_id])}>{t.viewLoan}</Link> }] : []),
            ...(a.notes ? [{ label: t.notes, value: a.notes }] : []),
          ]}
        />
      </Section>

      {a.vehicle && <VehicleSection asset={a} vehicle={a.vehicle} onChanged={refresh} />}

      <Section title={dict.fin.assets.valuation.history}>
        {valuations.loading && !valuations.data && <Loading />}
        {valuations.failure && <ErrorState message={dict.fin.errors.generic} onRetry={valuations.reload} />}
        {valuations.data && valuations.data.results.length === 0 && <p className="muted">{dict.fin.assets.valuation.empty}</p>}
        {valuations.data && valuations.data.results.length > 0 && <ValuationTable items={valuations.data.results} />}
        {valuations.data && <Pager page={page} count={valuations.data.count} pageSize={valuations.data.page_size} onPage={setPage} />}
      </Section>

      <Modal open={valuing} title={dict.fin.assets.valuation.title} onClose={() => setValuing(false)}>
        <ValuationForm
          assetId={id}
          current={a.value}
          onCancel={() => setValuing(false)}
          onDone={() => {
            setValuing(false);
            setNotice(dict.fin.assets.valuation.saved);
            setPage(1);
            refresh();
          }}
        />
      </Modal>
      <Modal open={editing} title={t.editTitle} onClose={() => setEditing(false)}>
        <EditForm
          asset={a}
          onCancel={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            setNotice(t.renamed);
            asset.reload();
          }}
        />
      </Modal>
    </div>
  );
}

function ValuationTable({ items }: { items: readonly AssetValuation[] }) {
  const { dict } = useI18n();
  const t = dict.fin.assets.valuation;
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="visually-hidden">{t.tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{t.date}</th>
            <th scope="col" className="table__num">{t.valueCol}</th>
            <th scope="col" className="table__num">{t.change}</th>
            <th scope="col">{t.sourceCol}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((v) => (
            <tr key={v.id}>
              <th scope="row">{formatDate(v.on)}</th>
              <td className="table__num"><Money value={v.value} /></td>
              <td className="table__num"><Money value={valuationDelta(v.value, v.previous_value)} sign="always" /></td>
              <td>{v.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ValuationForm({ assetId, current, onDone, onCancel }: { assetId: string; current: string; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.assets.valuation;
  const submit = useSubmit();
  const today = todayBogota();
  const [value, setValue] = useState("");
  const [on, setOn] = useState(today);
  const [source, setSource] = useState("");
  const [touched, setTouched] = useState(false);
  const amount = parsePositiveAmount(value);
  const valid = amount !== null && source.trim() !== "" && on !== "" && on <= today;
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const body = { value: amount!, on, source: source.trim() };
    const result = await submit.run(body, (key) => api.post(paths.assetValuationCreate(assetId), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <p className="muted">{t.intro}</p>
      <p className="hint">
        {dict.fin.assets.detail.value}: <Money value={current} />
      </p>
      <AmountField label={t.value} value={value} onChange={setValue} required error={touched && amount === null ? dict.fin.common.invalidAmount : null} apiCode={submit.errorCode} />
      <TextField label={t.on} type="date" value={on} onChange={setOn} required error={touched && (on === "" || on > today) ? dict.fin.errors.date_in_future : null} />
      <TextField label={t.source} hint={t.sourceHint} value={source} onChange={setSource} maxLength={120} required error={touched && source.trim() === "" ? dict.fin.errors.source_required : null} />
      {submit.error && submit.errorCode !== "too_many_decimals" && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : t.save}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

function EditForm({ asset, onDone, onCancel }: { asset: Asset; onDone: () => void; onCancel: () => void }) {
  const { dict } = useI18n();
  const submit = useSubmit();
  const [name, setName] = useState(asset.name);
  const [notes, setNotes] = useState(asset.notes ?? "");
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim() === "") return;
    const body = { name: name.trim(), notes: notes.trim() === "" ? null : notes.trim() };
    const result = await submit.run(body, (key) => api.patch(paths.asset(asset.id), body, { idempotencyKey: key }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={dict.fin.assets.form.name} value={name} onChange={setName} maxLength={80} required />
      <TextArea label={dict.fin.assets.form.notes} value={notes} onChange={setNotes} maxLength={280} />
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
  );
}
