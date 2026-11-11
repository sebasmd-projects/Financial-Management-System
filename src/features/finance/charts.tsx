"use client";

import { useId, type ReactNode } from "react";
import { useI18n } from "@/i18n/provider";

export interface ChartValue {
  /** Lo que se lee (un `<Money>`, un porcentaje): va en la tabla equivalente y en el texto de la barra. */
  node: ReactNode;
  /** 0 a 100. */
  width: number;
  /** Trama en lugar de relleno liso (lo proyectado, la segunda serie): la forma, no el color, distingue. */
  hatched?: boolean;
}
export interface ChartRow {
  key: string;
  label: ReactNode;
  values: ChartValue[];
}

/**
 * Gráfica de barras horizontales ACCESIBLE: el dibujo es decorativo (`aria-hidden`) y su equivalente es una tabla con los mismos
 * valores, siempre disponible («Ver como tabla»). Las series se distinguen por la forma (liso o trama) y por su rótulo escrito.
 */
export function BarChart({ caption, series, rows, hatchedLabel }: { caption: string; series: readonly string[]; rows: readonly ChartRow[]; hatchedLabel?: string }) {
  const { dict } = useI18n();
  const id = useId();
  if (rows.length === 0) return null;
  return (
    <figure className="chart" aria-labelledby={`${id}-cap`}>
      <figcaption id={`${id}-cap`} className="chart__caption">
        {caption}
      </figcaption>
      {(series.length > 1 || hatchedLabel) && (
        <ul className="chart__legend" aria-label={dict.fin.charts.legend}>
          {series.map((name, index) => (
            <li key={name}>
              <span className={`chart__swatch${index > 0 && series.length > 1 ? " chart__swatch--hatched" : ""}`} aria-hidden="true" />
              {name}
            </li>
          ))}
          {hatchedLabel && (
            <li>
              <span className="chart__swatch chart__swatch--hatched" aria-hidden="true" />
              {hatchedLabel}
            </li>
          )}
        </ul>
      )}
      <div className="chart__rows" aria-hidden="true">
        {rows.map((row) => (
          <div key={row.key} className="chart__row">
            <span className="chart__label">{row.label}</span>
            <span className="chart__bars">
              {row.values.map((value, index) => (
                <span key={index} className="chart__bar">
                  <span className={`chart__fill chart__fill--${index % 4}${value.hatched || (series.length > 1 && index > 0) ? " chart__fill--hatched" : ""}`} style={{ width: `${Math.max(value.width, value.width > 0 ? 2 : 0)}%` }} />
                  <span className="chart__value">{value.node}</span>
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
      <details className="chart__table">
        <summary>{dict.fin.charts.viewAsTable}</summary>
        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">{caption}</caption>
            <thead>
              <tr>
                <td />
                {series.map((name) => (
                  <th key={name} scope="col" className="table__num">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  {row.values.map((value, index) => (
                    <td key={index} className="table__num">
                      {value.node}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
