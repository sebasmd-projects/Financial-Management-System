// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act } from "react";
import type { RateConvention } from "@/api/models";
import { en } from "@/i18n/dictionaries/en";
import { es } from "@/i18n/dictionaries/es";
import { byText, click, mountScreen, typeInto, wait, type Mounted } from "@/test/render";
import { RATE_CONVENTIONS, ConventionSelect } from "./conventions";
import { AmountField, Checkbox, HelpTip, TextField } from "./kit";
import { LoansScreen } from "./loans/loans-screen";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }), usePathname: () => "/es/finanzas" }));

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.unstubAllGlobals();
});

function Amount({ initial = "", optional = false }: { initial?: string; optional?: boolean }) {
  const [value, setValue] = useState(initial);
  return <AmountField label="Lo que ya debes" value={value} onChange={setValue} required={!optional} />;
}
const preview = (m: Mounted) => m.host.querySelector('[data-testid="amount-preview"]')?.textContent ?? null;

describe("AmountField: vista previa en vivo, sin que el formulario la pida", () => {
  it("muestra el monto formateado mientras se escribe, con los decimales tal como se escribieron", async () => {
    mounted = await mountScreen(<Amount optional />, {});
    const input = mounted.host.querySelector("input")!;
    typeInto(input, "1000000");
    expect(preview(mounted)).toBe("$1.000.000");
    typeInto(input, "1.234.567,50");
    expect(preview(mounted)).toBe("$1.234.567,50");
    typeInto(input, "21704,98");
    expect(preview(mounted)).toBe("$21.704,98");
  });

  it("un campo opcional vacío no muestra nada, ni con texto inválido ni con demasiados decimales", async () => {
    mounted = await mountScreen(<Amount optional />, {});
    const input = mounted.host.querySelector("input")!;
    expect(preview(mounted)).toBeNull();
    typeInto(input, "abc");
    expect(preview(mounted)).toBeNull();
    typeInto(input, "1,2345");
    expect(preview(mounted)).toBeNull();
    expect(mounted.text()).toContain("2 decimales");
    typeInto(input, "");
    expect(preview(mounted)).toBeNull();
  });

  it("se anuncia con aria-live y el monto en inglés usa el mismo formato de pesos", async () => {
    mounted = await mountScreen(<Amount initial="450000" />, {}, "en");
    const node = mounted.host.querySelector('[data-testid="amount-preview"]')!;
    expect(node.getAttribute("aria-live")).toBe("polite");
    expect(node.textContent).toBe("$450.000");
  });
});

