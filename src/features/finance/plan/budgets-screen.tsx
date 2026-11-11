"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Budget, BudgetSuggestions, Budgets } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { formatPeriod, periodOf, shiftPeriod, todayBogota } from "@/lib/dates";
import { compareAmounts } from "@/lib/money";
import { formatPercent, percentWidth } from "@/lib/percent";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { fill } from "../helpers";
import { useHref, useResource, useSubmit } from "../hooks";
import { Badge, Banner, Checkbox, Empty, ErrorState, Loading, Modal, Money, Progress, ScreenHeader } from "../kit";
import { BudgetForm } from "./budget-form";
import { budgetName, type Lookups } from "./logic";
import { useLookups } from "./lookups";
import { PlanTabs } from "./plan-tabs";

export function stateTone(state: Budget["state"]): "primary" | "warning" | "negative" {
  return state === "exceeded" ? "negative" : state === "attention" ? "warning" : "primary";
}

/** El estado va SIEMPRE con texto (y icono en atención): el color no es la única señal. */
export function BudgetState({ budget }: { budget: Budget }) {
  const { dict } = useI18n();
  const t = dict.fin.plan.states;
  if (budget.state === "exceeded") {
    return (
      <Badge tone="negative">
        <Icon name="alert" size={14} /> {t.exceeded} · <Money value={budget.exceeded_by} />
      </Badge>
    );
  }
  if (budget.state === "attention") {
    return (
      <Badge tone="warning">
        <Icon name="alert" size={14} /> {t.attention}
      </Badge>
    );
  }
  return <Badge tone="positive">{t.normal}</Badge>;
}

