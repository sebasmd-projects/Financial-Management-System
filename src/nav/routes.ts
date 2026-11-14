/**
 * Árbol de navegación y TABLA DE RUTAS: la única fuente de la que salen las URLs de cada pantalla en español y en
 * inglés (`/es/finanzas/movimientos` ⇄ `/en/finance/transactions`), la barra inferior, la lateral, la hoja «Más», el
 * buscador, los `hreflang` y el cambio de idioma.
 *
 * Cada ruta se escribe UNA vez con su patrón por idioma (sin el prefijo `/<idioma>/<raíz>`). Los segmentos `[id]` son
 * parámetros (los mismos en los dos idiomas); `[1|2|3]` es una lista cerrada. Sin montos ni datos en la URL.
 */
import type { Locale } from "@/i18n/config";
import { locales } from "@/i18n/config";
import { ROOT_SLUG, rootPath } from "@/config/paths";

export type SectionId = "resumen" | "movimientos" | "cuentas" | "pagos" | "creditos" | "plan" | "informes" | "config";

export const SIMULATORS = [
  { slug: "amortizacion", en: "amortization" },
  { slug: "tasas", en: "rates" },
  { slug: "abono-extra", en: "extra-payment" },
  { slug: "comparar", en: "compare" },
  { slug: "compra-tarjeta", en: "card-purchase" },
] as const;

export const CONFIG_SCREENS = [
  { slug: "categorias", en: "categories" },
  { slug: "etiquetas", en: "tags" },
  { slug: "instituciones", en: "institutions" },
  { slug: "monedas", en: "currencies" },
  { slug: "reglas", en: "rules" },
  { slug: "parametros", en: "parameters" },
  { slug: "auditoria", en: "audit" },
  { slug: "papelera", en: "trash" },
] as const;

type Def = { id: string; section: SectionId | null; es: string; en: string };

