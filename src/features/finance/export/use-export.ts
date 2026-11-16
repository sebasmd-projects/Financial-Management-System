"use client";

/**
 * El estado de «Exportar todos mis datos de Finanzas» de un ámbito (personal u hogar), todo en MEMORIA del componente: ni `localStorage` ni caché.
 * Al montar lee el último trabajo (retomar tras recargar); `start()` lo pide y sondea hasta que esté listo; `download()` pide un enlace NUEVO (los de
 * un solo uso vencen a los 15 minutos) y entrega el ZIP al navegador sin guardarlo en otro sitio. Con `auto`, al estar listo se baja solo
 * (el diálogo de «Exportar primero»).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api";
import { saveBlob } from "@/api/download";
import { errorText } from "@/api/errors";
import { useI18n } from "@/i18n/provider";
import { MAX_POLLS, canDownload, exportApi, exportFileName, isActive, pollDelay, runExport, type ExportJob, type ExportOutcome, type ExportScope } from "../../../../core/export";

const client = exportApi(api);

export type ExportPhase = "loading" | "idle" | "working" | "ready" | "done" | "failed";

export interface FinanceExport {
  phase: ExportPhase;
  job: ExportJob | null;
  /** Texto del último fallo, ya localizado. */
  error: string | null;
  outcome: ExportOutcome | null;
  start: () => Promise<void>;
  download: () => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const today = () => new Date().toISOString().slice(0, 10);

export function useFinanceExport(scope: ExportScope, options: { auto?: boolean; resume?: boolean } = {}): FinanceExport {
  const { dict, locale } = useI18n();
  const auto = options.auto === true;
  const resume = options.resume !== false;
  const scopeId = scope.kind === "household" ? scope.id : "";
  const [phase, setPhase] = useState<ExportPhase>(resume ? "loading" : "idle");
  const [job, setJob] = useState<ExportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ExportOutcome | null>(null);
  const alive = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const scopeRef = useRef(scope);

  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);

  const fail = useCallback(
    (result: Extract<Awaited<ReturnType<typeof client.job>>, { ok: false }>) => {
      if (!alive.current) return;
      setError(errorText(result, dict.fin.errors));
      setPhase("failed");
    },
    [dict],
  );

  const save = useCallback(
    async (url: string) => {
      const got = await client.download(url, { locale });
      if (!alive.current) return false;
      if (!got.ok) {
        fail(got);
        setOutcome(got.status === 410 ? "link_used" : "error");
        return false;
      }
      saveBlob(got.data, exportFileName(scopeRef.current, today()));
      setPhase("done");
      setOutcome("ok");
      return true;
    },
    [fail, locale],
  );

  // Retomar: el último trabajo de este ámbito (también si sigue armándose: se sigue su progreso).
  useEffect(() => {
    if (!resume) return;
    const abort = new AbortController();
    controller.current = abort;
    void (async () => {
      const latest = await client.latest(scopeRef.current, { signal: abort.signal, locale });
      if (abort.signal.aborted || !alive.current) return;
      if (!latest.ok || !latest.data.latest) return setPhase("idle");
      let current = latest.data.latest;
      setJob(current);
      if (current.status === "ready") return setPhase("ready");
      if (!isActive(current)) return setPhase(current.status === "failed" ? "failed" : "idle");
      setPhase("working");
      for (let attempt = 0; attempt < MAX_POLLS && isActive(current); attempt += 1) {
        await wait(pollDelay(attempt));
        if (abort.signal.aborted || !alive.current) return;
        const next = await client.job(scopeRef.current, current.id, { signal: abort.signal, locale });
        if (!next.ok) return fail(next);
        current = next.data;
        setJob(current);
      }
      setPhase(current.status === "ready" ? "ready" : current.status === "failed" ? "failed" : "idle");
    })();
    return () => abort.abort();
    // el ámbito es la identidad de la lectura: al cambiar de hogar se vuelve a leer
  }, [scopeId, scope.kind, resume, locale, fail]);

  const start = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setPhase("working");
    setError(null);
    setOutcome(null);
    const result = await runExport(client, scopeRef.current, { wait, onProgress: (next) => alive.current && setJob(next), locale, signal: abort.signal });
    if (!alive.current || abort.signal.aborted) return;
    if (!result.ok) {
      setOutcome(result.outcome);
      if (result.outcome === "cancelled") return setPhase("idle");
      setError(result.outcome === "failed" ? dict.fin.export.failed : result.code === "throttled" || result.code === "http_429" ? dict.fin.errors.tooMany ?? dict.fin.errors.generic : dict.fin.export.error);
      return setPhase("failed");
    }
    setJob(result.job);
    setPhase("ready");
    if (auto && canDownload(result.job)) await save(result.job.download_url);
  }, [auto, dict, locale, save]);

  const download = useCallback(async () => {
    if (!job) return;
    // El enlace vale 15 minutos y una vez: se pide uno nuevo justo antes de bajar.
    const fresh = await client.job(scopeRef.current, job.id, { locale });
    if (!alive.current) return;
    if (!fresh.ok) return fail(fresh);
    setJob(fresh.data);
    if (!canDownload(fresh.data)) return setPhase("idle");
    await save(fresh.data.download_url);
  }, [fail, job, locale, save]);

  return { phase, job, error, outcome, start, download };
}
