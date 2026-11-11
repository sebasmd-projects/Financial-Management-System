"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Goal } from "@/api/models";
import { paths } from "@/api/paths";
import { parsePositiveAmount } from "@/lib/amount-input";
import { isBusinessDate } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { goalTab } from "./logic";
import { useHref, useResource, useSubmit } from "../hooks";
import { AmountField, Banner, ErrorState, FormActions, Loading, Modal, ScreenHeader, TextField } from "../kit";
import { ContributeForm, GoalCard } from "./goal-parts";

/** Una meta (`/presupuestos/objetivos/[id]`): su ficha, aportar, editar objetivo, fecha y aporte planeado, y archivar. */
export function GoalDetail({ id }: { id: string }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.plan.goals;
  const href = useHref();
  const goal = useResource<Goal>(paths.goal(id));
  const submit = useSubmit();
  const [contributing, setContributing] = useState(false);
  const [editing, setEditing] = useState(false);
  const back = goal.data ? { href: href(goalTab(goal.data.kind) === "ahorro" ? "plan-ahorro" : "plan-objetivos"), label: dict.screens[goalTab(goal.data.kind) === "ahorro" ? "plan-ahorro" : "plan-objetivos"] } : { href: href("plan-objetivos"), label: dict.screens["plan-objetivos"] };
  if (goal.loading && !goal.data) return <div className="screen"><ScreenHeader title={dict.screens["plan-meta"]} back={back} /><Loading /></div>;
  if (goal.failure || !goal.data) {
    return (
      <div className="screen">
        <ScreenHeader title={dict.screens["plan-meta"]} back={back} />
        <ErrorState message={goal.failure?.status === 404 ? dict.fin.errors.notFound : dict.fin.errors.generic} onRetry={goal.reload} />
      </div>
    );
  }
  const g = goal.data;
  async function toggle() {
    const body = { status: g.status === "active" ? ("archived" as const) : ("active" as const) };
    const result = await submit.run(body, () => api.patch(paths.goal(g.id), body, { locale }));
    if (result.ok) goal.reload();
  }
  return (
    <div className="screen">
      <ScreenHeader title={g.name} eyebrow={dict.screens["plan-meta"]} back={back} />
      <GoalCard goal={g} detail={false} onContribute={() => setContributing(true)} />
      <div className="actions">
        <button type="button" className="button button--ghost" onClick={() => setEditing(true)}>
          {t.edit}
        </button>
        <button type="button" className="button button--ghost" disabled={submit.pending} onClick={() => void toggle()}>
          {g.status === "active" ? t.archive : t.restore}
        </button>
      </div>
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <p className="hint">{g.kind === "pay_debt" ? t.progressDebt : t.progressNote}</p>
      <Modal open={contributing} title={t.contribute} onClose={() => setContributing(false)}>
        {contributing && (
          <ContributeForm
            goal={g}
            onCancel={() => setContributing(false)}
            onDone={() => {
              setContributing(false);
              goal.reload();
            }}
          />
        )}
      </Modal>
      <Modal open={editing} title={t.edit} onClose={() => setEditing(false)}>
        {editing && (
          <EditGoal
            goal={g}
            onCancel={() => setEditing(false)}
            onDone={() => {
              setEditing(false);
              goal.reload();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function EditGoal({ goal, onDone, onCancel }: { goal: Goal; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.plan.goals;
  const submit = useSubmit();
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(goal.target_amount.replace(/\.00$/, ""));
  const [date, setDate] = useState(goal.target_date ?? "");
  const [planned, setPlanned] = useState(goal.planned_contribution?.replace(/\.00$/, "") ?? "");
  const targetValue = parsePositiveAmount(target);
  const plannedValue = planned.trim() === "" ? null : parsePositiveAmount(planned);
  const valid = name.trim() !== "" && targetValue !== null && (planned.trim() === "" || plannedValue !== null) && (date === "" || isBusinessDate(date));
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    const body = { name: name.trim(), target_amount: targetValue!, target_date: date || null, planned_contribution: plannedValue };
    const result = await submit.run(body, () => api.patch(paths.goal(goal.id), body, { locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={t.name} value={name} onChange={setName} maxLength={80} required error={name.trim() === "" ? dict.fin.common.requiredField : null} />
      <AmountField label={t.target} value={target} onChange={setTarget} required error={targetValue === null ? dict.fin.common.invalidAmount : null} />
      <TextField label={t.date} type="date" value={date} onChange={setDate} />
      <AmountField label={t.plannedField} hint={t.plannedHint} value={planned} onChange={setPlanned} error={planned.trim() !== "" && plannedValue === null ? dict.fin.common.invalidAmount : null} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || !valid}>
          {submit.pending ? dict.fin.common.saving : dict.fin.common.save}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}
