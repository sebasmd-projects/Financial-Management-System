"use client";

import { useState } from "react";
import type { ImportFormat, ImportFormatColumn, ImportFormats } from "@/api/models";
import { paths } from "@/api/paths";
import { saveBlob } from "@/api/download";
import { formatDate } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { useResource } from "../hooks";
import { Banner, ErrorState, Loading, Modal, Segmented } from "../kit";
import { formatFor } from "./logic";

/** Excel en español abre bien un CSV con acentos solo si trae la marca BOM: se antepone al descargar (el servidor no la envía). */
const BOM = "﻿";

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${Math.round(bytes / 1024)} KB`;
}

/** Las tablas del formato son de solo lectura y con título: lector de pantalla las anuncia y se pueden recorrer con el teclado. */
function Grid({ caption, head, rows }: { caption: string; head: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={caption}>
      <table className="table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {head.map((label, index) => (
              <th key={index} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r}>
              {cells.map((cell, c) => (c === 0 ? <th key={c} scope="row">{cell}</th> : <td key={c}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** El texto de «Valores permitidos» de una columna: sale del tipo y los límites que manda el servidor. */
function allowedText(column: ImportFormatColumn, t: FormatText): string {
  const c = column.constraints;
  switch (column.type) {
    case "date":
      return t.allowed.date;
    case "money":
      return t.allowed.money;
    case "integer":
      return fill(t.allowed.integer, { min: String(c.min ?? 1), max: String(c.max ?? "") });
    default:
      return c.max_length ? fill(t.allowed.text, { max: String(c.max_length) }) : t.allowed.textFree;
  }
}

type FormatText = ReturnType<typeof useI18n>["dict"]["fin"]["imp"]["format"];

function signText(format: ImportFormat, t: FormatText): string {
  if (format.sign_modes.length === 0) return t.sign.account;
  return fill(t.sign.card, { modes: format.sign_modes.map((m) => dictSign(m, t)).join(", ") });
}

function dictSign(mode: string, t: FormatText): string {
  return t.signModes[mode] ?? mode;
}

function Body({ formats, initial }: { formats: ImportFormats; initial: "account" | "card" }) {
  const { dict } = useI18n();
  const t = dict.fin.imp.format;
  const [target, setTarget] = useState<"account" | "card">(initial);
  const format = formatFor(formats.formats, target);
  if (!format) return null;
  const isCard = format.kind === "card";
  const limits = format.limits;
  const rowErrors = dict.fin.imp.review.rowErrors;

  function download() {
    if (!format) return;
    saveBlob(new Blob([BOM, format.template_csv], { type: "text/csv;charset=utf-8" }), format.template_filename);
  }

  return (
    <div className="fin-stack imp-format" data-testid="import-format">
      <Segmented
        legend={t.targetLegend}
        value={target}
        onChange={(value) => setTarget(value === "card" ? "card" : "account")}
        options={formats.formats.filter((f) => f.kind !== "opening_plans").map((f) => ({ value: f.kind, label: t.targets[f.kind] ?? f.kind }))}
      />

      <section aria-labelledby="fmt-files">
        <h3 id="fmt-files" className="title-s">{t.filesTitle}</h3>
        <ul className="fin-bullets">
          <li>{fill(t.files, { extensions: format.extensions.join(", ") })}</li>
          <li>{t.encoding}</li>
          <li>{fill(t.limits, { size: sizeLabel(limits.max_bytes), rows: String(limits.max_rows), cols: String(limits.max_columns), cell: String(limits.max_cell_chars) })}</li>
          <li>{t.formulas}</li>
          <li>{t.delimiter}</li>
          <li>{fill(t.ofx, { fields: format.ofx_fields.join(", ") })}</li>
        </ul>
      </section>

      <section aria-labelledby="fmt-amounts">
        <h3 id="fmt-amounts" className="title-s">{t.amountsTitle}</h3>
        <ul className="fin-bullets">
          <li>{t.decimals}</li>
          <li>{t.amountForms}</li>
          <li>{signText(format, t)}</li>
          <li>{t.amountModes}</li>
        </ul>
      </section>

      <section aria-labelledby="fmt-dates">
        <h3 id="fmt-dates" className="title-s">{t.datesTitle}</h3>
        <p className="hint">{t.datesHint}</p>
        <Grid caption={t.datesCaption} head={[t.dates.pattern, t.dates.example]} rows={format.date_formats.map((d) => [d.pattern, d.example])} />
      </section>

      <section aria-labelledby="fmt-columns">
        <h3 id="fmt-columns" className="title-s">{t.columnsTitle}</h3>
        <Grid
          caption={t.columnsCaption}
          head={[t.columns.title, t.columns.required, t.columns.type, t.columns.allowed, t.columns.example]}
          rows={format.columns.map((c) => [
            `${c.header} — ${t.columnNames[c.key] ?? c.key}`,
            c.required ? t.yes : t.no,
            t.types[c.type] ?? c.type,
            allowedText(c, t),
            c.example === "" ? "—" : c.example,
          ])}
        />
        {isCard && <p className="hint">{t.cardInstallments}</p>}
      </section>

      <section aria-labelledby="fmt-example">
        <h3 id="fmt-example" className="title-s">{fill(t.exampleTitle, { count: String(format.example_rows.length) })}</h3>
        <p className="hint">{t.exampleHint}</p>
        <Grid caption={t.exampleCaption} head={format.example_header} rows={format.example_rows.map((r) => r.map((cell) => (cell === "" ? "—" : cell)))} />
        <h4 className="title-s">{t.storedTitle}</h4>
        <p className="hint">{t.storedHint}</p>
        <Grid
          caption={t.storedCaption}
          head={isCard ? [t.stored.row, t.stored.date, t.stored.description, t.stored.amount, t.stored.kind, t.stored.installments] : [t.stored.row, t.stored.date, t.stored.description, t.stored.amount]}
          rows={format.example_stored.map((s) => {
            const base = [String(s.number), formatDate(s.date), s.description, s.amount];
            return isCard ? [...base, s.kind ? (dict.fin.imp.card.kinds[s.kind] ?? s.kind) : "—", s.installments ? String(s.installments) : "—"] : base;
          })}
        />
        <p>
          <button type="button" className="button button--primary" onClick={download}>
            {t.download}
          </button>
        </p>
        <p className="hint">{t.downloadHint}</p>
      </section>

      <section aria-labelledby="fmt-errors">
        <h3 id="fmt-errors" className="title-s">{t.errorsTitle}</h3>
        <p className="hint">{t.errorsHint}</p>
        <ul className="fin-bullets">
          {format.row_errors.map((code) => (
            <li key={code}>{rowErrors[code] ?? code}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * «Formato del archivo» (propietario, 2026-11-14): antes de subir, cómo debe ser el archivo con filas de ejemplo y una plantilla.
 * Todo viene de `GET imports/formats`, que el servidor arma con las mismas constantes y el mismo lector que procesan el archivo, así
 * que lo que se enseña aquí no puede desviarse de lo que se acepta. No guarda nada en el navegador.
 */
export function FormatGuide({ initial }: { initial: "account" | "card" }) {
  const { dict } = useI18n();
  const t = dict.fin.imp.format;
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button button--ghost" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {t.open}
      </button>
      <Modal open={open} title={t.title} onClose={() => setOpen(false)}>
        {open && <Loaded initial={initial} />}
      </Modal>
    </>
  );
}

function Loaded({ initial }: { initial: "account" | "card" }) {
  const { dict } = useI18n();
  const resource = useResource<ImportFormats>(paths.importFormats());
  if (resource.failure) return <ErrorState message={dict.fin.errors.generic} onRetry={resource.reload} />;
  if (!resource.data) return <Loading />;
  if (resource.data.formats.length === 0) return <Banner tone="warning">{dict.fin.errors.generic}</Banner>;
  return <Body formats={resource.data} initial={initial} />;
}
