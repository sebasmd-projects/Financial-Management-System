import { describe, expect, it, vi } from "vitest";
import type { ApiResult, RequestOptions } from "./api/client";
import { MAX_POLLS, canDownload, downloadPath, exportApi, exportFileName, exportPaths, isActive, isFinished, outcomeOf, percent, pollDelay, runExport, stepOf, type ExportClient, type ExportJob } from "./export";

const JOB: ExportJob = {
  id: "j1",
  household_id: null,
  status: "pending",
  progress: 0,
  step: "",
  error_code: "",
  created_at: "2026-11-16T10:00:00Z",
  finished_at: null,
  expires_at: null,
  size: 0,
  download_url: null,
  download_expires_at: null,
};
const READY: ExportJob = { ...JOB, status: "ready", progress: 100, step: "done", size: 2048, download_url: "/api/fms/v1/me/export/j1/download?t=abc", download_expires_at: "2026-11-16T10:20:00Z" };
const ok = <T,>(data: T, status = 200): ApiResult<T> => ({ ok: true, status, data });
const fail = (status: number, code: string): Extract<ApiResult<never>, { ok: false }> => ({ ok: false, status, code, data: undefined });

describe("rutas y estados", () => {
  it("personal y hogar cuelgan de rutas distintas y el id va codificado", () => {
    expect(exportPaths.root({ kind: "personal" })).toBe("/me/export");
    expect(exportPaths.root({ kind: "household", id: "h 1" })).toBe("/households/h%201/export");
    expect(exportPaths.job({ kind: "personal" }, "j/1")).toBe("/me/export/j%2F1");
  });
  it("distingue lo que se arma, lo que se puede bajar y lo que ya no existe", () => {
    expect(isActive(JOB)).toBe(true);
    expect(isActive({ status: "running" })).toBe(true);
    expect(isActive(READY)).toBe(false);
    expect(canDownload(READY)).toBe(true);
    expect(canDownload({ ...READY, download_url: null })).toBe(false);
    expect(canDownload({ ...READY, status: "downloaded" })).toBe(false);
    expect(isFinished({ status: "downloaded" })).toBe(true);
    expect(isFinished({ status: "expired" })).toBe(true);
    expect(isFinished({ status: "failed" })).toBe(true);
    expect(isFinished(READY)).toBe(false);
  });
  it("el sondeo se espacía pero tiene techo, y el progreso y el paso aguantan valores raros", () => {
    expect(pollDelay(0)).toBe(1000);
    expect(pollDelay(4)).toBe(3000);
    expect(pollDelay(1000)).toBe(5000);
    expect(pollDelay(-3)).toBe(1000);
    expect(percent({ progress: 140 })).toBe(100);
    expect(percent({ progress: -5 })).toBe(0);
    expect(percent({ progress: Number.NaN })).toBe(0);
    expect(stepOf({ step: "packing" })).toBe("packing");
    expect(stepOf({ step: "otra-cosa" })).toBe("collecting");
  });
  it("solo acepta enlaces de esta API y los deja sin el prefijo", () => {
    expect(downloadPath("/api/fms/v1/me/export/j1/download?t=abc")).toBe("/me/export/j1/download?t=abc");
    expect(downloadPath("https://malo.example/api/fms/v1/x")).toBeNull();
    expect(downloadPath("/api/fms/v1//evil.example/x")).toBeNull();
    expect(downloadPath("/api/fms/v1/../admin")).toBeNull();
    expect(downloadPath("/otra/ruta")).toBeNull();
  });
  it("el nombre del archivo lleva la fecha y distingue el hogar", () => {
    expect(exportFileName({ kind: "personal" }, "2026-11-16")).toBe("finanzas-2026-11-16.zip");
    expect(exportFileName({ kind: "household", id: "h" }, "2026-11-16")).toBe("finanzas-hogar-2026-11-16.zip");
  });
  it("traduce el fallo a lo que la interfaz cuenta", () => {
    expect(outcomeOf(fail(410, "link_used_or_expired"))).toBe("link_used");
    expect(outcomeOf(fail(403, "reauthentication_required"))).toBe("cancelled");
    expect(outcomeOf(fail(429, "throttled"))).toBe("error");
  });
});

function fakeClient() {
  const calls: { method: string; path: string; options?: RequestOptions }[] = [];
  const queue: Record<string, ApiResult<unknown>[]> = {};
  const client: ExportClient = {
    get: async <T,>(path: string, options?: RequestOptions) => {
      calls.push({ method: "GET", path, options });
      return (queue[`GET ${path}`]?.shift() ?? fail(404, "not_mocked")) as ApiResult<T>;
    },
    post: async <T,>(path: string, _body?: unknown, options?: RequestOptions) => {
      calls.push({ method: "POST", path, options });
      return (queue[`POST ${path}`]?.shift() ?? fail(404, "not_mocked")) as ApiResult<T>;
    },
  };
  return { client, calls, on: (key: string, ...replies: ApiResult<unknown>[]) => void (queue[key] = replies) };
}