describe("HelpTip «(?)»", () => {
  const TEXT = "Día del mes en que vence el pago del extracto.";
  it("es un botón con nombre, estado y relación con el texto; abre y cierra con el teclado y el toque, y Esc lo cierra", async () => {
    mounted = await mountScreen(<TextField label="Día de pago" help={TEXT} value="" onChange={() => undefined} />, {});
    const button = mounted.host.querySelector<HTMLButtonElement>("button.help-tip__button")!;
    expect(button.tagName).toBe("BUTTON");
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Ayuda sobre: Día de pago");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(mounted.host.querySelector('[role="note"]')).toBeNull();
    // Un botón nativo se activa con Enter, espacio y toque: todos terminan en `click`.
    click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const note = mounted.host.querySelector('[role="note"]')!;
    expect(note.textContent).toBe(TEXT);
    expect(button.getAttribute("aria-controls")).toBe(note.id);
    act(() => button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(mounted.host.querySelector('[role="note"]')).toBeNull();
    click(button);
    click(button);
    expect(mounted.host.querySelector('[role="note"]')).toBeNull();
  });

  it("no depende del cursor: sin :hover ni title, y el campo sigue asociado a su etiqueta", async () => {
    mounted = await mountScreen(<TextField label="Día de pago" help={TEXT} value="" onChange={() => undefined} />, {});
    expect(mounted.host.querySelector("[title]")).toBeNull();
    const label = mounted.host.querySelector("label")!;
    expect(label.textContent).toBe("Día de pago");
    expect(mounted.host.querySelector(`#${CSS.escape(label.htmlFor)}`)?.tagName).toBe("INPUT");
  });

  it("existe en inglés y en las casillas", async () => {
    mounted = await mountScreen(<Checkbox label="GMF exempt" help="GMF help" checked={false} onChange={() => undefined} />, {}, "en");
    expect(mounted.host.querySelector("button.help-tip__button")?.getAttribute("aria-label")).toBe("Help about: GMF exempt");
  });

  it("HelpTip suelto", async () => {
    mounted = await mountScreen(<HelpTip label="Cupo" text="Máximo que puedes deber." />, {});
    click(mounted.host.querySelector("button"));
    expect(mounted.text()).toContain("Máximo que puedes deber.");
  });
});

describe("textos de ayuda", () => {
  const KEYS = ["cutDay", "payDay", "limit", "rate", "convention", "handlingFee", "insurance", "term", "system", "uvr", "indexMargin", "gmfExempt", "antThreshold", "quietHours"] as const;
  it.each(KEYS)("%s tiene texto corto en español y en inglés", (key) => {
    for (const dict of [es, en]) {
      const text = dict.fin.help.texts[key];
      expect(text.length).toBeGreaterThan(40);
      expect(text.length).toBeLessThan(560);
    }
  });
  it("el día de pago explica el corrimiento al siguiente día hábil", () => {
    expect(es.fin.help.texts.payDay).toContain("siguiente día hábil");
    expect(en.fin.help.texts.payDay).toContain("next business day");
  });
});

describe("convenciones de tasa con nombre legible", () => {
  it("cada convención de la API tiene nombre completo y sigla, en español y en inglés", () => {
    for (const dict of [es, en]) {
      for (const code of RATE_CONVENTIONS) {
        const name = dict.fin.help.conventions[code];
        expect(name, code).toBeTruthy();
        expect(name).toContain(`(${code})`);
        expect(name.length).toBeGreaterThan(code.length + 5);
      }
      expect(Object.keys(dict.fin.help.conventions).sort()).toEqual([...RATE_CONVENTIONS].sort());
    }
    expect(es.fin.help.conventions.EA).toBe("Efectiva anual (EA)");
    expect(es.fin.help.conventions.EM).toBe("Efectiva mensual (EM)");
    expect(es.fin.help.conventions.NMV).toBe("Nominal mensual vencida (NMV)");
  });
  it("el selector muestra los nombres (no solo la sigla), conserva el código como valor y lleva ayuda", async () => {
    const seen: RateConvention[] = [];
    mounted = await mountScreen(<ConventionSelect label="Convención" value="EA" onChange={(v) => seen.push(v)} />, {});
    const options = [...mounted.host.querySelectorAll("option")].map((o) => [o.value, o.textContent]);
    expect(options).toContainEqual(["EA", "Efectiva anual (EA)"]);
    expect(options).toContainEqual(["NMV", "Nominal mensual vencida (NMV)"]);
    expect(options).toHaveLength(RATE_CONVENTIONS.length);
    expect(mounted.host.querySelector("button.help-tip__button")).toBeTruthy();
    typeInto(mounted.host.querySelector("select")!, "EM");
    expect(seen).toEqual(["EM"]);
  });
});

describe("Créditos: descubrir cómo agregar uno", () => {
  const empty = { "GET /api/fms/v1/loans?page_size=100": { status: 200, json: { count: 0, page: 1, page_size: 100, results: [] } } };
  it("el botón dice «Agregar crédito» y el vacío explica qué registrar, con el botón", async () => {
    mounted = await mountScreen(<LoansScreen />, empty);
    const buttons = [...mounted.host.querySelectorAll("button")].filter((b) => b.textContent?.includes("Agregar crédito"));
    expect(buttons.length).toBe(2);
    expect(mounted.text()).not.toContain("Agregar préstamo");
    expect(mounted.text()).toContain("Registra un crédito (de consumo, libre inversión, vehículo, hipotecario, UVR…) para ver sus cuotas e intereses");
    click(byText(mounted.host, "button", "Agregar crédito"));
    await wait();
    expect(document.querySelector("dialog")?.textContent).toContain("Crear crédito");
  });
  it("en inglés sigue siendo «Add loan»", async () => {
    mounted = await mountScreen(<LoansScreen />, empty, "en");
    expect(byText(mounted.host, "button", "Add loan")).toBeTruthy();
  });
});

describe("Cuentas › Crédito", () => {
  it("ofrece un acceso visible a «Agregar crédito» que lleva a Créditos", async () => {
    const { AccountsScreen } = await import("./accounts/accounts-screen");
    const none = { status: 200, json: { count: 0, page: 1, page_size: 100, results: [] } };
    mounted = await mountScreen(<AccountsScreen tab="credito" />, { "GET /api/fms/v1/accounts?page_size=100": none, "GET /api/fms/v1/cards?page_size=100": none });
    const link = byText<HTMLAnchorElement>(mounted.host, "a", "Agregar crédito");
    expect(link.getAttribute("href")).toMatch(/\/creditos$/);
    expect(mounted.text()).toContain("Se registra en Créditos");
  });
});
