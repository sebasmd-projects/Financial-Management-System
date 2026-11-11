"use client";

import { useState } from "react";
import type { Goal, Goals } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import type { RouteId } from "@/nav/routes";
import { Icon } from "@/ui/icons";
import { useResource } from "../hooks";
import { Checkbox, Empty, ErrorState, Loading, Modal, ScreenHeader } from "../kit";
import { ContributeForm, GoalCard, GoalForm } from "./goal-parts";
import { goalTab, type GoalTab } from "./logic";
import { PlanTabs } from "./plan-tabs";

/** Metas (`/presupuestos/ahorro` y `/presupuestos/objetivos`, §3.12): el progreso es el saldo de la cuenta enlazada. */
export function GoalsScreen({ tab }: { tab: GoalTab }) {
  const { dict } = useI18n();
  const t = dict.fin.plan.goals;
  const route: RouteId = tab === "ahorro" ? "plan-ahorro" : "plan-objetivos";
  const goals = useResource<Goals>(paths.goals());
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [contributing, setContributing] = useState<Goal | null>(null);
  const items = (goals.data?.goals ?? []).filter((g) => goalTab(g.kind) === tab && (g.status === "archived") === archived);
  return (
    <div className="screen">
      <ScreenHeader
        title={dict.screens[route]}
        eyebrow={dict.nav.sections.plan}
        actions={
          <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={20} />
            {t.add}
          </button>
        }
      />
      <PlanTabs current={route} />
      <p className="muted">{tab === "ahorro" ? t.introSavings : t.introObjectives}</p>
      <Checkbox label={t.showArchived} checked={archived} onChange={setArchived} />
      {goals.loading && !goals.data && <Loading />}
      {goals.failure && <ErrorState message={dict.fin.errors.generic} onRetry={goals.reload} />}
      {goals.data && items.length === 0 && (
        <Empty
          icon="target"
          title={archived ? t.noArchived : t.emptyTitle}
          body={archived ? undefined : tab === "ahorro" ? t.emptySavingsBody : t.emptyObjectivesBody}
          action={
            !archived ? (
              <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
                {t.add}
              </button>
            ) : undefined
          }
        />
      )}
      <ul className="fin-list">
        {items.map((goal) => (
          <li key={goal.id}>
            <GoalCard goal={goal} onContribute={() => setContributing(goal)} />
          </li>
        ))}
      </ul>
      <Modal open={creating} title={t.add} onClose={() => setCreating(false)}>
        {creating && (
          <GoalForm
            initialKind={tab === "ahorro" ? "save_amount" : "vehicle"}
            onCancel={() => setCreating(false)}
            onDone={() => {
              setCreating(false);
              goals.reload();
            }}
          />
        )}
      </Modal>
      <Modal open={contributing !== null} title={t.contribute} onClose={() => setContributing(null)}>
        {contributing && (
          <ContributeForm
            goal={contributing}
            onCancel={() => setContributing(null)}
            onDone={() => {
              setContributing(null);
              goals.reload();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