const STATIC_ROUTES = [
  { id: "resumen", section: "resumen", es: "/", en: "/" },
  { id: "movimientos", section: "movimientos", es: "/movimientos", en: "/transactions" },
  { id: "movimientos-ingresos", section: "movimientos", es: "/movimientos/ingresos", en: "/transactions/income" },
  { id: "movimientos-egresos", section: "movimientos", es: "/movimientos/egresos", en: "/transactions/expenses" },
  { id: "movimientos-transferencias", section: "movimientos", es: "/movimientos/transferencias", en: "/transactions/transfers" },
  { id: "movimientos-historial", section: "movimientos", es: "/movimientos/historial", en: "/transactions/history" },
  { id: "movimiento-nuevo", section: "movimientos", es: "/movimientos/nuevo", en: "/transactions/new" },
  { id: "compartidos", section: "movimientos", es: "/movimientos/compartidos", en: "/transactions/shared" },
  { id: "compartidos-persona", section: "movimientos", es: "/movimientos/compartidos/[persona]", en: "/transactions/shared/[persona]" },
  { id: "movimiento", section: "movimientos", es: "/movimientos/[id]", en: "/transactions/[id]" },
  { id: "movimiento-asientos", section: "movimientos", es: "/movimientos/[id]/asientos", en: "/transactions/[id]/entries" },
  { id: "movimiento-historial", section: "movimientos", es: "/movimientos/[id]/historial", en: "/transactions/[id]/history" },
  { id: "cuentas", section: "cuentas", es: "/cuentas", en: "/accounts" },
  { id: "cuentas-bancos", section: "cuentas", es: "/cuentas/bancos", en: "/accounts/banks" },
  { id: "cuentas-efectivo", section: "cuentas", es: "/cuentas/efectivo", en: "/accounts/cash" },
  { id: "cuentas-debito", section: "cuentas", es: "/cuentas/debito", en: "/accounts/debit" },
  { id: "cuentas-credito", section: "cuentas", es: "/cuentas/credito", en: "/accounts/credit" },
  { id: "extractos", section: "cuentas", es: "/cuentas/credito/extractos", en: "/accounts/credit/statements" },
  { id: "cuentas-importar", section: "cuentas", es: "/cuentas/importar", en: "/accounts/import" },
  { id: "cuenta", section: "cuentas", es: "/cuentas/[id]", en: "/accounts/[id]" },
  { id: "cuenta-conciliar", section: "cuentas", es: "/cuentas/[id]/conciliar", en: "/accounts/[id]/reconcile" },
  { id: "hogares", section: "cuentas", es: "/hogar", en: "/household" },
  { id: "hogar-invitaciones", section: "cuentas", es: "/hogar/invitaciones", en: "/household/invitations" },
  { id: "hogar", section: "cuentas", es: "/hogar/[id]", en: "/household/[id]" },
  { id: "tarjeta", section: "cuentas", es: "/tarjetas/[id]", en: "/cards/[id]" },
  { id: "tarjeta-extracto", section: "cuentas", es: "/tarjetas/[id]/extractos/[periodo]", en: "/cards/[id]/statements/[periodo]" },
  { id: "tarjeta-extractos", section: "cuentas", es: "/tarjetas/[id]/extractos", en: "/cards/[id]/statements" },
  { id: "tarjeta-tasas", section: "cuentas", es: "/tarjetas/[id]/tasas", en: "/cards/[id]/rates" },
  { id: "tarjeta-pagar", section: "cuentas", es: "/tarjetas/[id]/pagar", en: "/cards/[id]/pay" },
  { id: "tarjeta-simular", section: "cuentas", es: "/tarjetas/[id]/simular", en: "/cards/[id]/simulate" },
  { id: "pagos", section: "pagos", es: "/pagos", en: "/payments" },
  { id: "pagos-fijos", section: "pagos", es: "/pagos/fijos", en: "/payments/fixed" },
  { id: "pagos-fijo-pagar", section: "pagos", es: "/pagos/fijos/[id]/pagar", en: "/payments/fixed/[id]/pay" },
  { id: "pagos-suscripciones", section: "pagos", es: "/pagos/suscripciones", en: "/payments/subscriptions" },
  { id: "pagos-recurrencia-nueva", section: "pagos", es: "/pagos/recurrencias/nueva", en: "/payments/recurring/new" },
  { id: "pagos-recurrencia", section: "pagos", es: "/pagos/recurrencias/[id]", en: "/payments/recurring/[id]" },
  { id: "pagos-calendario", section: "pagos", es: "/pagos/calendario", en: "/payments/calendar" },
  { id: "creditos", section: "creditos", es: "/creditos", en: "/loans" },
  { id: "creditos-cuotas", section: "creditos", es: "/creditos/cuotas", en: "/loans/installments" },
  { id: "creditos-intereses", section: "creditos", es: "/creditos/intereses", en: "/loans/interest" },
  { id: "creditos-amortizaciones", section: "creditos", es: "/creditos/amortizaciones", en: "/loans/amortization" },
  { id: "creditos-deudas", section: "creditos", es: "/creditos/deudas-personales", en: "/loans/personal-debts" },
  { id: "credito", section: "creditos", es: "/creditos/[id]", en: "/loans/[id]" },
  { id: "credito-tabla", section: "creditos", es: "/creditos/[id]/tabla", en: "/loans/[id]/table" },
  { id: "plan-presupuestos", section: "plan", es: "/presupuestos", en: "/budgets" },
  { id: "plan-ahorro", section: "plan", es: "/presupuestos/ahorro", en: "/budgets/savings" },
  { id: "plan-objetivos", section: "plan", es: "/presupuestos/objetivos", en: "/budgets/goals" },
  { id: "plan-meta", section: "plan", es: "/presupuestos/objetivos/[id]", en: "/budgets/goals/[id]" },
  { id: "plan-indicadores", section: "plan", es: "/presupuestos/indicadores", en: "/budgets/indicators" },
  { id: "plan-presupuesto", section: "plan", es: "/presupuestos/[id]", en: "/budgets/[id]" },
  { id: "informes", section: "informes", es: "/informes", en: "/reports" },
  { id: "informes-estadisticas", section: "informes", es: "/informes/estadisticas", en: "/reports/statistics" },
  { id: "informes-proyecciones", section: "informes", es: "/informes/proyecciones", en: "/reports/projections" },
  { id: "informes-comparar", section: "informes", es: "/informes/proyecciones/comparar", en: "/reports/projections/compare" },
  { id: "informes-independencia", section: "informes", es: "/informes/proyecciones/independencia", en: "/reports/projections/independence" },
  { id: "informes-patrimonio", section: "informes", es: "/informes/patrimonio", en: "/reports/net-worth" },
  { id: "informes-activo", section: "informes", es: "/informes/patrimonio/activos/[id]", en: "/reports/net-worth/assets/[id]" },
  { id: "informe", section: "informes", es: "/informes/[informe]", en: "/reports/[informe]" },
  { id: "notificaciones", section: null, es: "/notificaciones", en: "/notifications" },
  { id: "perfil", section: null, es: "/perfil", en: "/profile" },
  { id: "bienvenida", section: null, es: "/bienvenida/[1|2|3|4|5]", en: "/welcome/[1|2|3|4|5]" },
] as const satisfies readonly Def[];

