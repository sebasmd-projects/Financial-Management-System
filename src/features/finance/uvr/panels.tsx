"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Loan, LoanRates, LoanValuation, ParameterCatalog } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate, todayBogota } from "@/lib/dates";
import { formatRate, formatUnits } from "@/lib/decimal";
import { isZeroAmount } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { useResource, useSubmit, type Resource } from "../hooks";
import { Banner, DefinitionList, ErrorState, FormActions, Loading, Modal, Money, Section, TextField } from "../kit";
import { ParameterDetail } from "../parameters/parameters-screen";
import { PendingAmount, RegisterIndexLink, UVR_KEY } from "./pending";

/** `GET loans/{id}/valuation?on=`: sin UVR en esa fecha responde `422 index_missing` (nunca el último valor conocido). */
export function useValuation(loanId: string, on: string, enabled: boolean): Resource<LoanValuation> {
  return useResource<LoanValuation>(enabled ? paths.loanValuation(loanId, on) : null);
}

/**
 * Saldo de un crédito en UVR (§3.3): las unidades que faltan × la UVR de la fecha consultada, junto al saldo del libro. Cambia con
 * la UVR de la fecha elegida. «Poner al día» asienta la diferencia (corrección monetaria); consultar no escribe nada.
 */
export function ValuationPanel({ loan, on, onOn, valuation, onChanged }: { loan: Loan; on: string; onOn: (value: string) => void; valuation: Resource<LoanValuation>; onChanged: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.uvr;
  const submit = useSubmit();
  const [done, setDone] = useState<string | null>(null);
  const today = todayBogota();
  const v = valuation.data;
  const missing = valuation.failure?.code === "index_missing";

  async function revalue() {
    setDone(null);
    const body = { on };
    const result = await submit.run({ loan: loan.id, ...body }, (key) => api.post<LoanValuation>(paths.loanRevalue(loan.id), body, { idempotencyKey: key, locale }));
    if (result.ok) {
      setDone(t.revalued);
      valuation.reload();
      onChanged();
    }
  }
  return (
    <Section title={t.valuationTitle}>
      <p className="muted">{t.valuationIntro}</p>
      <TextField label={t.valuationOn} type="date" value={on} onChange={onOn} required error={on === "" ? dict.fin.common.requiredField : null} />
      {valuation.loading && !v && <Loading />}
      {missing && (
        <Banner tone="warning">
          <p>
            <PendingAmount />
          </p>
          <p>{fill(t.missingOn, { date: formatDate(on) })}</p>
          <p>
            <RegisterIndexLink />
          </p>
        </Banner>
      )}
      {valuation.failure && !missing && <ErrorState message={dict.fin.errors.generic} onRetry={valuation.reload} />}
      {v && !missing && (
        <div data-testid="valuation">
          <DefinitionList
            rows={[
              { label: t.unitsLeft, value: <span className="tabular">{v.units_balance ? formatUnits(v.units_balance, "UVR") : "—"}</span> },
              { label: t.uvrOf.replace("{date}", formatDate(v.on)), value: <span className="tabular">{v.uvr_value ? `${formatRate(v.uvr_value)}${v.uvr_source ? ` · ${t.source}: ${v.uvr_source}` : ""}` : "—"}</span> },
              { label: t.pesoBalance, value: <Money value={v.peso_balance} estimated /> },
              { label: t.ledgerBalance, value: <Money value={v.ledger_balance} /> },
              { label: t.difference, value: <Money value={v.difference} sign="always" /> },
            ]}
          />
          {isZeroAmount(v.difference) ? (
            <p className="muted">{t.inSync}</p>
          ) : (
            <>
              <p className="hint">{t.revalueHint}</p>
              {on <= today ? (
                <FormActions>
                  <button type="button" className="button button--primary" disabled={submit.pending} onClick={() => void revalue()}>
                    {submit.pending ? dict.fin.common.saving : t.revalue}
                  </button>
                </FormActions>
              ) : (
                <p className="muted">{t.futureNoRevalue}</p>
              )}
            </>
          )}
        </div>
      )}
      {done && <Banner tone="positive">{done}</Banner>}
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
          {submit.errorCode === "index_missing" && (
            <>
              {" "}
              <RegisterIndexLink />
            </>
          )}
        </Banner>
      )}
    </Section>
  );
}

/** Tasa variable: índice + margen (sumados, ambos efectiva anual). «Reajustar» crea la tasa vigente desde una fecha y recalcula las cuotas pendientes. */
export function VariableRatePanel({ loan, onChanged }: { loan: Loan; onChanged: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.uvr;
  const submit = useSubmit();
  const [on, setOn] = useState(todayBogota());
  const [done, setDone] = useState<string | null>(null);
  const index = loan.index_key as string;
  async function reprice(event: React.FormEvent) {
    event.preventDefault();
    if (on === "") return;
    setDone(null);
    const body = { on };
    const result = await submit.run({ loan: loan.id, ...body }, (key) => api.post<LoanRates>(paths.loanReprice(loan.id), body, { idempotencyKey: key, locale }));
    if (result.ok) {
      setDone(t.repriced);
      onChanged();
    }
  }
  return (
    <Section title={t.variableTitle}>
      <p className="muted">{fill(t.variableIntro, { index: t.indices[index] ?? index })}</p>
      <form onSubmit={reprice} className="fin-form" noValidate>
        <TextField label={t.repriceOn} hint={t.repriceHint} type="date" value={on} onChange={setOn} required error={on === "" ? dict.fin.common.requiredField : null} />
        {done && <Banner tone="positive">{done}</Banner>}
        {submit.error && (
          <Banner tone="negative" live="assertive">
            {submit.error}
            {submit.errorCode === "index_missing" && (
              <>
                {" "}
                <RegisterIndexLink indexKey={index} />
              </>
            )}
          </Banner>
        )}
        <FormActions>
          <button type="submit" className="button button--primary" disabled={submit.pending || on === ""}>
            {submit.pending ? dict.fin.common.saving : t.reprice}
          </button>
          <RegisterIndexLink indexKey={index} />
        </FormActions>
      </form>
    </Section>
  );
}

/** «Registrar valores» de la UVR o del índice: la serie fechada con fuente de «Parámetros Colombia», en una hoja, sin salir del crédito. */
export function IndexValues({ indexKey, label }: { indexKey: string; label: string }) {
  const { dict } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button button--ghost" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal open={open} title={label} onClose={() => setOpen(false)}>
        <IndexValuesBody indexKey={indexKey} fallback={dict.fin.errors.generic} />
      </Modal>
    </>
  );
}

function IndexValuesBody({ indexKey, fallback }: { indexKey: string; fallback: string }) {
  const catalog = useResource<ParameterCatalog[]>(paths.parameterCatalog());
  const entry = catalog.data?.find((p) => p.key === indexKey) ?? null;
  if (catalog.loading && !catalog.data) return <Loading />;
  if (catalog.failure || (catalog.data && !entry)) return <ErrorState message={fallback} onRetry={catalog.reload} />;
  return entry ? <ParameterDetail entry={entry} onChanged={() => undefined} /> : null;
}

export { UVR_KEY };
