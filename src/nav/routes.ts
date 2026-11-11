/**
 * Árbol de navegación y tabla de rutas (docs/design-spec.md §1). Una sola fuente para la barra inferior, la barra
 * lateral, la hoja «Más», el buscador de pantallas y las pantallas de relleno de FMS-0.
 *
 * Las rutas son las del diseño §1.4, SIN el prefijo `/finanzas` (lo pone `basePath`; `next/link` y `usePathname` ya
 * lo manejan). Sin montos ni datos en la URL: la ruta de alta no admite `?monto=` (AGENTS.md: nada de montos en URLs).
 */

export type SectionId = "resumen" | "movimientos" | "cuentas" | "pagos" | "creditos" | "plan" | "informes" | "config";

export interface NavItem {
  id: string;
  /** Ruta con consulta opcional (`/movimientos?tipo=egreso`). */
  href: string;
}

export interface NavSection {
  id: SectionId;
  /** Nombre del icono (`src/ui/icons.tsx`). */
  icon: string;
  href: string;
  items: NavItem[];
}

/** Los nombres y el orden son los del propietario (§1.1). */
export const SECTIONS: readonly NavSection[] = [
  { id: "resumen", icon: "home", href: "/", items: [] },
  {
    id: "movimientos",
    icon: "list",
    href: "/movimientos",
    items: [
      { id: "ingresos", href: "/movimientos?tipo=ingreso" },
      { id: "egresos", href: "/movimientos?tipo=egreso" },
      { id: "transferencias", href: "/movimientos?tipo=transferencia" },
      { id: "historial", href: "/movimientos" },
      { id: "compartidos", href: "/movimientos/compartidos" },
    ],
  },
  {
    id: "cuentas",
    icon: "bank",
    href: "/cuentas",
    items: [
      { id: "bancos", href: "/cuentas?tipo=banco" },
      { id: "efectivo", href: "/cuentas?tipo=efectivo" },
      { id: "debito", href: "/cuentas?tipo=debito" },
      { id: "credito", href: "/cuentas?tipo=credito" },
      { id: "importar", href: "/cuentas/importar" },
    ],
  },
  {
    id: "pagos",
    icon: "calendar-check",
    href: "/pagos",
    items: [
      { id: "suscripciones", href: "/pagos/suscripciones" },
      { id: "fijos", href: "/pagos/fijos" },
      { id: "calendario", href: "/pagos/calendario" },
    ],
  },
  {
    id: "creditos",
    icon: "loan",
    href: "/creditos",
    items: [
      { id: "prestamos", href: "/creditos" },
      { id: "cuotas", href: "/creditos?vista=cuotas" },
      { id: "intereses", href: "/creditos?vista=intereses" },
      { id: "amortizaciones", href: "/creditos/simuladores/amortizacion" },
      { id: "deudas", href: "/creditos/deudas-personales" },
    ],
  },
  {
    id: "plan",
    icon: "target",
    href: "/plan/presupuestos",
    items: [
      { id: "presupuestos", href: "/plan/presupuestos" },
      { id: "ahorro", href: "/plan/metas?tipo=ahorro" },
      { id: "objetivos", href: "/plan/metas?tipo=objetivo" },
    ],
  },
  {
    id: "informes",
    icon: "chart",
    href: "/informes",
    items: [
      { id: "estadisticas", href: "/informes" },
      { id: "proyecciones", href: "/informes/proyecciones" },
      { id: "patrimonio", href: "/informes/patrimonio" },
    ],
  },
  {
    id: "config",
    icon: "gear",
    href: "/config/categorias",
    items: [
      { id: "categorias", href: "/config/categorias" },
      { id: "etiquetas", href: "/config/etiquetas" },
      { id: "instituciones", href: "/config/instituciones" },
      { id: "monedas", href: "/config/monedas" },
      { id: "reglas", href: "/config/reglas" },
      { id: "parametros", href: "/config/parametros" },
      { id: "auditoria", href: "/config/auditoria" },
    ],
  },
];

