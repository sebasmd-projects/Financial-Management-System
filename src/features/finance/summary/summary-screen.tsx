"use client";

import Link from "next/link";
import { useState } from "react";
import type { Alert, Dashboard, RailItem } from "@/api/models";
import { paths } from "@/api/paths";
import { daysBetween, formatDate, formatDateShort, formatPeriod, periodOf, shiftPeriod, todayBogota } from "@/lib/dates";
import { compareAmounts, isNegativeAmount } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { setDraft } from "../draft-store";
import { fill, relativeDays } from "../helpers";
import { useHref, useResource } from "../hooks";
import { Badge, DefinitionList, Empty, ErrorState, HiddenAmountsContext, Loading, Modal, Money, Progress, ScreenHeader, Section } from "../kit";
import { alertTarget, barSegments, clampIndex, isFirstUse, railTarget } from "./logic";

const PERIODS_BACK = 11;

/** Resumen financiero (`/<idioma>/<raíz>` con la cuenta activa, diseño §2): «Te queda», gastado, liquidez, próximos pagos, gastos fijos, atajos y alertas. */
export function SummaryScreen() {
  const { dict, locale } = useI18n();
  const t = dict.fin.dash;
  const href = useHref();
  const today = todayBogota();
  const current = periodOf(today);
  const [period, setPeriod] = useState(current);
  const [hidden, setHidden] = useState(false);
  const [sheet, setSheet] = useState<"left" | "liquidity" | null>(null);
  const data = useResource<Dashboard>(paths.dashboard(period === current ? undefined : period));
  const d = data.data;
  const past = period !== current;

  return (
    <HiddenAmountsContext.Provider value={hidden}>
      <div className="screen summary">
        <ScreenHeader
          title={dict.screens.resumen}
          actions={
            <button type="button" className="icon-button" aria-pressed={hidden} aria-label={hidden ? t.showAmounts : t.hideAmounts} onClick={() => setHidden(!hidden)}>
              <Icon name={hidden ? "shield" : "check"} />
            </button>
          }
        />
        <div className="fin-periodbar" role="group" aria-label={t.periodLabel}>
          <button type="button" className="icon-button" aria-label={dict.fin.movements.previousPeriod} disabled={period <= shiftPeriod(current, -PERIODS_BACK)} onClick={() => setPeriod(shiftPeriod(period, -1))}>
            <Icon name="arrow-left" />
          </button>
          <p className="title-s" aria-live="polite">
            {formatPeriod(period, locale)}
          </p>
          <button type="button" className="icon-button" aria-label={dict.fin.movements.nextPeriod} disabled={period >= current} onClick={() => setPeriod(shiftPeriod(period, 1))}>
            <Icon name="arrow-right" />
          </button>
        </div>
        {past && (
          <p className="summary__past">
            <Badge tone="info">{fill(t.viewingPast, { period: formatPeriod(period, locale) })}</Badge>{" "}
            <button type="button" className="button button--ghost" onClick={() => setPeriod(current)}>
              {t.backToToday}
            </button>
          </p>
        )}

        {data.loading && !d && <Loading />}
        {data.failure && <ErrorState message={t.loadError} onRetry={data.reload} />}
        {d && (
          <div className={`summary__grid${data.loading ? " fin-stale" : ""}`}>
            <KpiCard d={d} past={past} onLeft={() => setSheet("left")} onLiquidity={() => setSheet("liquidity")} />
            <div className={`summary__rail${past ? " summary__dim" : ""}`}>
              <Rail items={d.rail} />
            </div>
            <FixedGrid d={d} />
            <div className={past ? "summary__dim" : undefined}>
              <Shortcuts d={d} />
              <Alerts d={d} />
            </div>
          </div>
        )}
        {d && isFirstUse(d) && (
          <Empty
            icon="wallet"
            title={t.firstUseTitle}
            body={t.firstUseBody}
            action={
              <Link className="button button--primary" href={href("cuentas")}>
                {t.addAccount}
              </Link>
            }
          />
        )}

        <Modal open={sheet === "left" && d !== null} title={t.breakdownTitle} onClose={() => setSheet(null)}>
          {d && <Breakdown d={d} />}
        </Modal>
        <Modal open={sheet === "liquidity" && d !== null} title={t.liquidityTitle} onClose={() => setSheet(null)}>
          {d && <LiquiditySheet d={d} />}
        </Modal>
      </div>
    </HiddenAmountsContext.Provider>
  );
}

