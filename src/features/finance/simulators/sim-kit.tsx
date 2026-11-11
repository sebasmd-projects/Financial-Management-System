"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/api";
import type { ApiResult } from "@/api/client";
import { errorText } from "@/api/errors";
import { downloadExport, exportFileName } from "@/api/download";
import type { ExportFormat, RateConvention } from "@/api/models";
import { paths } from "@/api/paths";
import { todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { RATE_CONVENTIONS } from "../cards/cards-screen";
import { useHref } from "../hooks";
import { Banner, ErrorState, Loading, ScreenHeader, SelectField, TextField } from "../kit";
import type { RouteId } from "@/nav/routes";

const DEBOUNCE_MS = 350;

type Failure = Extract<ApiResult<unknown>, { ok: false }>;

export interface Simulation<T> {
  /** Faltan datos: no se pide nada y el resultado queda en blanco. */
  idle: boolean;
  loading: boolean;
  data: T | null;
  failure: Failure | null;
}

/**
 * Pide un cálculo al servidor cuando las entradas están completas (con una pausa breve mientras se escribe). Los simuladores son
 * `POST` por el cuerpo, pero NO escriben nada: no llevan `Idempotency-Key` y repetirlos no tiene efecto. Todo en memoria.
 */
export function useSimulation<T>(path: string, body: unknown | null): Simulation<T> {
  const key = body === null ? null : JSON.stringify(body);
  const [state, setState] = useState<{ key: string; result: ApiResult<T> } | null>(null);
  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api.post<T>(path, JSON.parse(key) as unknown, { signal: controller.signal }).then((result) => {
        if (!controller.signal.aborted) setState({ key, result });
      });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [path, key]);
  const current = key !== null && state?.key === key ? state.result : null;
  return { idle: key === null, loading: key !== null && current === null, data: current?.ok ? current.data : null, failure: current && !current.ok ? current : null };
}

/** El marco de un simulador: título, «no guarda nada» y atrás a Amortizaciones. */
export function SimulatorShell({ route, children }: { route: RouteId; children: ReactNode }) {
  const { dict } = useI18n();
  const href = useHref();
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens[route]} eyebrow={dict.nav.sections.creditos} back={{ href: href("creditos-amortizaciones"), label: dict.screens["creditos-amortizaciones"] }} />
      <p className="muted">{dict.fin.sim.neverWrites}</p>
      {children}
    </div>
  );
}

/** El estado del resultado: en blanco con la indicación, cargando, o el error del servidor dicho con palabras. */
export function SimulationStatus({ sim, incomplete }: { sim: Simulation<unknown>; incomplete: string }) {
  const { dict } = useI18n();
  if (sim.idle) return <p className="muted" role="status">{incomplete}</p>;
  if (sim.failure) {
    return sim.failure.status === 0 || sim.failure.status >= 500 ? <ErrorState message={errorText(sim.failure, dict.fin.errors)} /> : <Banner tone="negative" live="assertive">{errorText(sim.failure, dict.fin.errors)}</Banner>;
  }
  if (sim.loading && !sim.data) return <Loading />;
  return null;
}

export function RateInput({ rate, onRate, convention, onConvention, error }: { rate: string; onRate: (v: string) => void; convention: RateConvention; onConvention: (v: RateConvention) => void; error?: string | null }) {
  const { dict } = useI18n();
  return (
    <div className="fin-grid-2">
      <TextField label={dict.fin.loans.fields.rate} hint={dict.fin.cards.fields.rateHint} value={rate} onChange={onRate} inputMode="decimal" error={error ?? null} />
      <SelectField label={dict.fin.loans.fields.convention} value={convention} onChange={(v) => onConvention(v as RateConvention)} options={RATE_CONVENTIONS.map((c) => ({ value: c, label: dict.fin.sim.conventions[c] }))} />
    </div>
  );
}

/** Exportar la tabla: el archivo llega en la respuesta y se descarga al instante; nunca se guarda. */
export function ExportButtons({ body }: { body: Record<string, unknown> }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.sim.export;
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [failed, setFailed] = useState<{ format: ExportFormat; text: string } | null>(null);
  async function run(format: ExportFormat) {
    setBusy(format);
    setFailed(null);
    const failure = await downloadExport(paths.simulate("installment/export"), { ...body, format }, exportFileName("amortizacion", format, todayBogota()), locale);
    setBusy(null);
    if (failure) setFailed({ format, text: errorText(failure, dict.fin.errors) });
  }
  return (
    <div>
      <div className="actions" role="group" aria-label={t.label}>
        {(["xlsx", "csv", "pdf"] as const).map((format) => (
          <button key={format} type="button" className="button button--ghost" disabled={busy !== null} onClick={() => void run(format)}>
            {busy === format ? t.preparing : t.formats[format]}
          </button>
        ))}
      </div>
      {failed && (
        <Banner tone="negative" live="assertive">
          {t.failed.replace("{format}", failed.format.toUpperCase())} {failed.text}{" "}
          <button type="button" className="button button--ghost" onClick={() => void run(failed.format)}>
            {dict.common.retry}
          </button>
        </Banner>
      )}
    </div>
  );
}