/** Fuera del árbol, en la cabecera (§1.1). */
export const NOTIFICATIONS_HREF = "/notificaciones";
export const PROFILE_HREF = "/perfil";
export const NEW_MOVEMENT_HREF = "/movimientos/nuevo";

export const SIMULATORS = ["amortizacion", "tasas", "abono-extra", "comparar", "compra-tarjeta"] as const;
export const CONFIG_SCREENS = ["categorias", "etiquetas", "instituciones", "monedas", "reglas", "parametros", "auditoria"] as const;

type RouteDef = { id: string; pattern: string; section: SectionId | null };

const STATIC_ROUTES = [
  { id: "resumen", pattern: "/", section: "resumen" },
  { id: "movimientos", pattern: "/movimientos", section: "movimientos" },
  { id: "movimiento-nuevo", pattern: "/movimientos/nuevo", section: "movimientos" },
  { id: "compartidos", pattern: "/movimientos/compartidos", section: "movimientos" },
  { id: "compartidos-persona", pattern: "/movimientos/compartidos/[persona]", section: "movimientos" },
  { id: "movimiento", pattern: "/movimientos/[id]", section: "movimientos" },
  { id: "movimiento-asientos", pattern: "/movimientos/[id]/asientos", section: "movimientos" },
  { id: "movimiento-historial", pattern: "/movimientos/[id]/historial", section: "movimientos" },
  { id: "cuentas", pattern: "/cuentas", section: "cuentas" },
  { id: "cuentas-importar", pattern: "/cuentas/importar", section: "cuentas" },
  { id: "cuenta", pattern: "/cuentas/[id]", section: "cuentas" },
  { id: "cuenta-conciliar", pattern: "/cuentas/[id]/conciliar", section: "cuentas" },
  { id: "tarjeta", pattern: "/tarjetas/[id]", section: "cuentas" },
  { id: "tarjeta-extracto", pattern: "/tarjetas/[id]/extractos/[periodo]", section: "cuentas" },
  { id: "tarjeta-pagar", pattern: "/tarjetas/[id]/pagar", section: "cuentas" },
  { id: "tarjeta-simular", pattern: "/tarjetas/[id]/simular", section: "cuentas" },
  { id: "pagos", pattern: "/pagos", section: "pagos" },
  { id: "pagos-fijos", pattern: "/pagos/fijos", section: "pagos" },
  { id: "pagos-fijo-pagar", pattern: "/pagos/fijos/[id]/pagar", section: "pagos" },
  { id: "pagos-suscripciones", pattern: "/pagos/suscripciones", section: "pagos" },
  { id: "pagos-recurrencia-nueva", pattern: "/pagos/recurrencias/nueva", section: "pagos" },
  { id: "pagos-recurrencia", pattern: "/pagos/recurrencias/[id]", section: "pagos" },
  { id: "pagos-calendario", pattern: "/pagos/calendario", section: "pagos" },
  { id: "creditos", pattern: "/creditos", section: "creditos" },
  { id: "creditos-deudas", pattern: "/creditos/deudas-personales", section: "creditos" },
  { id: "credito", pattern: "/creditos/[id]", section: "creditos" },
  { id: "credito-tabla", pattern: "/creditos/[id]/tabla", section: "creditos" },
  { id: "plan-presupuestos", pattern: "/plan/presupuestos", section: "plan" },
  { id: "plan-presupuesto", pattern: "/plan/presupuestos/[id]", section: "plan" },
  { id: "plan-metas", pattern: "/plan/metas", section: "plan" },
  { id: "plan-meta", pattern: "/plan/metas/[id]", section: "plan" },
  { id: "plan-indicadores", pattern: "/plan/indicadores", section: "plan" },
  { id: "informes", pattern: "/informes", section: "informes" },
  { id: "informes-proyecciones", pattern: "/informes/proyecciones", section: "informes" },
  { id: "informes-comparar", pattern: "/informes/proyecciones/comparar", section: "informes" },
  { id: "informes-independencia", pattern: "/informes/proyecciones/independencia", section: "informes" },
  { id: "informes-patrimonio", pattern: "/informes/patrimonio", section: "informes" },
  { id: "informes-activo", pattern: "/informes/patrimonio/activos/[id]", section: "informes" },
  { id: "informe", pattern: "/informes/[informe]", section: "informes" },
  { id: "notificaciones", pattern: "/notificaciones", section: null },
  { id: "perfil", pattern: "/perfil", section: null },
  { id: "bienvenida", pattern: "/bienvenida/[1|2|3|4|5]", section: null },
] as const satisfies readonly RouteDef[];

