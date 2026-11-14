"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Account, Asset, Category, Maintenance, MaintenanceRecord, Named, Vehicle, VehicleCost, VehicleCostKind, VehicleCostSummary } from "@/api/models";
import { paths } from "@/api/paths";
import { parsePositiveAmount } from "@/lib/amount-input";
import { formatDate, todayBogota } from "@/lib/dates";
import { formatKm } from "@/lib/decimal";
import { toInt } from "@/lib/ints";
import { absAmount, isNegativeAmount, isZeroAmount } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { DrillLink } from "../drill-link";
import { fill, movementAccounts } from "../helpers";
import { CategoryCombobox } from "../category-combobox";
import { useAll, useHref, useResource, useSubmit } from "../hooks";
import { AmountField, Badge, Banner, DefinitionList, Empty, ErrorState, FormActions, Loading, Modal, Money, Section, Segmented, SelectField, TextArea, TextField } from "../kit";
import { maintenanceRule, odometerGoesBack, parseKm, VEHICLE_COST_KINDS } from "./logic";

type Notice = (text: string) => void;

/** El vehículo (diseño §3.13): odómetro, costos anuales como recurrencias con aviso, mantenimiento por fecha o kilometraje y costo por mes y por km. */
export function VehicleSection({ asset, vehicle, onChanged }: { asset: Asset; vehicle: Vehicle; onChanged: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.assets.vehicle;
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Subir el odómetro cambia el estado de TODOS los mantenimientos («lo que ocurra primero»): la lista se vuelve a pedir.
  const [odometerVersion, setOdometerVersion] = useState(0);
  return (
    <div className="fin-stack" data-testid="vehicle-section">
      {notice && <Banner tone="positive">{notice}</Banner>}
      <VehicleInfo vehicle={vehicle} onOdometer={() => setEditing(true)} />
      <CostSummary asset={asset} />
      <AnnualCosts asset={asset} notice={setNotice} />
      <MaintenanceList key={odometerVersion} asset={asset} vehicle={vehicle} notice={setNotice} onChanged={onChanged} onOdometer={() => setEditing(true)} />
      <Modal open={editing} title={t.odometerTitle} onClose={() => setEditing(false)}>
        <OdometerForm
          assetId={asset.id}
          current={vehicle.odometer_km}
          onCancel={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            setNotice(t.odometerSaved);
            setOdometerVersion((v) => v + 1);
            onChanged();
          }}
        />
      </Modal>
    </div>
  );
}