describe("el cliente", () => {
  it("todas las rutas van sin reescribir (lo personal no se manda al hogar activo) y la descarga pide un Blob", async () => {
    const { client, calls, on } = fakeClient();
    on("POST /me/export", ok(JOB, 201));
    on("GET /me/export", ok({ latest: null }));
    on("GET /me/export/j1", ok(READY));
    on("GET /me/export/j1/download?t=abc", ok(new Blob(["zip"])));
    const api = exportApi(client);
    await api.start({ kind: "personal" });
    await api.latest({ kind: "personal" });
    await api.job({ kind: "personal" }, "j1");
    const got = await api.download(READY.download_url as string);
    expect(got.ok).toBe(true);
    expect(calls.every((c) => c.options?.unscoped === true)).toBe(true);
    expect(calls.at(-1)?.options?.asBlob).toBe(true);
  });
  it("no pide un enlace que no sea de esta API", async () => {
    const { client, calls } = fakeClient();
    const got = await exportApi(client).download("https://malo.example/x");
    expect(got).toMatchObject({ ok: false, code: "invalid_link" });
    expect(calls).toEqual([]);
  });
});

describe("pedir y esperar", () => {
  it("sondea hasta que está listo y avisa del progreso", async () => {
    const { client, on, calls } = fakeClient();
    on("POST /me/export", ok(JOB, 201));
    on("GET /me/export/j1", ok({ ...JOB, status: "running", progress: 40, step: "files" }), ok(READY));
    const seen: number[] = [];
    const wait = vi.fn(async (ms: number) => void ms);
    const result = await runExport(exportApi(client), { kind: "personal" }, { wait, onProgress: (job) => seen.push(job.progress) });
    expect(result).toEqual({ ok: true, job: READY });
    expect(seen).toEqual([0, 40, 100]);
    expect(wait.mock.calls.map((c) => c[0])).toEqual([1000, 1500]);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });
  it("si el servidor ya lo devolvió listo no espera nada", async () => {
    const { client, on } = fakeClient();
    on("POST /me/export", ok(READY, 201));
    const wait = vi.fn(async () => undefined);
    expect(await runExport(exportApi(client), { kind: "personal" }, { wait })).toEqual({ ok: true, job: READY });
    expect(wait).not.toHaveBeenCalled();
  });
  it("un trabajo que falló en el servidor dice por qué, sin contenido", async () => {
    const { client, on } = fakeClient();
    on("POST /households/h1/export", ok({ ...JOB, status: "pending" }, 201));
    on("GET /households/h1/export/j1", ok({ ...JOB, status: "failed", error_code: "not_a_member" }));
    const result = await runExport(exportApi(client), { kind: "household", id: "h1" }, { wait: async () => undefined });
    expect(result).toEqual({ ok: false, outcome: "failed", code: "not_a_member" });
  });
  it("el cupo diario y la reautenticación cancelada se distinguen y no se reintenta el POST", async () => {
    const throttled = fakeClient();
    throttled.on("POST /me/export", fail(429, "throttled"), ok(READY, 201));
    expect(await runExport(exportApi(throttled.client), { kind: "personal" }, { wait: async () => undefined })).toEqual({ ok: false, outcome: "error", code: "throttled" });
    expect(throttled.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    const stale = fakeClient();
    stale.on("POST /me/export", fail(403, "reauthentication_required"));
    expect(await runExport(exportApi(stale.client), { kind: "personal" }, { wait: async () => undefined })).toMatchObject({ ok: false, outcome: "cancelled" });
  });
  it("tiene un tope de sondeos y no espera para siempre", async () => {
    const { client, on, calls } = fakeClient();
    on("POST /me/export", ok(JOB, 201));
    on("GET /me/export/j1", ...Array.from({ length: MAX_POLLS + 5 }, () => ok({ ...JOB, status: "running" as const })));
    const result = await runExport(exportApi(client), { kind: "personal" }, { wait: async () => undefined });
    expect(result).toEqual({ ok: false, outcome: "error", code: "timeout" });
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(MAX_POLLS);
  });
  it("cancelar (desmontar) corta el sondeo", async () => {
    const { client, on, calls } = fakeClient();
    on("POST /me/export", ok(JOB, 201));
    const controller = new AbortController();
    const result = await runExport(exportApi(client), { kind: "personal" }, { wait: async () => controller.abort(), signal: controller.signal });
    expect(result).toMatchObject({ ok: false, outcome: "cancelled" });
    expect(calls.filter((c) => c.method === "GET")).toEqual([]);
  });
});
