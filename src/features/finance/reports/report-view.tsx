"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { errorText } from "@/api/errors";
import { downloadExport, exportFileName } from "@/api/download";
import type { Account, Card, Category, ExportFormat, Named, Report, ReportKey, ReportTable } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate, formatPeriod, periodOf, shiftPeriod, todayBogota } from "@/lib/dates";
import { formatPercent } from "@/lib/percent";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { BarChart } from "../charts";
import { scaleWidths } from "../charts-logic";
import { drillHref } from "../drill";
import { useAll, useHref, useResource } from "../hooks";
import { Badge, Banner, Empty, ErrorState, Loading, Money, SelectField, Segmented, TextField } from "../kit";
import { chartColumns, EMPTY_FILTERS, exportBody, filterParams, filtersReady, isDrillColumn, reportRoute, rowPhase, type PeriodMode, type ProjectionOptions, type ReportFilters } from "./logic";

type Rep = Dictionary["fin"]["rep"];
type Cells = Record<string, string>;

/** Busca sin tropezar con las claves heredadas de los objetos (una categoría llamada «constructor» sigue siendo un texto). */
function lookup(map: Cells | undefined, key: string): string | undefined {
  return map && Object.hasOwn(map, key) ? map[key] : undefined;
}

/** El texto de una celda de texto: los códigos del servidor (grupo, tipo, estado, dimensión…) y sus rótulos en español, en el idioma de la persona. */
export function localizedCell(dict: Dictionary, colKey: string, value: string): string {
  const rep = dict.fin.rep;
  const maps: Record<string, Cells | undefined> = { group: rep.cells.group, kind: rep.cells.kind, state: rep.cells.state, dimension: dict.fin.plan.dimensions, period: dict.fin.plan.periods, frequency: dict.fin.frequencies };
  return lookup(maps[colKey], value) ?? lookup(rep.known as Cells, value) ?? value;
}

/** Los rótulos del servidor están en español: se llevan al idioma de la persona con la tabla `rep.known` y, si falta alguno, se muestra tal cual. */
function known(rep: Rep, text: string): string {
  return lookup(rep.known as Cells, text) ?? text;
}

function columnLabel(rep: Rep, _table: ReportTable, _key: string, fallback: string): string {
  return known(rep, fallback);
}

function Value({ kind, value, colKey, estimated }: { kind: ReportTable["columns"][number]["kind"]; value: string | null; colKey: string; estimated?: boolean }) {
  const { dict, locale } = useI18n();
  if (value === null) return <>—</>;
  switch (kind) {
    case "money":
      return <Money value={value} estimated={estimated} />;
    case "percent":
      return <>{formatPercent(value, locale)}</>;
    case "date":
      return <>{colKey === "month" ? formatPeriod(periodOf(value), locale) : formatDate(value)}</>;
    case "int":
      return <>{value}</>;
    default:
      return <>{localizedCell(dict, colKey, value)}</>;
  }
}

