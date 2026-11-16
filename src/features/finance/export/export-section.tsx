"use client";

import { useI18n } from "@/i18n/provider";
import { Banner, ErrorState, Loading, Section } from "../kit";
import { PERSONAL_EXPORT, isActive, percent, stepOf, type ExportScope } from "../../../../core/export";
import { useFinanceExport } from "./use-export";

/**
 * «Exportar mis datos de Finanzas»: arriba de la zona de peligro de `/perfil` (lo personal) y en los ajustes de un hogar (lo del hogar, para cualquier
 * miembro). El servidor arma un ZIP aparte: aquí se ve el progreso, se baja una sola vez y se avisa de que el archivo NO está cifrado.
 */
export function ExportSection({ scope = PERSONAL_EXPORT, id = "export" }: { scope?: ExportScope; id?: string }) {
  const { dict } = useI18n();
  const t = dict.fin.export;
  const state = useFinanceExport(scope);
  const household = scope.kind === "household";
  const working = state.phase === "working" || isActive(state.job);
  return (
    <div id={id}>
    <Section title={household ? t.householdTitle : t.title}>
      <p className="muted">{household ? t.householdIntro : t.intro}</p>
      <ul className="muted">
        <li>{t.contentJson}</li>
        <li>{t.contentCsv}</li>
        <li>{t.contentReadme}</li>
      </ul>
      <Banner tone="warning">{t.unencrypted}</Banner>
      {state.phase === "loading" && <Loading label={t.loading} />}
      {working && state.job && (
        <div role="status" aria-live="polite">
          <progress max={100} value={percent(state.job)} aria-label={t.progressLabel}>
            {percent(state.job)}%
          </progress>
          <p className="muted">{t.steps[stepOf(state.job)]}</p>
        </div>
      )}
      {state.phase === "ready" && <Banner tone="positive">{t.ready}</Banner>}
      {state.phase === "done" && <Banner tone="positive">{t.done}</Banner>}
      {state.phase === "failed" && state.error && <ErrorState message={state.error} onRetry={() => void state.start()} />}
      <div className="actions">
        {state.phase === "ready" && (
          <button type="button" className="button button--primary" onClick={() => void state.download()}>
            {t.download}
          </button>
        )}
        {(state.phase === "idle" || state.phase === "done" || state.phase === "ready") && (
          <button type="button" className={state.phase === "ready" ? "button button--ghost" : "button button--primary"} onClick={() => void state.start()}>
            {state.phase === "idle" ? t.start : t.again}
          </button>
        )}
        {working && (
          <button type="button" className="button button--ghost" disabled>
            {t.working}
          </button>
        )}
      </div>
      <p className="hint">{t.limits}</p>
    </Section>
    </div>
  );
}