function KpiCard({ d, past, onLeft, onLiquidity }: { d: Dashboard; past: boolean; onLeft: () => void; onLiquidity: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.dash;
  const href = useHref();
  const negative = isNegativeAmount(d.kpi.remaining);
  const seg = barSegments(d.bar);
  const h30 = d.liquidity.horizons.find((h) => h.days === 30);
  const barText = fill(t.barLabel, { spent: `${seg.spent} %`, committed: `${seg.committed} %`, free: `${seg.free} %` });
  return (
    <section className="fin-card summary__kpi" aria-label={dict.screens.resumen}>
      <div className="summary__kpis">
        <button type="button" className="summary__kpi-main" onClick={onLeft} aria-haspopup="dialog">
          <span className="summary__label">{past ? t.leftPast : t.left}</span>
          <span className={`summary__big${negative ? " summary__big--negative" : ""}`}>
            {negative && <Icon name="alert" size={24} />}
            <Money value={d.kpi.remaining} tone={negative ? "negative" : undefined} />
          </span>
        </button>
        <Link className="summary__kpi-side" href={href("movimientos-egresos")} aria-label={t.spentLink}>
          <span className="summary__label">{t.spent}</span>
          <span className="summary__mid">
            <Money value={d.kpi.spent} />
          </span>
        </Link>
      </div>
      <div className="summary__bar" role="img" aria-label={barText}>
        <span className="summary__bar-spent" style={{ width: `${seg.spent}%` }} />
        <span className="summary__bar-committed" style={{ width: `${seg.committed}%` }} />
        <span className="summary__bar-free" style={{ width: `${seg.free}%` }} />
      </div>
      <button type="button" className="summary__liquidity" onClick={onLiquidity} aria-haspopup="dialog">
        {t.availableToday} <Money value={d.kpi.available_today} />
        {h30 && (
          <>
            {" · "}
            {fill(t.inDays, { n: "30" })} <Money value={h30.balance} />
          </>
        )}
        <Icon name="chevron-right" size={16} />
      </button>
      {compareAmounts(d.kpi.income, "0") === 0 && compareAmounts(d.kpi.spent, "0") === 0 && <p className="hint">{t.emptyKpi}</p>}
    </section>
  );
}

function Breakdown({ d }: { d: Dashboard }) {
  const { dict } = useI18n();
  const t = dict.fin.dash;
  return (
    <DefinitionList
      rows={[
        { label: t.breakdownIncome, value: <Money value={d.kpi.income} /> },
        { label: t.breakdownSpent, value: <Money value={d.kpi.spent} /> },
        { label: t.breakdownLoanCapital, value: <Money value={d.kpi.loan_capital_paid} /> },
        { label: t.breakdownCommitted, value: <Money value={d.kpi.committed} /> },
        ...(compareAmounts(d.kpi.goal_contributions, "0") > 0 ? [{ label: t.breakdownGoals, value: <Money value={d.kpi.goal_contributions} /> }] : []),
        { label: t.breakdownLeft, value: <strong><Money value={d.kpi.remaining} /></strong> },
        { label: t.owed, value: <Money value={d.kpi.owed} /> },
        ...(compareAmounts(d.kpi.overdue_total, "0") > 0 ? [{ label: t.overdueTotal, value: <Money value={d.kpi.overdue_total} tone="negative" /> }] : []),
      ]}
    />
  );
}

function LiquiditySheet({ d }: { d: Dashboard }) {
  const { dict } = useI18n();
  const t = dict.fin.dash;
  const { first_negative_date: firstNegative, missing } = d.liquidity;
  return (
    <div className="fin-form">
      <p className="muted">{t.liquidityIntro}</p>
      <DefinitionList
        rows={[
          { label: t.availableToday, value: <Money value={d.kpi.available_today} /> },
          ...d.liquidity.horizons.map((h) => ({ label: fill(t.liquidityDays, { n: String(h.days) }), value: <Money value={h.balance} tone={isNegativeAmount(h.balance) ? "negative" : undefined} /> })),
        ]}
      />
      {firstNegative ? (
        <p className="status status--negative" role="status">
          {fill(t.liquidityNegative, { date: formatDate(firstNegative) })}
          {missing && compareAmounts(missing, "0") > 0 && (
            <>
              {" "}
              {t.liquidityMissing.split("{amount}")[0]}
              <Money value={missing} />
              {t.liquidityMissing.split("{amount}")[1]}
            </>
          )}
        </p>
      ) : (
        <p className="muted">{t.liquidityOk}</p>
      )}
    </div>
  );
}

function Rail({ items }: { items: readonly RailItem[] }) {
  const { dict } = useI18n();
  const t = dict.fin.dash;
  const href = useHref();
  return (
    <Section
      title={t.railTitle}
      aside={
        <Link className="summary__link" href={href("pagos-calendario")}>
          {t.railCalendar}
          <Icon name="chevron-right" size={16} />
        </Link>
      }
    >
      {items.length === 0 ? (
        <p className="muted">
          {t.railNone}{" "}
          <Link href={href("cuentas-credito")}>{t.railEmptyTitle}</Link>
        </p>
      ) : (
        <ul className="summary__rail-list">
          {items.map((item) => {
            const target = railTarget(item);
            const rel = relativeDays(item.days_left, dict.fin.relative);
            const state = t.railStates[item.state];
            return (
              <li key={`${item.kind}-${item.ref_id}`}>
                <Link href={href(target.route, target.params)} className={`summary__rail-card summary__rail-card--${item.state}`}>
                  <span className="summary__rail-name">
                    <Icon name={item.kind === "loan_installment" ? "loan" : "card"} size={16} />
                    <span>{item.name}</span>
                  </span>
                  <span className="summary__rail-amount">
                    <Money value={item.amount} />
                  </span>
                  <span className="summary__rail-date muted">
                    {fill(item.kind === "card_cut" ? t.railCut : t.railDue, { date: formatDateShort(item.date) })} · {rel}
                  </span>
                  <span className="visually-hidden">
                    {t.railKinds[item.kind]}
                    {state ? `, ${state}` : ""}
                  </span>
                  {state && item.state !== "cut" && <Badge tone={item.state === "overdue" ? "negative" : "warning"}>{state}</Badge>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function FixedGrid({ d }: { d: Dashboard }) {
  const { dict } = useI18n();
  const t = dict.fin.dash;
  const href = useHref();
  const grid = d.fixed_expenses;
  const today = todayBogota();
  return (
    <Section
      title={`${t.fixedTitle} · ${fill(t.fixedProgress, { paid: String(grid.paid_count), total: String(grid.total_count) })}`}
      aside={
        <Link className="summary__link" href={href("pagos-fijos")}>
          {t.fixedAll}
          <Icon name="chevron-right" size={16} />
        </Link>
      }
    >
      {grid.total_count === 0 ? (
        <Empty
          icon="calendar-check"
          title={t.fixedEmptyTitle}
          body={t.fixedEmptyBody}
          action={
            <Link className="button button--primary" href={href("pagos-recurrencia-nueva")}>
              {dict.fin.fixed.add}
            </Link>
          }
        />
      ) : (
        <>
          <Progress percent={grid.percent} label={`${t.fixedTitle}: ${grid.percent}%`} tone="positive" />
          <ul className="summary__fixed">
            {grid.items.map((item) => {
              const rel = relativeDays(daysBetween(today, item.due_date), dict.fin.relative);
              const line =
                item.status === "skipped"
                    ? t.fixedStatus.skipped
                    : item.status === "overdue"
                      ? `${t.fixedStatus.overdue} ${formatDateShort(item.due_date)}`
                      : `${formatDateShort(item.due_date)} · ${rel}`;
              return (
                <li key={item.occurrence_id}>
                  <Link href={href("pagos-fijo-pagar", [item.occurrence_id])} className={`summary__tile summary__tile--${item.status}`}>
                    <span className="summary__tile-name">{item.name}</span>
                    <span className="summary__tile-line muted">
                      {item.status === "partial" ? (
                        <>
                          {t.fixedLeftLine.split("{amount}")[0]}
                          <Money value={item.pending} />
                          {t.fixedLeftLine.split("{amount}")[1]} · {formatDateShort(item.due_date)}
                        </>
                      ) : item.status === "paid" ? (
                        <>
                          {t.fixedStatus.paid} <Money value={item.paid} /> · {formatDateShort(item.due_date)}
                        </>
                      ) : (
                        <>
                          <Money value={item.expected} estimated={item.estimated} /> · {line}
                        </>
                      )}
                    </span>
                    <span className="visually-hidden">{t.fixedStatus[item.status]}</span>
                    <Progress percent={item.percent} label={`${item.name}: ${item.percent}%`} tone={item.status === "overdue" ? "negative" : item.status === "paid" ? "positive" : "primary"} />
                  </Link>
                </li>
              );
            })}
            {grid.more > 0 && (
              <li>
                <Link href={href("pagos-fijos")} className="summary__tile summary__tile--more">
                  {fill(t.fixedMore, { n: String(grid.more + grid.items.length) })}
                </Link>
              </li>
            )}
          </ul>
        </>
      )}
    </Section>
  );
}

function Shortcuts({ d }: { d: Dashboard }) {
  const { dict } = useI18n();
  const t = dict.fin.dash;
  const href = useHref();
  const remember = (name: string, amount: string, categoryId: string | null) =>
    setDraft({ type: "expense", amount, accountId: null, toAccountId: null, categoryId, description: name, counterparty: "", nature: "", classification: "", tags: [], paymentMethodId: null });
  const plain = d.shortcuts.length === 0;
  return (
    <section aria-label={t.shortcutsTitle} className="summary__shortcuts">
      <ul className="fin-chips">
        {plain
          ? t.shortcutPlain.map((name) => (
              <li key={name}>
                <Link className="chip" href={href("movimiento-nuevo")} onClick={() => remember(name, "", null)}>
                  {name}
                </Link>
              </li>
            ))
          : d.shortcuts.map((s) => (
              <li key={`${s.name}-${s.category_id}`}>
                <Link className="chip" href={href("movimiento-nuevo")} onClick={() => remember(s.name, s.amount, s.category_id)}>
                  {s.name} <Money value={s.amount} compact />
                </Link>
              </li>
            ))}
        <li>
          <Link className="chip" href={href("movimiento-nuevo")} onClick={() => remember("", "", null)}>
            {t.shortcutOther}
          </Link>
        </li>
      </ul>
    </section>
  );
}

function alertText(alert: Alert, t: ReturnType<typeof useI18n>["dict"]["fin"]["dash"]): string {
  return fill(t.alertKinds[alert.kind] ?? alert.name, { name: alert.name, date: formatDate(alert.date) });
}

/** La alerta más urgente en una línea («1 de 3»); sin alertas, «Todo al día» (el bloque no desaparece). */
function Alerts({ d }: { d: Dashboard }) {
  const { dict } = useI18n();
  const t = dict.fin.dash;
  const href = useHref();
  const [index, setIndex] = useState(0);
  const total = d.alerts.length;
  const i = clampIndex(index, total);
  if (total === 0) {
    const text = d.all_clear_days !== null ? fill(t.allClear, { n: String(d.all_clear_days) }) : t.allClearNone;
    return (
      <p className="summary__alert summary__alert--ok" role="status">
        <Icon name="check" size={20} />
        <span>{text}</span>
      </p>
    );
  }
  const alert = d.alerts[i];
  const target = alertTarget(alert);
  return (
    <div className={`summary__alert summary__alert--${alert.severity}`} role="status" aria-label={t.alertsTitle}>
      <Icon name="alert" size={20} />
      <Link href={href(target.route, target.params)} className="summary__alert-text">
        <span className="visually-hidden">{t.alertSeverity[alert.severity]}: </span>
        {alertText(alert, t)}
        {alert.amount && compareAmounts(alert.amount, "0") > 0 && (
          <>
            {" · "}
            <Money value={alert.amount} />
          </>
        )}
      </Link>
      {total > 1 && (
        <span className="summary__alert-pager">
          <button type="button" className="icon-button" aria-label={t.alertPrev} disabled={i === 0} onClick={() => setIndex(i - 1)}>
            <Icon name="arrow-left" size={20} />
          </button>
          <span aria-live="polite">{fill(t.alertOf, { n: String(i + 1), total: String(total) })}</span>
          <button type="button" className="icon-button" aria-label={t.alertNext} disabled={i === total - 1} onClick={() => setIndex(i + 1)}>
            <Icon name="arrow-right" size={20} />
          </button>
        </span>
      )}
    </div>
  );
}
