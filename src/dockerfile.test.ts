import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// La imagen no se puede construir en toda máquina (Docker); estas comprobaciones fijan lo que el contrato con el
// despliegue del CV exige y que `docker build` no verificaría hasta tarde.
const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
const dockerfile = read("Dockerfile");

describe("Dockerfile", () => {
  it("puerto 3100, HOSTNAME 0.0.0.0, no root", () => {
    expect(dockerfile).toMatch(/PORT=3100/);
    expect(dockerfile).toMatch(/HOSTNAME=0\.0\.0\.0/);
    expect(dockerfile).toMatch(/EXPOSE 3100/);
    expect(dockerfile).toMatch(/^USER node$/m);
  });
  it("sirve la salida standalone", () => {
    expect(dockerfile).toMatch(/\.next\/standalone/);
    expect(dockerfile).toMatch(/CMD \["node", "server\.js"\]/);
  });
  it("la salud pide /_fms/healthz en el puerto 3100", () => {
    expect(dockerfile).toMatch(/HEALTHCHECK[\s\S]*127\.0\.0\.1:3100\/_fms\/healthz/);
  });
  it("SITE_URL no se fija al construir (las páginas lo leen al arrancar)", () => {
    expect(dockerfile).not.toMatch(/^\s*(ARG|ENV)\s+SITE_URL/m);
  });
  it("la base va por resumen (digest) y las dependencias con npm ci", () => {
    expect(dockerfile).toMatch(/^ARG NODE_IMAGE=node:22-[a-z-]+@sha256:[0-9a-f]{64}$/m);
    expect(dockerfile).toMatch(/npm ci/);
  });
  it("ningún secreto en la imagen", () => {
    expect(dockerfile).not.toMatch(/\b(SECRET|PASSWORD|TOKEN|API_KEY)\b\s*=/i);
  });
});

describe(".dockerignore", () => {
  it("deja fuera secretos, git y dependencias locales", () => {
    const lines = read(".dockerignore").split("\n");
    for (const entry of [".env", ".git/", "node_modules/", ".next/"]) expect(lines).toContain(entry);
  });
});