type SimulatorId = `simulador-${(typeof SIMULATORS)[number]}`;
type ConfigId = `config-${(typeof CONFIG_SCREENS)[number]}`;
export type RouteId = (typeof STATIC_ROUTES)[number]["id"] | SimulatorId | ConfigId;

export interface Route {
  id: RouteId;
  pattern: string;
  /** `null` para lo que cuelga de la cabecera (notificaciones, perfil, primer uso). */
  section: SectionId | null;
}

export const ROUTES: readonly Route[] = [
  ...(STATIC_ROUTES as readonly Route[]),
  ...SIMULATORS.map((slug): Route => ({ id: `simulador-${slug}`, pattern: `/creditos/simuladores/${slug}`, section: "creditos" })),
  ...CONFIG_SCREENS.map((slug): Route => ({ id: `config-${slug}`, pattern: `/config/${slug}`, section: "config" })),
];

const SLUG = /^[A-Za-z0-9_-]{1,64}$/;
const PERIOD = /^(?:\d{4}-(?:0[1-9]|1[0-2])|actual)$/;

function segmentMatches(pattern: string, value: string): { dynamic: boolean; ok: boolean } {
  if (!pattern.startsWith("[")) return { dynamic: false, ok: pattern === value };
  const inner = pattern.slice(1, -1);
  if (inner.includes("|")) return { dynamic: true, ok: inner.split("|").includes(value) };
  return { dynamic: true, ok: inner === "periodo" ? PERIOD.test(value) : SLUG.test(value) };
}

export interface RouteMatch {
  route: Route;
  /** Los segmentos que salieron de `[...]`, en orden (para el detalle de una pantalla). */
  params: string[];
}

/** La ruta de una URL (sin prefijo ni consulta). Gana la de menos segmentos dinámicos: `/movimientos/nuevo` no es un `[id]`. */
export function matchRoute(pathname: string): RouteMatch | null {
  const segments = pathname.split("/").filter(Boolean);
  let best: { route: Route; params: string[]; dynamic: number } | null = null;
  for (const route of ROUTES) {
    const parts = route.pattern.split("/").filter(Boolean);
    if (parts.length !== segments.length) continue;
    let dynamic = 0;
    const params: string[] = [];
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      const result = segmentMatches(parts[i], segments[i]);
      if (!result.ok) {
        ok = false;
        break;
      }
      if (result.dynamic) {
        dynamic++;
        params.push(segments[i]);
      }
    }
    if (ok && (best === null || dynamic < best.dynamic)) best = { route, params, dynamic };
  }
  return best && { route: best.route, params: best.params };
}

export function sectionOf(pathname: string): SectionId | null {
  return matchRoute(pathname)?.route.section ?? null;
}

/**
 * ¿Está activo un subelemento? Misma ruta y, si el subelemento trae consulta, la misma consulta (`?tipo=egreso`); sin
 * consulta (Historial) solo cuando la URL no filtra por `tipo`.
 */
export function isItemActive(item: NavItem, pathname: string, search: URLSearchParams): boolean {
  const [path, query = ""] = item.href.split("?");
  if (path !== pathname) return false;
  const wanted = new URLSearchParams(query);
  if ([...wanted.keys()].length === 0) {
    // Hermanos con consulta en la misma ruta: este es el «sin filtro».
    return !["tipo", "vista"].some((key) => search.has(key));
  }
  return [...wanted].every(([key, value]) => search.get(key) === value);
}

/** La sección está activa en cualquier ruta suya; `Resumen` solo en `/`. */
export function isSectionActive(section: NavSection, pathname: string): boolean {
  return section.id === "resumen" ? pathname === "/" : sectionOf(pathname) === section.id;
}