type SimulatorId = `simulador-${(typeof SIMULATORS)[number]["slug"]}`;
type ConfigId = `config-${(typeof CONFIG_SCREENS)[number]["slug"]}`;
export type RouteId = (typeof STATIC_ROUTES)[number]["id"] | SimulatorId | ConfigId;

export interface Route {
  id: RouteId;
  section: SectionId | null;
  es: string;
  en: string;
}

/** La tabla: una fila por pantalla, con su patrón en cada idioma. */
export const ROUTES: readonly Route[] = [
  ...(STATIC_ROUTES as readonly Route[]),
  ...SIMULATORS.map((s): Route => ({ id: `simulador-${s.slug}`, section: "creditos", es: `/creditos/simuladores/${s.slug}`, en: `/loans/simulators/${s.en}` })),
  ...CONFIG_SCREENS.map((s): Route => ({ id: `config-${s.slug}`, section: "config", es: `/configuracion/${s.slug}`, en: `/settings/${s.en}` })),
];

const BY_ID = new Map<RouteId, Route>(ROUTES.map((route) => [route.id, route]));

export function routeById(id: RouteId): Route {
  return BY_ID.get(id)!;
}

export interface NavItem {
  id: string;
  route: RouteId;
}

export interface NavSection {
  id: SectionId;
  /** Nombre del icono (`src/ui/icons.tsx`). */
  icon: string;
  route: RouteId;
  items: NavItem[];
}

/** Los nombres y el orden son los del propietario (§1.1 del diseño). */
export const SECTIONS: readonly NavSection[] = [
  { id: "resumen", icon: "home", route: "resumen", items: [] },
  {
    id: "movimientos",
    icon: "list",
    route: "movimientos",
    items: [
      { id: "ingresos", route: "movimientos-ingresos" },
      { id: "egresos", route: "movimientos-egresos" },
      { id: "transferencias", route: "movimientos-transferencias" },
      { id: "historial", route: "movimientos-historial" },
      { id: "compartidos", route: "compartidos" },
    ],
  },
  {
    id: "cuentas",
    icon: "bank",
    route: "cuentas",
    items: [
      { id: "bancos", route: "cuentas-bancos" },
      { id: "efectivo", route: "cuentas-efectivo" },
      { id: "debito", route: "cuentas-debito" },
      { id: "credito", route: "cuentas-credito" },
      { id: "importar", route: "cuentas-importar" },
    ],
  },
  {
    id: "pagos",
    icon: "calendar-check",
    route: "pagos",
    items: [
      { id: "suscripciones", route: "pagos-suscripciones" },
      { id: "fijos", route: "pagos-fijos" },
      { id: "calendario", route: "pagos-calendario" },
    ],
  },
  {
    id: "creditos",
    icon: "loan",
    route: "creditos",
    items: [
      { id: "prestamos", route: "creditos" },
      { id: "cuotas", route: "creditos-cuotas" },
      { id: "intereses", route: "creditos-intereses" },
      { id: "amortizaciones", route: "creditos-amortizaciones" },
      { id: "deudas", route: "creditos-deudas" },
    ],
  },
  {
    id: "plan",
    icon: "target",
    route: "plan-presupuestos",
    items: [
      { id: "presupuestos", route: "plan-presupuestos" },
      { id: "ahorro", route: "plan-ahorro" },
      { id: "objetivos", route: "plan-objetivos" },
    ],
  },
  {
    id: "informes",
    icon: "chart",
    route: "informes",
    items: [
      { id: "estadisticas", route: "informes-estadisticas" },
      { id: "proyecciones", route: "informes-proyecciones" },
      { id: "patrimonio", route: "informes-patrimonio" },
    ],
  },
  {
    id: "config",
    icon: "gear",
    route: "config-categorias",
    items: CONFIG_SCREENS.map((s): NavItem => ({ id: s.slug, route: `config-${s.slug}` })),
  },
];

