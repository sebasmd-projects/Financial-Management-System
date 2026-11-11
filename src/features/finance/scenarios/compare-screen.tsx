"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Page, Recurrence, ScenarioAdjustment, ScenarioCompare, UserScenario } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { formatCop } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { fill } from "../helpers";
import { useAll, useHref, useQuery, useResource, useSubmit } from "../hooks";
import { Banner, Checkbox, Empty, ErrorState, FormActions, Loading, Modal, ScreenHeader, Section } from "../kit";
import { CompareTable } from "./compare-table";
import { toggleCompared, MAX_COMPARED } from "./logic";
import { ScenarioForm } from "./scenario-form";
import { ProjectionTabs } from "./scenario-tabs";

/**
 * Comparar escenarios (`/informes/proyecciones/comparar`, §3.13 y corte 3.2): escenarios propios (nombre + ajustes), y «Hoy»
 * frente a hasta 3 de ellos a 12 meses, lado a lado. «Cancelar Netflix» frente a «Hoy» muestra la diferencia; ningún escenario
 * escribe en el libro.
 */
export function CompareScreen() {
  const { dict } = useI18n();
  const t = dict.fin.scen;
  const href = useHref();
  const scenarios = useResource<Page<UserScenario>>(paths.scenarios());
  const recurrences = useAll<Recurrence>(paths.recurrences());
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<UserScenario | "new" | null>(null);
  const [removing, setRemoving] = useState<UserScenario | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const list = scenarios.data?.results ?? [];
  const names = new Map(recurrences.items.map((r) => [r.id, r.name]));
  // Solo se comparan los que existen todavía (borrar uno marcado lo saca de la comparación).
  const chosen = selected.filter((id) => list.some((s) => s.id === id));
  const compare = useQuery<ScenarioCompare>(paths.scenarioCompare(), chosen.length > 0 ? { items: chosen.map((scenario_id) => ({ scenario_id })) } : null);

  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["informes-comparar"]} eyebrow={dict.screens.informes} back={{ href: href("informes"), label: dict.screens.informes }} />
      <ProjectionTabs current="informes-comparar" />
      <Banner tone="warning" live="off">
        {t.noLedger}
      </Banner>
      {notice && <Banner tone="positive">{notice}</Banner>}

      <Section
        title={t.listTitle}
        aside={
          <button type="button" className="button button--primary" onClick={() => setEditing("new")}>
            <Icon name="plus" size={20} />
            {t.add}
          </button>
        }
      >
        {scenarios.loading && !scenarios.data && <Loading />}
        {scenarios.failure && <ErrorState message={dict.fin.errors.generic} onRetry={scenarios.reload} />}
        {scenarios.data && list.length === 0 && (
          <Empty
            icon="chart"
            title={t.emptyTitle}
            body={t.emptyBody}
            action={
              <button type="button" className="button button--primary" onClick={() => setEditing("new")}>
                {t.add}
              </button>
            }
          />
        )}
        {list.length > 0 && (
          <>
            <p className="hint">{fill(t.pickHint, { max: String(MAX_COMPARED) })}</p>
            <ul className="fin-list">
              {list.map((scenario) => (
                <li key={scenario.id} className="fin-row fin-row--static scen-row">
                  <span className="fin-row__main">
                    <span className="fin-row__title">{scenario.name}</span>
                    {scenario.description && <span className="fin-row__sub muted">{scenario.description}</span>}
                    {scenario.adjustments.map((adjustment, index) => (
                      <span key={index} className="fin-row__sub muted">
                        {adjustmentText(adjustment, names, t.adj)}
                      </span>
                    ))}
                    <Checkbox
                      label={`${t.compareThis}: ${scenario.name}`}
                      checked={chosen.includes(scenario.id)}
                      onChange={(on) => setSelected((current) => toggleCompared(current, scenario.id, on))}
                      hint={!chosen.includes(scenario.id) && chosen.length >= MAX_COMPARED ? fill(t.maxReached, { max: String(MAX_COMPARED) }) : undefined}
                    />
                    <span className="actions">
                      <button type="button" className="button button--ghost" onClick={() => setEditing(scenario)}>
                        {t.edit}
                        <span className="visually-hidden"> {scenario.name}</span>
                      </button>
                      <button type="button" className="button button--ghost" onClick={() => setRemoving(scenario)}>
                        {t.remove}
                        <span className="visually-hidden"> {scenario.name}</span>
                      </button>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title={t.compare.title}>
        {chosen.length === 0 ? (
          <p className="muted">{t.compare.pick}</p>
        ) : (
          <>
            {compare.loading && !compare.data && <Loading />}
            {compare.failure && <ErrorState message={dict.fin.errors.generic} onRetry={compare.reload} />}
            {compare.data && <CompareTable data={compare.data} />}
          </>
        )}
      </Section>

      <Modal open={editing !== null} title={editing === "new" || editing === null ? t.newScenario : t.editScenario} onClose={() => setEditing(null)}>
        {editing !== null && (
          <ScenarioForm
            scenario={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onDone={(saved) => {
              setEditing(null);
              setNotice(fill(editing === "new" ? t.created : t.updated, { name: saved.name }));
              scenarios.reload();
              compare.reload();
            }}
          />
        )}
      </Modal>
      <Modal open={removing !== null} title={t.removeTitle} onClose={() => setRemoving(null)}>
        {removing && (
          <RemoveScenario
            scenario={removing}
            onCancel={() => setRemoving(null)}
            onDone={() => {
              setRemoving(null);
              setSelected((current) => current.filter((id) => id !== removing.id));
              setNotice(t.removed);
              scenarios.reload();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function RemoveScenario({ scenario, onDone, onCancel }: { scenario: UserScenario; onDone: () => void; onCancel: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.scen;
  const submit = useSubmit();
  async function remove() {
    const result = await submit.run({ remove: scenario.id }, () => api.delete(paths.scenario(scenario.id)));
    if (result.ok) onDone();
  }
  return (
    <div className="fin-form">
      <p>{fill(t.removeBody, { name: scenario.name })}</p>
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="button" className="button button--primary" disabled={submit.pending} onClick={() => void remove()}>
          {submit.pending ? dict.fin.common.saving : t.remove}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </div>
  );
}

/** Una línea por ajuste: «Cancelar «Netflix» desde 01/12/2026», «Ingreso +$500.000 al mes…». Los montos con su formato COP. */
function adjustmentText(a: ScenarioAdjustment, names: Map<string, string>, t: ReturnType<typeof useI18n>["dict"]["fin"]["scen"]["adj"]): string {
  switch (a.kind) {
    case "cancel_recurrence":
      return fill(t.sum.cancel, { name: names.get(a.recurrence_id ?? "") ?? t.sum.unknownRecurrence, date: a.start ? formatDate(a.start) : "" });
    case "change_income":
      return fill(a.until ? t.sum.incomeUntil : t.sum.income, { amount: formatCop(a.monthly_delta ?? "0", { sign: "always" }), from: a.start ? formatDate(a.start) : "", until: a.until ? formatDate(a.until) : "" });
    case "add_expense":
      return fill(a.months && a.months > 1 ? t.sum.expenseMonths : t.sum.expense, { amount: formatCop(a.amount ?? "0"), from: a.start ? formatDate(a.start) : "", months: String(a.months ?? 1) });
    case "add_loan":
      return fill(t.sum.loan, { amount: formatCop(a.principal ?? "0"), term: String(a.term ?? ""), from: a.first_payment ? formatDate(a.first_payment) : "" });
  }
}
