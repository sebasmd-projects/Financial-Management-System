import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Los iconos de la pestaña (public/fms-icons): el mismo sello que la app Android (añil `--color-primary` con un disco blanco).
const read = (name: string) => readFileSync(fileURLToPath(new URL(`../../public/fms-icons/${name}`, import.meta.url)));

describe("iconos de la pestaña", () => {
  it("icon.svg es vectorial, con el añil de la marca y sin scripts", () => {
    const svg = read("icon.svg").toString("utf8");
    expect(svg).toMatch(/<svg [^>]*viewBox="0 0 64 64"/);
    expect(svg).toContain("#2f3eb8");
    expect(svg).not.toMatch(/<script|onload/i);
  });
  it("favicon.ico trae 16, 32 y 48 px", () => {
    const ico = read("favicon.ico");
    expect(ico.readUInt16LE(2)).toBe(1); // tipo icono
    const n = ico.readUInt16LE(4);
    const sizes = Array.from({ length: n }, (_, i) => ico[6 + 16 * i]);
    expect(sizes).toEqual([16, 32, 48]);
  });
  it("apple-icon.png es de 180×180 y opaco (sin canal alfa)", () => {
    const png = read("apple-icon.png");
    expect(png.readUInt32BE(16)).toBe(180);
    expect(png.readUInt32BE(20)).toBe(180);
    expect(png[25]).toBe(2); // tipo de color 2: RGB, sin alfa
  });
});
