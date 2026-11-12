"use client";

/**
 * El ámbito activo y la lista de hogares, SOLO en memoria del módulo (ni `localStorage` ni caché del navegador; ni en la URL).
 * Al recargar la página se vuelve a Personal. `getScope()` lo lee el cliente de la API para elegir la ruta de cada petición.
 */
import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/api";
import type { Household, HouseholdList } from "@/api/models";
import { paths } from "@/api/paths";
import { canWriteRole, PERSONAL, sameScope, type Role, type Scope } from "./scope";

type Listener = () => void;

let scope: Scope = PERSONAL;
const scopeListeners = new Set<Listener>();

export function getScope(): Scope {
  return scope;
}

export function setScope(next: Scope): void {
  if (sameScope(scope, next)) return;
  scope = next;
  scopeListeners.forEach((listener) => listener());
}

const subscribeScope = (listener: Listener) => {
  scopeListeners.add(listener);
  return () => void scopeListeners.delete(listener);
};

/** El ámbito activo (en el servidor y en la hidratación, siempre Personal). */
export function useScope(): Scope {
  return useSyncExternalStore(subscribeScope, getScope, () => PERSONAL);
}

// --- hogares ---------------------------------------------------------------------------------------------------------------------------

export type HouseholdsState = { status: "idle" | "loading" | "ready" | "error"; data: HouseholdList | null; failureStatus: number | null };

const IDLE: HouseholdsState = { status: "idle", data: null, failureStatus: null };
let households: HouseholdsState = IDLE;
const householdListeners = new Set<Listener>();
let inFlight: Promise<void> | null = null;

function publish(next: HouseholdsState): void {
  households = next;
  householdListeners.forEach((listener) => listener());
}

/** Pide `GET households` (los hogares y las invitaciones). Una sola petición a la vez; conserva el dato anterior mientras llega el nuevo. */
export function refreshHouseholds(): Promise<void> {
  if (inFlight) return inFlight;
  publish({ ...households, status: "loading" });
  inFlight = api.get<HouseholdList>(paths.households(), { unscoped: true, redirectOn401: false }).then((result) => {
    inFlight = null;
    publish(result.ok ? { status: "ready", data: result.data, failureStatus: null } : { status: "error", data: households.data, failureStatus: result.status });
    // Si el hogar activo ya no existe (lo borraron, salí o me expulsaron), se vuelve a Personal.
    const active = getScope();
    if (result.ok && active.kind !== "personal" && !result.data.households.some((h) => h.id === active.id)) setScope(PERSONAL);
  });
  return inFlight;
}

const subscribeHouseholds = (listener: Listener) => {
  householdListeners.add(listener);
  return () => void householdListeners.delete(listener);
};
const getHouseholds = () => households;

/** Los hogares y las invitaciones; la primera pantalla que lo usa dispara la carga. `reload` la repite tras un cambio. */
export function useHouseholds(): HouseholdsState & { reload: () => Promise<void> } {
  const state = useSyncExternalStore(subscribeHouseholds, getHouseholds, () => IDLE);
  useEffect(() => {
    if (getHouseholds().status === "idle") void refreshHouseholds();
  }, []);
  return { ...state, reload: refreshHouseholds };
}

/** Para las pruebas: vuelve al estado de una página recién cargada. */
export function resetHouseholdState(): void {
  scope = PERSONAL;
  households = IDLE;
  inFlight = null;
}

/** El hogar del ámbito activo (si lo hay) con mi rol en él. */
export function useActiveHousehold(): { scope: Scope; household: Household | null; role: Role | null; loading: boolean } {
  const active = useScope();
  const { data, status } = useHouseholds();
  const household = active.kind === "personal" ? null : (data?.households.find((h) => h.id === active.id) ?? null);
  return { scope: active, household, role: household?.role ?? null, loading: active.kind !== "personal" && !household && (status === "idle" || status === "loading") };
}

/**
 * ¿Puedo escribir en lo que veo? Personal y «Ambos» (cuyas pantallas de edición son personales): sí. En un hogar, según mi rol; mientras
 * no se sabe, no (el servidor igual responde 403 `household_read_only` al visor).
 */
export function useCanWrite(): boolean {
  const { scope: active, role } = useActiveHousehold();
  return active.kind !== "household" || canWriteRole(role);
}
