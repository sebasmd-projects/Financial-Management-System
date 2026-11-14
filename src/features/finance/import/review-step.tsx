"use client";

import { useState } from "react";
import type { Account, ImportMatch, ImportPreview, ImportPreviewRow } from "@/api/models";
import { formatDate } from "@/lib/dates";
import { formatCop } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { Badge, Banner, Money, Pager, Section, Segmented } from "../kit";
import { CardRowFields, KindSummary, SignControl } from "./card-rows";
import { effectiveAction, filterEntries, isBlocked, previewEntries, storedAs, tally, type EntryFilter, type RowEdit, type SignChoice } from "./logic";

const PAGE = 25;
const MATCH_TONE: Record<ImportMatch, "neutral" | "info" | "positive" | "warning" | "negative"> = {
  new: "positive",
  matches_pending: "info",
  matches_confirmed: "neutral",
  possible_duplicate: "warning",
  duplicate: "negative",
};
const MATCHES: readonly ImportMatch[] = ["new", "matches_pending", "matches_confirmed", "possible_duplicate", "duplicate"];

/** Lo que el lector ignoró: fórmulas y filas ilegibles. Va arriba y escrito, para que nada desaparezca en silencio. */
export function IgnoredNotes({ preview }: { preview: ImportPreview }) {
  const { dict } = useI18n();
  const t = dict.fin.imp.review;
  const formulas = preview.notes.includes("formulas_ignored");
  if (!formulas && preview.errors.length === 0) return null;
  return (
    <Banner tone="warning" live="polite">
      <p>
        <strong>{t.ignoredTitle}</strong>
      </p>
      {formulas && <p data-testid="formulas-ignored">{t.formulas}</p>}
      {preview.errors.length > 0 && (
        <>
          <p data-testid="rows-ignored">{fill(t.unreadable, { count: String(preview.errors.length) })}</p>
          <ul>
            {preview.errors.map((error) => (
              <li key={`${error.row}-${error.code}`}>{fill(t.unreadableRow, { row: String(error.row), reason: t.rowErrors[error.code] ?? t.rowErrorFallback })}</li>
            ))}
          </ul>
        </>
      )}
    </Banner>
  );
}