/** Una tabla del informe: cada cifra de movimientos abre «Ver movimientos» con el filtro exacto; un saldo lleva a su cuenta, préstamo o tarjeta. */
export function ReportTableView({ table }: { table: ReportTable }) {
  const { dict } = useI18n();
  const rep = dict.fin.rep;
  const href = useHref();
  const label = known(rep, table.title);
  const cols = table.columns;
  const refHref = (row: ReportTable["rows"][number]): string | null => {
    if (!row.ref) return null;
    switch (row.ref.kind) {
      case "account":
        return href("cuenta", [row.ref.id]);
      case "loan":
        return href("credito", [row.ref.id]);
      case "card":
        return href("tarjeta", [row.ref.id]);
      case "recurrence":
        return href("pagos-recurrencia", [row.ref.id]);
      case "debt":
        return href("creditos-deudas");
      default:
        return null;
    }
  };
  const first = (cells: readonly (string | null)[]) => (cells[0] === null ? "" : localizedCell(dict, cols[0].key, cells[0]));
  const antsNote = table.key === "ants";
  return (
    <section className="rep-table" aria-label={label}>
      <ChartFor table={table} label={label} />
      <div className="table-wrap">
        <table className="table">
          <caption className="table__caption">{label}</caption>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} scope="col" className={c.kind === "money" || c.kind === "percent" || c.kind === "int" ? "table__num" : undefined}>
                  {columnLabel(rep, table, c.key, c.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => {
              const phase = rowPhase(table, row.cells);
              const drill = row.movements_filter ? drillHref(href, row.movements_filter) : null;
              const ref = refHref(row);
              return (
                <tr key={r} className={phase ? `rep-row rep-row--${phase}` : undefined}>
                  {cols.map((c, i) => {
                    const value = row.cells[i];
                    const content = <Value kind={c.kind} value={value} colKey={c.key} />;
                    if (i === 0) {
                      return (
                        <th key={c.key} scope="row">
                          {ref ? <Link href={ref}>{content}</Link> : content}
                        </th>
                      );
                    }
                    if (phase && c.key === "state") {
                      return (
                        <td key={c.key}>
                          <Badge tone={phase === "projected" ? "info" : phase === "current" ? "warning" : "neutral"} dashed={phase === "projected"}>
                            {rep.phase[phase]}
                          </Badge>
                        </td>
                      );
                    }
                    const numeric = c.kind === "money" || c.kind === "percent" || c.kind === "int";
                    const linkable = drill !== null && c.kind === "money" && value !== null && isDrillColumn(c.key);
                    return (
                      <td key={c.key} className={numeric ? "table__num" : undefined}>
                        {linkable ? (
                          <Link href={drill} aria-label={`${rep.viewMovements}: ${first(row.cells)} (${columnLabel(rep, table, c.key, c.label)})`}>
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {table.totals && (
            <tfoot>
              <tr>
                {cols.map((c, i) => {
                  const value = table.totals![i] ?? null;
                  return i === 0 ? (
                    <th key={c.key} scope="row">{value === null ? rep.total : localizedCell(dict, c.key, value)}</th>
                  ) : (
                    <td key={c.key} className={c.kind === "money" || c.kind === "percent" || c.kind === "int" ? "table__num" : undefined}>
                      <Value kind={c.kind} value={value === null ? null : String(value)} colKey={c.key} />
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {antsNote && table.rows.length > 0 && <p className="hint">{rep.antsDrillNote}</p>}
    </section>
  );
}

const MAX_CHART_ROWS = 24;

/** La gráfica de una tabla (decorativa; su tabla equivalente está justo debajo). En el pronóstico, lo proyectado va con trama y rótulo. */
function ChartFor({ table, label }: { table: ReportTable; label: string }) {
  const { dict } = useI18n();
  const rep = dict.fin.rep;
  const keys = chartColumns(table);
  if (keys.length === 0) return null;
  const rows = table.rows.slice(0, MAX_CHART_ROWS);
  const indexes = keys.map((key) => table.columns.findIndex((c) => c.key === key));
  const all = indexes.flatMap((index) => rows.map((row) => row.cells[index]));
  const widths = scaleWidths(all);
  const projected = table.key === "projection";
  return (
    <BarChart
      caption={rep.chartOf.replace("{table}", label)}
      series={keys.map((key) => columnLabel(rep, table, key, key))}
      hatchedLabel={projected ? rep.projectedLegend : undefined}
      rows={rows.map((row, r) => ({
        key: String(r),
        label: <Value kind={table.columns[0].kind} value={row.cells[0]} colKey={table.columns[0].key} />,
        values: indexes.map((index, s) => ({
          node: row.cells[index] === null ? "—" : <Money value={row.cells[index]!} compact />,
          width: widths[s * rows.length + r],
          hatched: projected && rowPhase(table, row.cells) === "projected",
        })),
      }))}
    />
  );
}

/** Las cifras principales del informe. */
function Headlines({ report }: { report: Report }) {
  const { dict } = useI18n();
  const rep = dict.fin.rep;
  if (report.headline.length === 0) return null;
  return (
    <section className="fin-kpis" aria-label={rep.figures}>
      {report.headline.map((h) => (
        <div key={h.key} className="fin-kpi">
          <p className="muted">{lookup(rep.headline as Cells, h.key) ?? h.key}</p>
          <p className="fin-kpi__value">
            <Value kind={h.kind} value={h.value} colKey={h.key} />
          </p>
        </div>
      ))}
    </section>
  );
}

export function ReportBody({ report }: { report: Report }) {
  const { dict } = useI18n();
  const rep = dict.fin.rep;
  const empty = report.tables.every((t) => t.rows.length === 0);
  return (
    <div className="rep-body">
      {report.filters.length > 0 && (
        <p className="hint">
          {rep.generated} {formatDate(report.generated_on)} · {report.filters.map((f) => `${known(rep, f.label)}: ${known(rep, f.value)}`).join(" · ")}
        </p>
      )}
      <Headlines report={report} />
      {empty ? <Empty icon="chart" title={rep.emptyTitle} body={rep.emptyBody} /> : report.tables.map((t) => <ReportTableView key={t.key} table={t} />)}
      {report.notes.length > 0 && (
        <ul className="rep-notes hint">
          {report.notes.map((note) => (
            <li key={note}>{known(rep, note)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** La barra de filtros comunes (§3.13): periodo, categoría, cuenta, tarjeta, etiqueta y tipo. Viven en memoria; ninguno es un monto. */
export function FilterBar({ filters, onChange }: { filters: ReportFilters; onChange: (next: ReportFilters) => void }) {
  const { dict, locale } = useI18n();
  const rep = dict.fin.rep;
  const [open, setOpen] = useState(false);
  const categories = useAll<Category>(open ? paths.categories() : null);
  const accounts = useAll<Account>(open ? paths.accounts() : null);
  const cards = useAll<Card>(open ? paths.cards() : null);
  const tags = useAll<Named>(open ? paths.tags() : null);
  const set = (patch: Partial<ReportFilters>) => onChange({ ...filters, ...patch });
  const active = [filters.category, filters.account, filters.card, filters.tag, filters.type].filter(Boolean).length;
  const today = todayBogota();
  return (
    <div className="rep-filters">
      <Segmented
        legend={rep.period}
        value={filters.period}
        onChange={(v) => set({ period: v as PeriodMode, ...(v === "month" && filters.month === "" ? { month: periodOf(today) } : {}) })}
        options={[
          { value: "default", label: rep.periods.default },
          { value: "month", label: rep.periods.month },
          { value: "range", label: rep.periods.range },
        ]}
        variant="chips"
      />
      {filters.period === "month" && (
        <div className="fin-periodbar">
          <button type="button" className="icon-button" aria-label={dict.fin.movements.previousPeriod} onClick={() => set({ month: shiftPeriod(filters.month || periodOf(today), -1) })}>
            <Icon name="arrow-left" />
          </button>
          <p className="title-s" aria-live="polite">{formatPeriod(filters.month || periodOf(today), locale)}</p>
          <button type="button" className="icon-button" aria-label={dict.fin.movements.nextPeriod} onClick={() => set({ month: shiftPeriod(filters.month || periodOf(today), 1) })}>
            <Icon name="arrow-right" />
          </button>
        </div>
      )}
      {filters.period === "range" && (
        <div className="fin-grid-2">
          <TextField label={rep.from} type="date" value={filters.from} onChange={(v) => set({ from: v })} />
          <TextField label={rep.to} type="date" value={filters.to} onChange={(v) => set({ to: v })} error={filters.from && filters.to && filters.to < filters.from ? rep.rangeProblem : null} />
        </div>
      )}
      <button type="button" className="button button--ghost" aria-expanded={open} aria-controls="report-filters" onClick={() => setOpen((v) => !v)}>
        {rep.moreFilters}
        {active > 0 ? ` (${active})` : ""}
      </button>
      {open && (
        <div id="report-filters" className="fin-filters">
          <SelectField label={rep.category} value={filters.category} onChange={(v) => set({ category: v })} placeholder={rep.all} options={categories.items.map((c) => ({ value: c.id, label: c.path.join(" › ") }))} />
          <SelectField label={rep.account} value={filters.account} onChange={(v) => set({ account: v })} placeholder={rep.all} options={accounts.items.map((a) => ({ value: a.id, label: a.name }))} />
          <SelectField label={rep.card} value={filters.card} onChange={(v) => set({ card: v })} placeholder={rep.all} options={cards.items.map((c) => ({ value: c.id, label: c.name }))} />
          <SelectField label={rep.tag} value={filters.tag} onChange={(v) => set({ tag: v })} placeholder={rep.all} options={tags.items.map((t) => ({ value: t.id, label: t.name }))} />
          <SelectField label={rep.type} value={filters.type} onChange={(v) => set({ type: v as ReportFilters["type"] })} placeholder={rep.all} options={(["income", "expense", "transfer"] as const).map((k) => ({ value: k, label: dict.fin.form.types[k] }))} />
          {active > 0 && (
            <button type="button" className="button button--ghost" onClick={() => set({ category: "", account: "", card: "", tag: "", type: "" })}>
              {rep.clear}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Exportar (xlsx, csv, pdf): `POST` con los filtros y el formato en el CUERPO; el archivo llega en la respuesta y se descarga
 * al instante (URL de objeto revocada en el acto). Nunca se guarda ni se reintenta con el archivo.
 */
export function ExportBar({ reportKey, filters, extra }: { reportKey: ReportKey; filters: ReportFilters; extra?: { projection?: ProjectionOptions; threshold?: string } }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.rep.export;
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [failed, setFailed] = useState<{ format: ExportFormat; text: string } | null>(null);
  async function run(format: ExportFormat) {
    setBusy(format);
    setFailed(null);
    const failure = await downloadExport(paths.reportExport(reportKey), exportBody(filters, format, extra), exportFileName(reportKey, format, todayBogota()), locale);
    setBusy(null);
    if (failure) setFailed({ format, text: errorText(failure, dict.fin.errors) });
  }
  return (
    <div className="rep-export">
      <div className="actions" role="group" aria-label={t.title}>
        {(["xlsx", "csv", "pdf"] as const).map((format) => (
          <button key={format} type="button" className="button button--ghost" disabled={busy !== null || !filtersReady(filters)} onClick={() => void run(format)}>
            {busy === format ? t.preparing : t.formats[format]}
          </button>
        ))}
      </div>
      <p className="hint">{t.hint}</p>
      {failed && (
        <Banner tone="negative" live="assertive">
          {t.failed.replace("{format}", failed.format.toUpperCase())} · {failed.text}{" "}
          <button type="button" className="button button--ghost" onClick={() => void run(failed.format)}>
            {dict.common.retry}
          </button>
        </Banner>
      )}
    </div>
  );
}

/** Un informe completo: filtros, exportación y el cuerpo (cifras → gráfica → tabla). `before` y `extraParams` son para los controles propios de cada informe. */
export function ReportView({ reportKey, extraParams, exportExtra, before }: { reportKey: ReportKey; extraParams?: Record<string, string | undefined>; exportExtra?: { projection?: ProjectionOptions; threshold?: string }; before?: ReactNode }) {
  const { dict } = useI18n();
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const ready = filtersReady(filters);
  const report = useResource<Report>(ready ? paths.report(reportKey, { ...filterParams(filters), ...extraParams }) : null);
  return (
    <div className="rep-view">
      <FilterBar filters={filters} onChange={setFilters} />
      {before}
      <ExportBar reportKey={reportKey} filters={filters} extra={exportExtra} />
      {!ready && <p className="muted" role="status">{dict.fin.rep.notReady}</p>}
      {ready && report.loading && !report.data && <Loading />}
      {ready && report.failure && <ErrorState message={errorText(report.failure, dict.fin.errors)} onRetry={report.reload} />}
      {ready && report.data && (
        <div className={report.loading ? "fin-stale" : undefined} aria-busy={report.loading}>
          <ReportBody report={report.data} />
        </div>
      )}
    </div>
  );
}

export { reportRoute };