function VehicleInfo({ vehicle, onOdometer }: { vehicle: Vehicle; onOdometer: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.assets.vehicle;
  const brandModel = [vehicle.brand, vehicle.model].filter(Boolean).join(" ");
  return (
    <Section
      title={t.title}
      aside={
        <button type="button" className="button button--ghost" onClick={onOdometer}>
          {t.updateOdometer}
        </button>
      }
    >
      <DefinitionList
        rows={[
          { label: t.plate, value: <span className="tabular">{vehicle.plate}</span> },
          ...(brandModel ? [{ label: t.brand, value: brandModel }] : []),
          ...(vehicle.year ? [{ label: t.year, value: String(vehicle.year) }] : []),
          { label: t.odometer, value: <span className="tabular" data-testid="odometer">{fill(t.odometerOn, { km: formatKm(vehicle.odometer_km), date: formatDate(vehicle.odometer_on) })}</span> },
        ]}
      />
    </Section>
  );
}

function OdometerForm({ assetId, current, onDone, onCancel }: { assetId: string; current: string; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.assets.vehicle;
  const submit = useSubmit();
  const today = todayBogota();
  const [km, setKm] = useState("");
  const [on, setOn] = useState(today);
  const [touched, setTouched] = useState(false);
  const parsed = parseKm(km);
  const back = parsed !== null && odometerGoesBack(current, parsed);
  const valid = parsed !== null && !back && on !== "" && on <= today;
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const body = { km: parsed!, on };
    const result = await submit.run(body, (key) => api.post<Vehicle>(paths.assetOdometer(assetId), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={t.odometerKm} hint={fill(t.odometerCurrent, { km: formatKm(current) })} value={km} onChange={setKm} inputMode="numeric" required error={back ? t.odometerBack : touched && parsed === null ? t.recordForm.problems.km : null} />
      <TextField label={t.odometerOnLabel} type="date" value={on} onChange={setOn} required />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : t.recordForm.save}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

/** Costo por mes y por kilómetro: lo gastado con la etiqueta del vehículo desde que se adquirió. */
function CostSummary({ asset }: { asset: Asset }) {
  const { dict } = useI18n();
  const t = dict.fin.assets.vehicle.summary;
  const summary = useResource<VehicleCostSummary>(paths.assetCostSummary(asset.id));
  const tagId = asset.vehicle?.tag_id ?? null;
  return (
    <Section title={t.title}>
      <p className="muted">{t.intro}</p>
      {summary.loading && !summary.data && <Loading />}
      {summary.failure && <ErrorState message={dict.fin.errors.generic} onRetry={summary.reload} />}
      {summary.data && summary.data.entries === 0 && <p className="muted">{t.empty}</p>}
      {summary.data && summary.data.entries > 0 && (
        <>
          <dl className="sim-summary" data-testid="cost-summary">
            <div className="sim-summary__item sim-summary__item--strong">
              <dt className="muted">{t.perMonth}</dt>
              <dd><Money value={summary.data.per_month} /></dd>
            </div>
            <div className="sim-summary__item sim-summary__item--strong">
              <dt className="muted">{t.perKm}</dt>
              <dd>{summary.data.per_km === null ? <span className="muted">{t.noKm}</span> : <Money value={summary.data.per_km} />}</dd>
            </div>
            <div className="sim-summary__item">
              <dt className="muted">{t.total}</dt>
              <dd><Money value={summary.data.total} /></dd>
            </div>
          </dl>
          <p className="hint">
            {fill(t.entries, { count: String(summary.data.entries), months: String(summary.data.months) })} · {fill(t.kmDriven, { km: formatKm(summary.data.km_driven) })}
          </p>
        </>
      )}
      {tagId && (
        <DrillLink filter={{ tag: tagId }} className="button button--ghost">
          {t.viewMovements}
        </DrillLink>
      )}
    </Section>
  );
}

function AnnualCosts({ asset, notice }: { asset: Asset; notice: Notice }) {
  const { dict } = useI18n();
  const t = dict.fin.assets.vehicle;
  const href = useHref();
  const costs = useResource<VehicleCost[]>(paths.assetCosts(asset.id));
  const [adding, setAdding] = useState(false);
  const list = costs.data ?? [];
  return (
    <Section
      title={t.costsTitle}
      aside={
        <button type="button" className="button button--ghost" onClick={() => setAdding(true)}>
          <Icon name="plus" size={20} />
          {t.addCost}
        </button>
      }
    >
      <p className="muted">{t.costsIntro}</p>
      {costs.loading && !costs.data && <Loading />}
      {costs.failure && <ErrorState message={dict.fin.errors.generic} onRetry={costs.reload} />}
      {costs.data && list.length === 0 && <Empty icon="calendar" title={t.costsEmpty} />}
      {list.length > 0 && (
        <ul className="fin-list">
          {list.map((cost) => (
            <li key={cost.id} className="fin-row fin-row--static">
              <span className="fin-row__main">
                <span className="fin-row__title">{t.costKinds[cost.kind] ?? cost.name}</span>
                <span className="fin-row__sub muted">{cost.next_due ? fill(t.nextDue, { date: formatDate(cost.next_due) }) : t.noDue}</span>
                <span className="fin-row__sub muted">{cost.notify_days.map((d) => fill(t.notify, { days: String(d) })).join(" · ")}</span>
                <span className="fin-row__badges">
                  <Link href={href("pagos-recurrencia", [cost.recurrence_id])}>{t.viewRecurrence}</Link>
                  <Link href={href("pagos-calendario")}>{t.viewCalendar}</Link>
                </span>
              </span>
              <Money value={cost.expected_amount} />
            </li>
          ))}
        </ul>
      )}
      <Modal open={adding} title={t.costForm.title} onClose={() => setAdding(false)}>
        <CostForm
          assetId={asset.id}
          onCancel={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            notice(t.costForm.saved);
            costs.reload();
          }}
        />
      </Modal>
    </Section>
  );
}

function CostForm({ assetId, onDone, onCancel }: { assetId: string; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.assets.vehicle.costForm;
  const kinds = dict.fin.assets.vehicle.costKinds;
  const submit = useSubmit();
  const accounts = useAll<Account>(paths.accounts());
  const categories = useAll<Category>(paths.categories({ archived: false }));
  const centers = useAll<Named>(paths.costCenters());
  const [kind, setKind] = useState<VehicleCostKind>("soat");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [centerId, setCenterId] = useState("");
  const [touched, setTouched] = useState(false);
  const usable = movementAccounts(accounts.items);
  const account = accountId || usable[0]?.id || "";
  const parsed = parsePositiveAmount(amount);
  const valid = parsed !== null && due !== "" && account !== "";
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const body = { kind, amount: parsed!, due_date: due, account_id: account, ...(categoryId ? { category_id: categoryId } : {}), ...(centerId ? { cost_center_id: centerId } : {}) };
    const result = await submit.run(body, (key) => api.post(paths.assetCosts(assetId), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <Segmented legend={t.kind} variant="chips" value={kind} onChange={(v) => setKind(v as VehicleCostKind)} options={VEHICLE_COST_KINDS.map((k) => ({ value: k, label: kinds[k] }))} />
      <AmountField label={t.amount} value={amount} onChange={setAmount} required error={touched && parsed === null ? t.problems.amount : null} apiCode={submit.errorCode} />
      <TextField label={t.due} type="date" value={due} onChange={setDue} required error={touched && due === "" ? t.problems.due : null} />
      <SelectField label={t.account} value={account} onChange={setAccountId} options={usable.map((a) => ({ value: a.id, label: a.name }))} error={touched && account === "" ? t.problems.account : null} />
      <CategoryCombobox label={t.category} kind="expense" categories={categories} value={categoryId} onChange={setCategoryId} placeholder={t.none} />
      {centers.items.length > 0 && <SelectField label={t.costCenter} value={centerId} onChange={setCenterId} placeholder={t.none} options={centers.items.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name }))} />}
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

const STATE_TONE = { ok: "positive", soon: "warning", due: "warning", overdue: "negative" } as const;

function MaintenanceList({ asset, vehicle, notice, onChanged, onOdometer }: { asset: Asset; vehicle: Vehicle; notice: Notice; onChanged: () => void; onOdometer: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.assets.vehicle;
  const list = useResource<Maintenance[]>(paths.assetMaintenance(asset.id));
  const [adding, setAdding] = useState(false);
  const [recording, setRecording] = useState<Maintenance | null>(null);
  const items = list.data ?? [];
  // «Ya toca»: lo que se cumplió primero, por fecha o por kilometraje (aunque la fecha siga lejos).
  const toDo = items.filter((item) => item.active && (item.status.state === "due" || item.status.state === "overdue"));
  return (
    <Section
      title={t.maintenanceTitle}
      aside={
        <button type="button" className="button button--ghost" onClick={() => setAdding(true)}>
          <Icon name="plus" size={20} />
          {t.addMaintenance}
        </button>
      }
    >
      {list.loading && !list.data && <Loading />}
      {list.failure && <ErrorState message={dict.fin.errors.generic} onRetry={list.reload} />}
      {list.data && items.length === 0 && <Empty icon="calendar" title={t.maintenanceEmpty} />}
      {items.length > 0 && <p className="hint">{fill(t.odometerHint, { km: formatKm(vehicle.odometer_km) })} <button type="button" className="button button--ghost" onClick={onOdometer}>{t.updateOdometer}</button></p>}
      {toDo.length > 0 && (
        <Banner tone="warning" live="polite">
          <ul data-testid="due-now">
            {toDo.map((item) => (
              <li key={item.id}>
                <strong>{fill(t.dueNow, { name: item.name })}</strong>
                {item.status.reason ? ` · ${t.reasons[item.status.reason]}` : ""}
              </li>
            ))}
          </ul>
        </Banner>
      )}
      {items.length > 0 && (
        <ul className="fin-list">
          {items.map((item) => (
            <MaintenanceRow key={item.id} item={item} onRecord={() => setRecording(item)} onChanged={list.reload} />
          ))}
        </ul>
      )}
      <Modal open={adding} title={t.maintForm.title} onClose={() => setAdding(false)}>
        <MaintenanceForm
          assetId={asset.id}
          onCancel={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            notice(t.maintForm.saved);
            list.reload();
          }}
        />
      </Modal>
      <Modal open={recording !== null} title={t.recordForm.title} onClose={() => setRecording(null)}>
        {recording && (
          <RecordForm
            item={recording}
            odometer={vehicle.odometer_km}
            onCancel={() => setRecording(null)}
            onDone={() => {
              setRecording(null);
              notice(t.recordForm.saved);
              list.reload();
              onChanged();
            }}
          />
        )}
      </Modal>
    </Section>
  );
}

function MaintenanceRow({ item, onRecord, onChanged }: { item: Maintenance; onRecord: () => void; onChanged: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.assets.vehicle;
  const toggle = useSubmit();
  const [open, setOpen] = useState(false);
  const status = item.status;
  const reason = status.reason ? t.reasons[status.reason] : null;
  async function flip() {
    const body = { active: !item.active };
    const result = await toggle.run({ id: item.id, ...body }, (key) => api.patch<Maintenance>(paths.maintenance(item.id), body, { idempotencyKey: key }));
    if (result.ok) onChanged();
  }
  return (
    <li className="fin-row fin-row--static maint-row">
      <span className="fin-row__main">
        <span className="fin-row__title">{item.name}</span>
        <span className="fin-row__sub muted">{maintenanceRule(item, t.rule, formatKm)}</span>
        {item.active ? (
          <>
            <span className="fin-row__badges">
              <Badge tone={STATE_TONE[status.state]}>
                {t.states[status.state]}
                {reason && status.state !== "ok" ? ` · ${reason}` : ""}
              </Badge>
            </span>
            {status.due_on && (
              <span className="fin-row__sub muted">
                {fill(t.dueOn, { date: formatDate(status.due_on) })}
                {status.days_left !== null ? ` · ${status.days_left === 0 ? t.daysToday : status.days_left > 0 ? fill(t.daysLeft, { days: String(status.days_left) }) : fill(t.daysOver, { days: String(-status.days_left) })}` : ""}
              </span>
            )}
            {status.due_km && (
              <span className="fin-row__sub muted">
                {fill(t.dueKm, { km: formatKm(status.due_km) })}
                {status.km_left !== null ? ` · ${isNegativeAmount(status.km_left) ? fill(t.kmOver, { km: formatKm(absAmount(status.km_left)) }) : isZeroAmount(status.km_left) ? t.kmReached : fill(t.kmLeft, { km: formatKm(status.km_left) })}` : ""}
              </span>
            )}
          </>
        ) : (
          <Badge>{t.paused}</Badge>
        )}
        <span className="fin-row__sub muted">{item.last_done_on ? fill(t.lastDone, { date: formatDate(item.last_done_on), km: formatKm(item.last_done_km ?? "0") }) : t.neverDone}</span>
        {toggle.error && <span className="field__error" role="alert">{toggle.error}</span>}
        <span className="actions">
          {item.active && (
            <button type="button" className="button button--primary" onClick={onRecord}>
              {t.done}
              <span className="visually-hidden"> {item.name}</span>
            </button>
          )}
          <button type="button" className="button button--ghost" onClick={() => void flip()} disabled={toggle.pending}>
            {item.active ? t.pause : t.resume}
            <span className="visually-hidden"> {item.name}</span>
          </button>
          <button type="button" className="button button--ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {t.history}
            <span className="visually-hidden"> {item.name}</span>
          </button>
        </span>
        {open && <RecordHistory id={item.id} />}
      </span>
    </li>
  );
}

function RecordHistory({ id }: { id: string }) {
  const { dict } = useI18n();
  const t = dict.fin.assets.vehicle;
  const records = useResource<MaintenanceRecord[]>(paths.maintenanceRecords(id));
  if (records.loading && !records.data) return <Loading />;
  if (records.failure) return <ErrorState message={dict.fin.errors.generic} onRetry={records.reload} />;
  if ((records.data ?? []).length === 0) return <p className="muted">{t.historyEmpty}</p>;
  return (
    <ul className="fin-list">
      {(records.data ?? []).map((r) => (
        <li key={r.id} className="fin-row fin-row--static">
          <span className="fin-row__main">
            <span className="fin-row__title">{fill(t.recordLine, { date: formatDate(r.done_on), km: formatKm(r.odometer_km) })}</span>
            {r.note && <span className="fin-row__sub muted">{r.note}</span>}
          </span>
          {r.cost && <Money value={r.cost} />}
        </li>
      ))}
    </ul>
  );
}

function MaintenanceForm({ assetId, onDone, onCancel }: { assetId: string; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.assets.vehicle.maintForm;
  const submit = useSubmit();
  const today = todayBogota();
  const [name, setName] = useState("");
  const [months, setMonths] = useState("");
  const [km, setKm] = useState("");
  const [lastOn, setLastOn] = useState("");
  const [lastKm, setLastKm] = useState("");
  const [touched, setTouched] = useState(false);
  const monthsValue = months.trim() === "" ? null : toInt(months, 1, 240);
  const kmValue = km.trim() === "" ? null : parseKm(km);
  const lastKmValue = lastKm.trim() === "" ? null : parseKm(lastKm);
  const badNumbers = (months.trim() !== "" && monthsValue === null) || (km.trim() !== "" && kmValue === null) || (lastKm.trim() !== "" && lastKmValue === null) || (kmValue !== null && +kmValue < 1);
  const needsOne = monthsValue === null && kmValue === null;
  const valid = name.trim() !== "" && !needsOne && !badNumbers && (lastOn === "" || lastOn <= today);
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const body = { name: name.trim(), ...(monthsValue !== null ? { every_months: monthsValue } : {}), ...(kmValue !== null ? { every_km: +kmValue } : {}), ...(lastOn ? { last_done_on: lastOn } : {}), ...(lastKmValue !== null ? { last_done_km: lastKmValue } : {}) };
    const result = await submit.run(body, (key) => api.post(paths.assetMaintenance(assetId), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={t.name} hint={t.nameHint} value={name} onChange={setName} maxLength={80} required error={touched && name.trim() === "" ? dict.fin.common.requiredField : null} />
      <div className="fin-grid-2">
        <TextField label={t.everyMonths} value={months} onChange={setMonths} inputMode="numeric" />
        <TextField label={t.everyKm} value={km} onChange={setKm} inputMode="numeric" />
      </div>
      {touched && (needsOne || badNumbers) && <p className="field__error" role="alert">{needsOne ? t.needsOne : t.invalid}</p>}
      <div className="fin-grid-2">
        <TextField label={t.lastDoneOn} type="date" value={lastOn} onChange={setLastOn} />
        <TextField label={t.lastDoneKm} value={lastKm} onChange={setLastKm} inputMode="numeric" />
      </div>
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
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

function RecordForm({ item, odometer, onDone, onCancel }: { item: Maintenance; odometer: string; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.assets.vehicle.recordForm;
  const submit = useSubmit();
  const today = todayBogota();
  const [doneOn, setDoneOn] = useState(today);
  const [km, setKm] = useState(formatKmPlain(odometer));
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const kmValue = parseKm(km);
  const costValue = cost.trim() === "" ? null : parsePositiveAmount(cost);
  const valid = kmValue !== null && (cost.trim() === "" || costValue !== null) && doneOn !== "" && doneOn <= today;
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const body = { done_on: doneOn, odometer_km: kmValue!, ...(costValue ? { cost: costValue } : {}), ...(note.trim() ? { note: note.trim() } : {}) };
    const result = await submit.run(body, (key) => api.post(paths.maintenanceRecords(item.id), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <p className="muted">{item.name}</p>
      <TextField label={t.doneOn} type="date" value={doneOn} onChange={setDoneOn} required error={touched && (doneOn === "" || doneOn > today) ? t.problems.date : null} />
      <TextField label={t.km} value={km} onChange={setKm} inputMode="numeric" required error={touched && kmValue === null ? t.problems.km : null} />
      <AmountField label={t.cost} hint={t.costHint} value={cost} onChange={setCost} error={touched && cost.trim() !== "" && costValue === null ? t.problems.cost : null} apiCode={submit.errorCode} />
      <TextArea label={t.note} value={note} onChange={setNote} maxLength={280} />
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

/** El kilometraje de la API (`"185400.00"`) como se escribe en el campo: entero, sin separadores. */
function formatKmPlain(value: string): string {
  return value.replace(/\.0+$/, "");
}