/** Paso 3 (diseño §3.6): fila por fila, con el cruce y la decisión por defecto; la persona puede incluir u omitir. */
export function ReviewStep({
  preview,
  choices,
  onToggle,
  accounts = [],
  sign = "auto",
  onSign,
  onEdit,
  busy = false,
}: {
  preview: ImportPreview;
  choices: ReadonlyMap<number, "import" | "skip">;
  onToggle: (row: ImportPreviewRow, include: boolean) => void;
  /** Solo tarjetas: las cuentas que pueden pagar o recibir un avance. */
  accounts?: readonly Account[];
  sign?: SignChoice;
  onSign?: (sign: SignChoice) => void;
  onEdit?: (row: ImportPreviewRow, patch: RowEdit) => void;
  busy?: boolean;
}) {
  const { dict } = useI18n();
  const t = dict.fin.imp.review;
  const [filter, setFilter] = useState<EntryFilter>("all");
  const [page, setPage] = useState(1);
  const counts = tally(preview.rows, choices);
  const entries = previewEntries(preview);
  const shown = filterEntries(entries, filter);
  const visible = shown.slice((page - 1) * PAGE, page * PAGE);
  const present = MATCHES.filter((match) => (preview.counts[match] ?? 0) > 0);
  const summary = preview.summary;
  const filterOptions = [
    { value: "all", label: `${t.all} (${entries.length})` },
    ...(summary.warnings > 0 ? [{ value: "warning", label: `${t.filters.warning} (${summary.warnings})` }] : []),
    ...(summary.errors > 0 ? [{ value: "error", label: `${t.filters.error} (${summary.errors})` }] : []),
    ...(present.length > 1 ? present.map((m) => ({ value: m, label: `${t.matches[m]} (${preview.counts[m] ?? 0})` })) : []),
  ];
  const isCard = preview.target === "card";

  return (
    <div className="fin-stack">
      <IgnoredNotes preview={preview} />
      {isCard && onSign && <SignControl preview={preview} sign={sign} onChange={onSign} busy={busy} />}
      <Section title={t.summaryTitle}>
        <p data-testid="import-validity">{fill(t.readSummary, { read: String(summary.rows_read), valid: String(summary.valid), warnings: String(summary.warnings), errors: String(summary.errors) })}</p>
        <ul className="fin-list imp-summary" data-testid="import-summary">
          <li>{fill(t.willImport, { count: String(counts.import) })}</li>
          <li>{fill(t.willConfirm, { count: String(counts.confirm) })}</li>
          <li>{fill(t.willLink, { count: String(counts.link) })}</li>
          <li>{fill(t.willSkip, { count: String(counts.skip) })}</li>
        </ul>
        {isCard && <KindSummary preview={preview} />}
        {preview.meta.ledger_balance && <p className="hint">{fill(t.ofxBalance, { balance: formatCop(preview.meta.ledger_balance) })}</p>}
      </Section>
      {filterOptions.length > 1 && (
        <Segmented legend={t.filter} variant="chips" value={filter} onChange={(v) => { setFilter(v as EntryFilter); setPage(1); }} options={filterOptions} />
      )}
      <h3 className="title-s">{t.tableTitle}</h3>
      {visible.length === 0 && <p className="muted">{t.empty}</p>}
      <ul className="fin-list">
        {visible.map((entry) => {
          if (entry.kind === "error") {
            return (
              <li key={`error-${entry.number}`} className="fin-row fin-row--static imp-row imp-row--skipped" data-testid={`error-row-${entry.number}`}>
                <span className="fin-row__main">
                  <span className="fin-row__title">{fill(t.row, { number: String(entry.number) })}</span>
                  <span className="fin-row__badges">
                    <Badge tone="negative">{t.validity.error}</Badge>
                  </span>
                  <span className="fin-row__sub muted">{fill(t.errorRow, { reason: t.rowErrors[entry.code] ?? t.rowErrorFallback })}</span>
                </span>
              </li>
            );
          }
          const row = entry.row;
          const action = effectiveAction(row, choices);
          const included = action !== "skip";
          return (
            <li key={row.number} className={`fin-row fin-row--static imp-row${included ? "" : " imp-row--skipped"}`}>
              <label className="imp-row__check">
                <input type="checkbox" checked={included} disabled={row.match === "duplicate" || (isCard && isBlocked(row))} onChange={(event) => onToggle(row, event.target.checked)} />
                <span className="visually-hidden">{fill(t.include, { number: String(row.number) })}</span>
              </label>
              <span className="fin-row__main">
                <span className="fin-row__title">{row.description || t.row.replace("{number}", String(row.number))}</span>
                <span className="fin-row__sub muted">
                  {formatDate(row.date)} · {fill(t.row, { number: String(row.number) })}
                  {row.reference ? ` · ${row.reference}` : ""}
                </span>
                <span className="fin-row__badges">
                  <Badge tone={row.validity === "valid" ? "positive" : "warning"}>{t.validity[row.validity]}</Badge>
                  <Badge tone={MATCH_TONE[row.match]} dashed={row.match === "possible_duplicate"}>
                    {t.matches[row.match]}
                  </Badge>
                  {row.counterparty && <Badge>{row.counterparty}</Badge>}
                </span>
                <span className="fin-row__sub muted">{t.matchHints[row.match]}</span>
                <span className="fin-row__sub" data-testid={`stored-${row.number}`}>{t.storedAs[storedAs(row, choices)]}</span>
                {row.reasons.filter((reason) => t.reasons[reason]).map((reason) => (
                  <span key={reason} className="fin-row__sub muted">{t.reasons[reason]}</span>
                ))}
                {isCard && onEdit && <CardRowFields row={row} accounts={accounts} onEdit={onEdit} busy={busy} />}
              </span>
              <Money value={row.amount} sign="always" kind={row.amount.startsWith("-") ? "egreso" : "ingreso"} />
            </li>
          );
        })}
      </ul>
      <Pager page={page} count={shown.length} pageSize={PAGE} onPage={setPage} />
    </div>
  );
}
