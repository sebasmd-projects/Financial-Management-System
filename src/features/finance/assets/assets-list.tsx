"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Asset, AssetKind, Loan } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { formatDate, todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { fill } from "../helpers";
import { useAll, useHref, useSubmit } from "../hooks";
import { AmountField, Badge, Banner, Checkbox, Empty, ErrorState, FormActions, Loading, Modal, Money, Segmented, SelectField, TextArea, TextField } from "../kit";
import { ASSET_KINDS, assetBody, assetProblems, groupAssetsByKind, type AssetForm, type AssetProblem } from "./logic";

/** Los activos del usuario por tipo (diseño §3.13): cada uno abre su detalle con el historial de avalúos. */
export function AssetsList() {
  const { dict } = useI18n();
  const t = dict.fin.assets.list;
  const href = useHref();
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const assets = useAll<Asset>(paths.assets(archived ? { archived: true } : {}));
  const groups = groupAssetsByKind(assets.items);
  return (
    <div className="fin-stack">
      <div className="actions">
        <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={20} />
          {t.add}
        </button>
        <Checkbox label={t.showArchived} checked={archived} onChange={setArchived} />
      </div>
      {assets.loading && !assets.data && <Loading />}
      {assets.failure && <ErrorState message={dict.fin.errors.generic} onRetry={assets.reload} />}
      {assets.data && assets.items.length === 0 && <Empty icon="wallet" title={t.emptyTitle} body={t.emptyBody} />}
      {groups.map((group) => (
        <section key={group.kind} aria-labelledby={`assets-${group.kind}`} className="fin-section">
          <h2 id={`assets-${group.kind}`} className="title-s">
            {dict.fin.assets.kindsPlural[group.kind]}
          </h2>
          <ul className="fin-list">
            {group.items.map((asset) => (
              <li key={asset.id}>
                <Link href={href("informes-activo", [asset.id])} className="fin-row">
                  <span className="fin-row__main">
                    <span className="fin-row__title">{asset.name}</span>
                    <span className="fin-row__sub muted">
                      {asset.last_valuation_on ? fill(t.valuedOn, { date: formatDate(asset.last_valuation_on) }) : t.notValued}
                      {asset.vehicle ? ` · ${fill(t.plate, { plate: asset.vehicle.plate })}` : ""}
                    </span>
                    <span className="fin-row__badges">
                      {asset.archived && <Badge>{t.archived}</Badge>}
                      {asset.loan_id && <Badge tone="info">{t.loan}</Badge>}
                    </span>
                  </span>
                  <Money value={asset.value} />
                  <Icon name="chevron-right" size={20} />
                  <span className="visually-hidden">{fill(t.open, { name: asset.name })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Modal open={creating} title={dict.fin.assets.form.title} onClose={() => setCreating(false)}>
        <AssetFormView
          onCancel={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            assets.reload();
          }}
        />
      </Modal>
    </div>
  );
}

const EMPTY: AssetForm = { kind: "vehicle", name: "", value: "", acquiredOn: "", purchaseValue: "", notes: "", loanId: "", plate: "", brand: "", model: "", year: "", odometer: "" };

function AssetFormView({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.assets.form;
  const submit = useSubmit();
  const today = todayBogota();
  const loans = useAll<Loan>(paths.loans());
  const [form, setForm] = useState<AssetForm>({ ...EMPTY, acquiredOn: today });
  const [touched, setTouched] = useState(false);
  const set = (patch: Partial<AssetForm>) => setForm((current) => ({ ...current, ...patch }));
  const problems = assetProblems(form, today);
  const show = (p: AssetProblem) => (touched && problems.includes(p) ? t.problems[p] : null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (problems.length > 0) return;
    const body = assetBody(form);
    const result = await submit.run(body, (key) => api.post(roots.assets, body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <Segmented legend={t.kind} variant="chips" value={form.kind} onChange={(kind) => set({ kind: kind as AssetKind })} options={ASSET_KINDS.map((k) => ({ value: k, label: dict.fin.assets.kinds[k] }))} />
      <TextField label={t.name} hint={t.nameHint} value={form.name} onChange={(name) => set({ name })} maxLength={80} required error={show("name")} />
      <AmountField label={t.value} hint={t.valueHint} value={form.value} onChange={(value) => set({ value })} required error={show("value")} apiCode={submit.errorCode} />
      <div className="fin-grid-2">
        <TextField label={t.acquiredOn} type="date" value={form.acquiredOn} onChange={(acquiredOn) => set({ acquiredOn })} required error={show("date")} />
        <AmountField label={t.purchaseValue} value={form.purchaseValue} onChange={(purchaseValue) => set({ purchaseValue })} error={show("purchase")} />
      </div>
      {form.kind === "vehicle" && (
        <>
          <div className="fin-grid-2">
            <TextField label={t.plate} value={form.plate} onChange={(plate) => set({ plate })} maxLength={12} required error={show("plate")} />
            <TextField label={t.year} value={form.year} onChange={(year) => set({ year })} inputMode="numeric" maxLength={4} error={show("year")} />
          </div>
          <div className="fin-grid-2">
            <TextField label={t.brand} value={form.brand} onChange={(brand) => set({ brand })} maxLength={60} />
            <TextField label={t.model} value={form.model} onChange={(model) => set({ model })} maxLength={60} />
          </div>
          <TextField label={t.odometer} hint={t.odometerHint} value={form.odometer} onChange={(odometer) => set({ odometer })} inputMode="numeric" error={show("odometer")} />
        </>
      )}
      {loans.items.length > 0 && <SelectField label={t.loan} value={form.loanId} onChange={(loanId) => set({ loanId })} placeholder={t.noLoan} options={loans.items.map((l) => ({ value: l.id, label: l.name }))} />}
      <TextArea label={t.notes} value={form.notes} onChange={(notes) => set({ notes })} maxLength={280} />
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