/** Fuera del árbol, en la cabecera (§1.1). */
export const NOTIFICATIONS_ROUTE: RouteId = "notificaciones";
export const PROFILE_ROUTE: RouteId = "perfil";
export const NEW_MOVEMENT_ROUTE: RouteId = "movimiento-nuevo";

const SLUG = /^[A-Za-z0-9_-]{1,64}$/;
const PERIOD = /^(?:\d{4}-(?:0[1-9]|1[0-2])|actual|current)$/;

function segmentMatches(pattern: string, value: string): { dynamic: boolean; ok: boolean } {
  if (!pattern.startsWith("[")) return { dynamic: false, ok: pattern === value };
  const inner = pattern.slice(1, -1);
  if (inner.includes("|")) return { dynamic: true, ok: inner.split("|").includes(value) };
  return { dynamic: true, ok: inner === "periodo" ? PERIOD.test(value) : SLUG.test(value) };
}

const split = (path: string) => path.split("/").filter(Boolean);

export interface RouteMatch {
  route: Route;
  /** Los segmentos que salieron de `[...]`, en orden. */
  params: string[];
}

/**
 * La pantalla de una ruta (sin `/<idioma>/<raíz>`) en un idioma. Gana la de menos segmentos dinámicos:
 * `/movimientos/nuevo` no es un `[id]`.
 */
export function matchRoute(locale: Locale, rest: string): RouteMatch | null {
  const segments = split(rest);
  let best: (RouteMatch & { dynamic: number }) | null = null;
  for (const route of ROUTES) {
    const parts = split(route[locale]);
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

/** La ruta relativa (`/movimientos/42/asientos`) de una pantalla en un idioma, con sus parámetros. */
export function routePath(locale: Locale, id: RouteId, params: readonly string[] = []): string {
  let index = 0;
  const parts = split(routeById(id)[locale]).map((part) => (part.startsWith("[") ? (params[index++] ?? part) : part));
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

/** La URL completa: `/es/finanzas/movimientos`, `/en/finance` (la raíz es la de Resumen y la página de aterrizaje). */
export function fmsHref(locale: Locale, id: RouteId, params: readonly string[] = []): string {
  const rel = routePath(locale, id, params);
  return rel === "/" ? rootPath(locale) : `${rootPath(locale)}${rel}`;
}

export interface FmsLocation {
  locale: Locale;
  /** `null` si la URL es de otro lado, o es de aquí pero no está en la tabla. */
  match: RouteMatch | null;
  /** Es `/<idioma>/<raíz>`: la página de aterrizaje (y el Resumen de quien tiene sesión). */
  isLanding: boolean;
}

/** Descompone una URL de la app (`/es/finanzas/pagos/fijos`); `null` si no empieza por `/<idioma>/<raíz>`. */
export function parseFmsPath(pathname: string): FmsLocation | null {
  const [first, second, ...rest] = split(pathname);
  if (!(locales as readonly string[]).includes(first)) return null;
  const locale = first as Locale;
  if (second !== ROOT_SLUG[locale]) return null;
  const relative = `/${rest.join("/")}`;
  return { locale, match: matchRoute(locale, relative), isLanding: rest.length === 0 };
}

/** La URL equivalente en otro idioma (cambio de idioma, `hreflang`); la raíz del otro idioma si no hay equivalente. */
export function alternatePath(pathname: string, target: Locale): string {
  const parsed = parseFmsPath(pathname);
  if (!parsed?.match) return rootPath(target);
  return fmsHref(target, parsed.match.route.id, parsed.match.params);
}

export function sectionOf(pathname: string): SectionId | null {
  return parseFmsPath(pathname)?.match?.route.section ?? null;
}

/** ¿Es este subelemento la pantalla actual? */
export function isItemActive(item: NavItem, pathname: string): boolean {
  return parseFmsPath(pathname)?.match?.route.id === item.route;
}

/** La sección está activa en cualquier ruta suya; `Resumen` solo en la raíz. */
export function isSectionActive(section: NavSection, pathname: string): boolean {
  const parsed = parseFmsPath(pathname);
  if (!parsed) return false;
  return section.id === "resumen" ? parsed.isLanding : parsed.match?.route.section === section.id;
}
