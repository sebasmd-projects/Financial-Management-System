"use client";

import { formatPercent } from "@/lib/percent";
import { useI18n } from "@/i18n/provider";
import type { DryRun, RuleTrigger } from "@/api/models";
import { fill } from "../helpers";
import { Badge, Money } from "../kit";
import { choiceLabel, fieldLabel } from "./labels";

/**
 * El resultado de «Probar ahora»: cuántos sujetos se evaluaron, cuáles cumplen y con qué valores. No tiene efectos (no crea avisos,
 * no abre la espera). «Cumple» se escribe con palabras: el color nunca es la única señal.
 */
export function DryRunView({ dry, trigger }: { dry: DryRun; trigger: RuleTrigger | undefined }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.auto;
  return (
    <section className="fin-card" aria-label={t.testResult} data-testid="dry-run">
      <p>
        <strong>{fill(t.testSummary, { matched: String(dry.matched), evaluated: String(dry.evaluated) })}</strong>
      </p>
      {dry.matched === 0 && <p className="muted">{dry.evaluated === 0 ? t.testNoSubjects : t.testNoMatches}</p>}
      {dry.truncated && <p className="hint">{t.testTruncated}</p>}
      {dry.rows.length > 0 && (
        <ul className="fin-list">
          {dry.rows.map((row) => (
            <li key={row.subject_id} className="fin-row fin-row--static">
              <span className="fin-row__main">
                <span className="fin-row__title">{row.label}</span>
                <span className="fin-row__badges">
                  <Badge tone={row.matched ? "positive" : "neutral"}>{row.matched ? t.matches : t.noMatch}</Badge>
                </span>
                <span className="fin-row__sub muted">
                  {Object.entries(row.values).map(([key, value], index) => {
                    const field = trigger?.condition_fields.find((f) => f.key === key);
                    return (
                      <span key={key}>
                        {index > 0 ? " · " : ""}
                        {fieldLabel(t, key, field?.label)}{" "}
                        {value === null || value === undefined ? (
                          "—"
                        ) : field?.kind === "amount" ? (
                          <Money value={String(value)} />
                        ) : field?.kind === "percent" ? (
                          formatPercent(String(value), locale, 2)
                        ) : field?.kind === "option" ? (
                          choiceLabel(t, String(value))
                        ) : (
                          String(value)
                        )}
                      </span>
                    );
                  })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
