/**
 * Un `fetch` simulado para las pruebas (sin MSW: la API tiene tres rutas). Se registra una respuesta por «MÉTODO ruta»;
 * lo que no esté registrado responde 404 y queda anotado, para que una prueba vea si algo se pidió de más.
 */
export interface RecordedRequest {
  method: string;
  url: string;
  headers: Headers;
  body: unknown;
  credentials?: RequestCredentials;
  cache?: RequestCache;
}

export type MockReply = { status: number; json?: unknown; body?: string } | (() => { status: number; json?: unknown; body?: string });

export function mockFetch(routes: Record<string, MockReply>) {
  const calls: RecordedRequest[] = [];
  const impl = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const method = (init.method ?? "GET").toUpperCase();
    const url = String(input);
    calls.push({
      method,
      url,
      headers: new Headers(init.headers),
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
      credentials: init.credentials,
      cache: init.cache,
    });
    const route = routes[`${method} ${url}`];
    if (!route) return new Response(JSON.stringify({ code: "not_mocked" }), { status: 404, headers: { "Content-Type": "application/json" } });
    const reply = typeof route === "function" ? route() : route;
    if (reply.status === 204) return new Response(null, { status: 204 });
    return new Response(reply.body ?? JSON.stringify(reply.json ?? {}), { status: reply.status, headers: { "Content-Type": "application/json" } });
  };
  return { fetch: impl as typeof fetch, calls };
}