/** Presupuestos (`/presupuestos`, §3.12): total y cada presupuesto con lo ejecutado frente al límite; lo ejecutado se LEE de los asientos. */
export function BudgetsScreen() {
  const { dict, locale } = useI18n();
  const t = dict.fin.plan.budgets;
  const href = useHref();
  const today = todayBogota();
  const [period, setPeriod] = useState(() => periodOf(today));
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const current = period === periodOf(today);
  const budgets = useResource<Budgets>(paths.budgets({ all: archived, on: current ? undefined : `${period}-01` }));
  const lookups = useLookups();
  const items = budgets.data?.budgets ?? [];
  const empty = budgets.data !== null && items.length === 0 && !archived;
  return (
    <div className="screen">
      <ScreenHeader
        title={dict.screens["plan-presupuestos"]}
        eyebrow={dict.nav.sections.plan}
        actions={
          <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={20} />
            {t.add}
          </button>
        }
      />
      <PlanTabs current="plan-presupuestos" />
      <div className="fin-periodbar">
        <button type="button" className="icon-button" aria-label={dict.fin.movements.previousPeriod} onClick={() => setPeriod(shiftPeriod(period, -1))}>
          <Icon name="arrow-left" />
        </button>
        <p className="title-s" aria-live="polite">{formatPeriod(period, locale)}</p>
        <button type="button" className="icon-button" aria-label={dict.fin.movements.nextPeriod} onClick={() => setPeriod(shiftPeriod(period, 1))}>
          <Icon name="arrow-right" />
        </button>
      </div>
      <Checkbox label={t.showArchived} checked={archived} onChange={setArchived} />
      {budgets.loading && !budgets.data && <Loading />}
      {budgets.failure && <ErrorState message={dict.fin.errors.generic} onRetry={budgets.reload} />}
      {budgets.data && items.length > 0 && !archived && (
        <section className="fin-card" aria-label={t.total}>
          <p>
            <span className="muted">{t.total}</span> <strong><Money value={budgets.data.total.spent} /></strong> <span className="muted">{t.of}</span> <Money value={budgets.data.total.limit} />
          </p>
          <Progress percent={percentWidth(budgets.data.total.percent)} label={`${t.total}: ${formatPercent(budgets.data.total.percent, locale)}`} tone={compareAmounts(budgets.data.total.spent, budgets.data.total.limit) > 0 ? "negative" : "primary"} />
          <p className="muted">{formatPercent(budgets.data.total.percent, locale)} · {t.totalNote}</p>
        </section>
      )}
      {empty && <Suggestions lookups={lookups} onCreated={budgets.reload} onAdd={() => setCreating(true)} />}
      {budgets.data && items.length === 0 && archived && <Empty icon="target" title={t.noArchived} />}
      <ul className="fin-list">
        {items.map((budget) => (
          <li key={budget.id}>
            <BudgetRow budget={budget} lookups={lookups} link={href("plan-presupuesto", [budget.id])} />
          </li>
        ))}
      </ul>
      <Modal open={creating} title={t.add} onClose={() => setCreating(false)}>
        {creating && (
          <BudgetForm
            onCancel={() => setCreating(false)}
            onDone={() => {
              setCreating(false);
              budgets.reload();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function BudgetRow({ budget, lookups, link }: { budget: Budget; lookups: Lookups; link: string }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.plan.budgets;
  return (
    <Link href={link} className="fin-row fin-row--budget">
      <span className="fin-row__main">
        <span className="fin-row__title">{budgetName(budget, lookups)}</span>
        <span className="fin-row__sub muted">
          <Money value={budget.spent} /> / <Money value={budget.limit} /> · {formatPercent(budget.percent, locale)} · {dict.fin.plan.dimensions[budget.dimension]}
        </span>
        <Progress percent={percentWidth(budget.percent)} label={`${budgetName(budget, lookups)}: ${formatPercent(budget.percent, locale)}`} tone={stateTone(budget.state)} />
        <span className="fin-row__sub muted">
          {budget.state === "exceeded" ? (
            t.exceededNote
          ) : (
            <>
              {t.left} <Money value={budget.remaining} /> · <Money value={budget.per_day} /> {t.perDay} ({fill(t.daysLeft, { n: String(budget.days_left) })})
            </>
          )}
        </span>
        <span className="fin-row__badges">
          <BudgetState budget={budget} />
          {!budget.active && <Badge>{t.archivedBadge}</Badge>}
        </span>
      </span>
      <Icon name="chevron-right" size={20} />
    </Link>
  );
}

/** Sin presupuestos: propone límites con el promedio de 3 meses (§3.12); crear uno es una sola acción con su propia clave de idempotencia. */
function Suggestions({ lookups, onCreated, onAdd }: { lookups: Lookups; onCreated: () => void; onAdd: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.plan.budgets;
  const suggestions = useResource<BudgetSuggestions>(paths.budgetSuggestions());
  const submit = useSubmit();
  const rows = suggestions.data?.suggestions ?? [];
  async function create(categoryId: string, limit: string) {
    const body = { dimension: "category" as const, target_id: categoryId, limit, period: "monthly" as const };
    const result = await submit.run(body, (key) => api.post(roots.budgets, body, { idempotencyKey: key, locale }));
    if (result.ok) onCreated();
  }
  return (
    <>
      <Empty
        icon="target"
        title={t.emptyTitle}
        body={t.emptyBody}
        action={
          <button type="button" className="button button--primary" onClick={onAdd}>
            {t.add}
          </button>
        }
      />
      {suggestions.loading && !suggestions.data && <Loading />}
      {rows.length > 0 && (
        <section className="fin-card" aria-label={t.suggestionsTitle}>
          <h2 className="title-s">{t.suggestionsTitle}</h2>
          <p className="muted">{t.suggestionsBody}</p>
          {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
          <ul className="fin-list">
            {rows.map((row) => (
              <li key={row.category_id} className="fin-row fin-row--static">
                <span className="fin-row__main">
                  <span className="fin-row__title">{lookups.categories.find((c) => c.id === row.category_id)?.name ?? "—"}</span>
                  <span className="fin-row__sub muted">
                    {t.suggestedLimit} <Money value={row.suggested_limit} />
                  </span>
                </span>
                <button type="button" className="button button--ghost" disabled={submit.pending} onClick={() => void create(row.category_id, row.suggested_limit)}>
                  {t.createSuggested}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
