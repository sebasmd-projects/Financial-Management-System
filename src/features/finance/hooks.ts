"use client";

/**
 * Datos y acciones de las pantallas financieras. Todo en MEMORIA del componente: ni `localStorage`, ni caché del navegador
 * (regla del propietario). Sin biblioteca de datos: una lectura (`useResource`) y una escritura (`useSubmit`) bastan.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api";
import type { ApiResult } from "@/api/client";
import { errorText } from "@/api/errors";
import { createIntentKeys } from "@/api/idempotency";
import type { Page } from "@/api/models";
import { useI18n } from "@/i18n/provider";
import { fmsHref, type RouteId } from "@/nav/routes";

type Failure = Extract<ApiResult<unknown>, { ok: false }>;

export interface Resource<T> {
  /** Sin respuesta todavía para esta ruta. */
  loading: boolean;
  /** El último dato bueno (puede ser de la ruta anterior mientras llega la nueva: `loading` lo dice). */
  data: T | null;
  /** La última petición falló. */
  failure: Failure | null;
  reload: () => void;
}

/** GET de una ruta de la API (`null` = no pedir). Cancela al desmontar o al cambiar de ruta. */
export function useResource<T>(path: string | null, options: { unscoped?: boolean } = {}): Resource<T> {
  const unscoped = options.unscoped === true;
  const [nonce, setNonce] = useState(0);
  const [done, setDone] = useState<{ key: string; result: ApiResult<T> } | null>(null);
  const [last, setLast] = useState<T | null>(null);
  const key = `${path}#${nonce}`;

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    void api.get<T>(path, { signal: controller.signal, unscoped }).then((result) => {
      if (controller.signal.aborted) return;
      setDone({ key, result });
      if (result.ok) setLast(result.data);
    });
    return () => controller.abort();
  }, [path, key, unscoped]);

  const current = path !== null && done?.key === key ? done.result : null;
  return {
    loading: path !== null && current === null,
    data: current?.ok ? current.data : last,
    failure: current && !current.ok ? current : null,
    reload: useCallback(() => setNonce((n) => n + 1), []),
  };
}

/**
 * Una LECTURA por POST (`reports/{clave}/query`, `movements/search`): los filtros van en el cuerpo, nunca en la URL (regla del
 * propietario). No escribe nada, así que no lleva `Idempotency-Key`. `null` = no pedir. Cancela al desmontar o al cambiar el cuerpo.
 */
export function useQuery<T>(path: string, body: unknown | null): Resource<T> {
  const [nonce, setNonce] = useState(0);
  const [done, setDone] = useState<{ key: string; result: ApiResult<T> } | null>(null);
  const [last, setLast] = useState<T | null>(null);
  const text = body === null ? null : JSON.stringify(body);
  const key = `${path}#${text}#${nonce}`;
  useEffect(() => {
    if (text === null) return;
    const controller = new AbortController();
    void api.post<T>(path, JSON.parse(text) as unknown, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setDone({ key, result });
      if (result.ok) setLast(result.data);
    });
    return () => controller.abort();
  }, [path, text, key]);
  const current = text !== null && done?.key === key ? done.result : null;
  return {
    loading: text !== null && current === null,
    data: current?.ok ? current.data : last,
    failure: current && !current.ok ? current : null,
    reload: useCallback(() => setNonce((n) => n + 1), []),
  };
}

/** Una lista paginada: los resultados de la página pedida. */
export function useList<T>(path: string | null): Resource<Page<T>> & { items: T[] } {
  const resource = useResource<Page<T>>(path);
  return { ...resource, items: resource.data?.results ?? [] };
}

export interface Submit {
  pending: boolean;
  /** Texto del último fallo (ya localizado), o `null`. */
  error: string | null;
  /** `code` de la API del último fallo (p. ej. `too_many_decimals`), para mostrarlo en el campo que corresponde. */
  errorCode: string | null;
  clearError: () => void;
  /**
   * Ejecuta una escritura. `fingerprint` identifica la intención (el cuerpo): mientras sea el mismo y la acción no haya tenido
   * éxito, `call` recibe SIEMPRE la misma `Idempotency-Key` (un reintento no duplica nada).
   */
  run: <T>(fingerprint: unknown, call: (idempotencyKey: string) => Promise<ApiResult<T>>) => Promise<{ ok: true; data: T } | { ok: false }>;
}

export function useSubmit(): Submit {
  const { dict } = useI18n();
  const keys = useRef(createIntentKeys());
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const run = useCallback<Submit["run"]>(
    async (fingerprint, call) => {
      if (busy.current) return { ok: false };
      busy.current = true;
      setPending(true);
      setError(null);
      setErrorCode(null);
      try {
        const result = await call(keys.current.keyFor(JSON.stringify(fingerprint)));
        if (result.ok) {
          keys.current.done();
          return { ok: true, data: result.data };
        }
        setError(errorText(result, dict.fin.errors));
        setErrorCode(result.code);
        return { ok: false };
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [dict],
  );

  return { pending, error, errorCode, clearError: useCallback(() => { setError(null); setErrorCode(null); }, []), run };
}

const MAX_PAGES = 50;

/** Todas las páginas de una lista (para selectores y catálogos). Cancela al desmontar. */
export function useAll<T>(path: string | null, options: { unscoped?: boolean } = {}): Resource<T[]> & { items: T[] } {
  const unscoped = options.unscoped === true;
  const [nonce, setNonce] = useState(0);
  const [done, setDone] = useState<{ key: string; failure: Failure | null; items: T[] } | null>(null);
  const [last, setLast] = useState<T[] | null>(null);
  const key = `${path}#${nonce}`;

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    void (async () => {
      const items: T[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const url = page === 1 ? path : `${path}${path.includes("?") ? "&" : "?"}page=${page}`;
        const result = await api.get<Page<T>>(url, { signal: controller.signal, unscoped });
        if (controller.signal.aborted) return;
        if (!result.ok) {
          setDone({ key, failure: result, items: [] });
          return;
        }
        items.push(...result.data.results);
        if (result.data.results.length === 0 || items.length >= result.data.count) break;
      }
      setDone({ key, failure: null, items });
      setLast(items);
    })();
    return () => controller.abort();
  }, [path, key, unscoped]);

  const current = path !== null && done?.key === key ? done : null;
  const data = current && !current.failure ? current.items : last;
  return {
    loading: path !== null && current === null,
    data,
    items: data ?? [],
    failure: current?.failure ?? null,
    reload: useCallback(() => setNonce((n) => n + 1), []),
  };
}

/** `href(id, params)`: la URL de una pantalla en el idioma actual (tabla de rutas de `nav/routes.ts`). */
export function useHref() {
  const { locale } = useI18n();
  return useCallback((id: RouteId, params: readonly string[] = []) => fmsHref(locale, id, params), [locale]);
}
