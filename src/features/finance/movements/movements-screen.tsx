"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Account, Category, Movement, Page } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate, formatPeriod, periodOf, periodRange, shiftPeriod, todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import type { RouteId } from "@/nav/routes";
import { Icon } from "@/ui/icons";
import { dayNet, groupByDate, signedAmount, disambiguate } from "../helpers";
import { clearDrill as clearStagedDrill, peekDrill, type Drill } from "../drill";
import { useAll, useHref, useQuery } from "../hooks";
import { AuthorLine, BothNotice, ReadOnlyBanner } from "../../household/notices";
import { useCanWrite, useScope } from "../../household/scope-store";
import { Badge, Checkbox, Empty, ErrorState, LinkTabs, Loading, Money, Pager, ScreenHeader, SelectField } from "../kit";

export type MovementsPreset = "all" | "income" | "expense" | "transfer";
const PRESET_ROUTE: Record<MovementsPreset, RouteId> = { all: "movimientos", income: "movimientos-ingresos", expense: "movimientos-egresos", transfer: "movimientos-transferencias" };
const PAGE_SIZE = 50;

/** Historial (`/movimientos`, diseño §3.3): segmentos, filtros, agrupado por día con subtotal. Los filtros viven en memoria, no en la URL. */
export function MovementsScreen({ preset, routeId }: { preset: MovementsPreset; routeId: RouteId }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.movements;
  const href = useHref();
  const canWrite = useCanWrite();
  const search = useSearchParams();
  const [period, setPeriod] = useState(() => periodOf(todayBogota()));
  // «Ver movimientos» desde un presupuesto, una meta o un informe: el filtro exacto llega por memoria (nunca por la URL) y se envía en el cuerpo de POST movements/search.
  const [drill, setDrill] = useState<Drill>(() => peekDrill());
  useEffect(() => clearStagedDrill(), []);
  const [account, setAccount] = useState(search.get("cuenta") ?? drill.account ?? "");
  const [category, setCategory] = useState(drill.category ?? "");
  const [status, setStatus] = useState(drill.status ?? "");
  const [showAnnulled, setShowAnnulled] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(account !== "");
  const [page, setPage] = useState(1);

  const accounts = useAll<Account>(paths.accounts());
  const categories = useAll<Category>(paths.categories());
  const drilled = drill.from !== undefined || drill.to !== undefined;
  const range = drilled ? { from: drill.from, to: drill.to } : periodRange(period);
  const hasDrill = Object.keys(drill).length > 0;
  const list = useQuery<Page<Movement>>(
    paths.movementsSearch(),
    {
      type: preset === "all" ? undefined : preset,
      from: range.from,
      to: range.to,
      account: account || undefined,
      category: category || undefined,
      status: status || undefined,
      min_amount: drill.min_amount,
      max_amount: drill.max_amount,
      tag: drill.tag,
      cost_center: drill.cost_center,
      counterparty: drill.counterparty,
      ledger_account: drill.ledger_account,
      classification: drill.classification,
      nature: drill.nature,
      show_annulled: showAnnulled || undefined,
      page,
      page_size: PAGE_SIZE,
    },
  );

  const groups = groupByDate(list.data?.results ?? []);
  const activeFilters = [account, category, status].filter(Boolean).length + (showAnnulled ? 1 : 0);
  const clearDrill = () => {
    setDrill({});
    setAccount("");
    setCategory("");
    setStatus("");
    setPage(1);
  };
  const reset = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <div className="screen">
      <ScreenHeader
        title={dict.screens[routeId]}
        eyebrow={dict.nav.sections.movimientos}
        actions={
          canWrite ? (
            <Link className="button button--primary" href={href("movimiento-nuevo")}>
              <Icon name="plus" size={20} />
              {dict.nav.newMovement}
            </Link>
          ) : undefined
        }
      />
      <ReadOnlyBanner />
      <BothNotice />
      <LinkTabs
        label={t.segments}
        items={(Object.keys(PRESET_ROUTE) as MovementsPreset[]).map((key) => ({ href: href(PRESET_ROUTE[key]), label: t.presets[key], current: key === preset }))}
      />

      {hasDrill && (
        <p className="fin-phrase" role="status">
          {drilled && drill.from && drill.to ? `${t.drillActive} ${formatDate(drill.from)} – ${formatDate(drill.to)}. ` : `${t.drillActive} `}
          <button type="button" className="button button--ghost" onClick={clearDrill}>
            {t.drillClear}
          </button>
        </p>
      )}
      <div className="fin-periodbar">
        {!drilled && (
          <>
        <button type="button" className="icon-button" aria-label={t.previousPeriod} onClick={() => reset(setPeriod)(shiftPeriod(period, -1))}>
          <Icon name="arrow-left" />
        </button>
        <p className="title-s" aria-live="polite">
          {formatPeriod(period, locale)}
        </p>
        <button type="button" className="icon-button" aria-label={t.nextPeriod} onClick={() => reset(setPeriod)(shiftPeriod(period, 1))}>
          <Icon name="arrow-right" />
        </button>
          </>
        )}
        <button type="button" className="button button--ghost" aria-expanded={filtersOpen} aria-controls="movement-filters" onClick={() => setFiltersOpen((v) => !v)}>
          {t.filters}
          {activeFilters > 0 ? ` (${activeFilters})` : ""}
        </button>
      </div>

      {filtersOpen && (
        <div id="movement-filters" className="fin-filters">
          <SelectField label={t.filterAccount} value={account} onChange={reset(setAccount)} placeholder={t.all} options={disambiguate(accounts.items).map((a) => ({ value: a.id, label: a.name }))} />
          <SelectField label={t.filterCategory} value={category} onChange={reset(setCategory)} placeholder={t.all} options={categories.items.map((c) => ({ value: c.id, label: c.path.join(" › ") }))} />
          <SelectField label={t.filterStatus} value={status} onChange={reset(setStatus)} placeholder={t.all} options={(["pendiente", "confirmado", "conciliado", "anulado"] as const).map((s) => ({ value: s, label: dict.fin.entryStatus[s] }))} />
          <Checkbox label={t.showAnnulled} checked={showAnnulled} onChange={reset(setShowAnnulled)} />
          {activeFilters > 0 && (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                setAccount("");
                setCategory("");
                setStatus("");
                setShowAnnulled(false);
                setPage(1);
              }}
            >
              {t.clearFilters}
            </button>
          )}
        </div>
      )}

      {list.loading && !list.data && <Loading />}
      {list.failure && <ErrorState message={dict.fin.errors.generic} onRetry={list.reload} />}
      {list.data && groups.length === 0 && (
        <Empty
          title={activeFilters > 0 || hasDrill ? t.noMatchTitle : fillPeriod(t.emptyTitle, formatPeriod(period, locale))}
          body={activeFilters > 0 ? t.noMatchBody : t.emptyBody}
          icon="list"
          action={
            activeFilters > 0 ? (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => {
                  setAccount("");
                  setCategory("");
                  setStatus("");
                  setShowAnnulled(false);
                }}
              >
                {t.clearFilters}
              </button>
            ) : canWrite ? (
              <Link className="button button--primary" href={href("movimiento-nuevo")}>
                {t.addFirst}
              </Link>
            ) : undefined
          }
        />
      )}

      <div className={list.loading ? "fin-stale" : undefined} aria-busy={list.loading}>
        {groups.map((group) => (
          <section key={group.date} className="fin-day" aria-label={formatDate(group.date)}>
            <h2 className="fin-day__head">
              <span>{formatDate(group.date)}</span>
              <span className="muted fin-day__net">
                <span className="visually-hidden">{t.dayTotal} </span>
                <Money value={dayNet(group.items)} sign="always" />
              </span>
            </h2>
            <ul className="fin-list">
              {group.items.map((movement) => (
                <li key={movement.id}>
                  <MovementRow movement={movement} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {list.data && <Pager page={page} count={list.data.count} pageSize={PAGE_SIZE} onPage={setPage} />}
    </div>
  );
}

function fillPeriod(template: string, period: string): string {
  return template.replace("{period}", period);
}

export function MovementRow({ movement }: { movement: Movement }) {
  const { dict } = useI18n();
  const t = dict.fin.movements;
  const href = useHref();
  const scope = useScope();
  const { value, sign } = signedAmount(movement);
  const title = movement.counterparty?.name ?? movement.description ?? movement.category?.name ?? dict.fin.form.types[movement.type];
  const subtitle = [movement.type === "transfer" ? `${movement.account.name} → ${movement.to_account?.name ?? ""}` : movement.category?.path.join(" › "), movement.type === "transfer" ? null : movement.account.name].filter(Boolean).join(" · ");
  const kind = movement.type === "expense" ? "egreso" : movement.type === "income" ? "ingreso" : "transferencia";
  return (
    <Link href={href("movimiento", [movement.id])} className="fin-row fin-row--movement">
      <span className="fin-row__main">
        <span className="fin-row__title">{title}</span>
        <span className="fin-row__sub muted">{subtitle}</span>
        {scope.kind === "household" && <AuthorLine createdBy={movement.created_by} updatedBy={movement.updated_by} />}
        <span className="fin-row__badges">
          {movement.status === "pendiente" && (
            <Badge dashed>
              <Icon name="clock" size={14} /> {dict.fin.entryStatus.pendiente}
            </Badge>
          )}
          {movement.status === "conciliado" && <Badge tone="info">{dict.fin.entryStatus.conciliado}</Badge>}
          {movement.voided && <Badge>{dict.fin.entryStatus.anulado}</Badge>}
          {movement.attachments > 0 && (
            <span className="muted">
              <Icon name="clip" size={14} />
              <span className="visually-hidden">{t.hasAttachments}</span>
            </span>
          )}
        </span>
      </span>
      <span className="fin-row__amount">
        <Money value={value} sign={sign} kind={kind} strike={movement.voided} tone={movement.status === "pendiente" ? "muted" : movement.type === "income" ? "positive" : undefined} />
      </span>
    </Link>
  );
}
