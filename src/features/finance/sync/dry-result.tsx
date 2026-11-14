"use client";

import { useI18n } from "@/i18n/provider";
import type { DryRun } from "@/api/models";
import { fill } from "../helpers";
import { Badge } from "../kit";

/** El resultado de «Probar» una regla de autoconfirmación: cuántos correos recientes cumplirían y cuáles. Sin efectos: no confirma nada. */
export function SyncDryResult({ dry }: { dry: DryRun }) {
  const { dict } = useI18n();
  const t = dict.fin.sync.rules;
  return (
    <section className="fin-card" aria-label={t.testTitle} data-testid="dry-run">
      <p role="status" aria-live="polite">
        <strong>{dry.evaluated === 0 ? t.testNoEvents : fill(t.testSummary, { matched: String(dry.matched), evaluated: String(dry.evaluated) })}</strong>
      </p>
      {dry.evaluated > 0 && dry.matched === 0 && <p className="muted">{t.testNone}</p>}
      {dry.truncated && <p className="hint">{t.testTruncated}</p>}
      {dry.rows.length > 0 && (
        <ul className="fin-list">
          {dry.rows.map((row) => (
            <li key={row.subject_id} className="fin-row fin-row--static">
              <span className="fin-row__main">
                <span className="fin-row__title">{row.label}</span>
                <span className="fin-row__badges">
                  <Badge tone={row.matched ? "positive" : "neutral"}>{row.matched ? t.testMatches : t.testNoMatch}</Badge>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
