"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { api } from "@/api";
import { createSessionStore, gateView, type GateView, type SessionStore } from "./store";

const Context = createContext<SessionStore | null>(null);

/** Crea el almacén de la sesión y pide `/me` al montar. `store` es para las pruebas. */
export function SessionProvider({ children, store: injected }: { children: ReactNode; store?: SessionStore }) {
  const [store] = useState(() => injected ?? createSessionStore(api));
  useEffect(() => {
    void store.load();
    return () => store.abort();
  }, [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function useSessionStore(): SessionStore {
  const store = useContext(Context);
  if (!store) throw new Error("useSessionStore fuera de <SessionProvider>");
  return store;
}

const LOADING = { status: "loading" } as const;

/** Qué pantalla toca según `/me` (`gateView`). En el servidor y en la hidratación siempre «cargando». */
export function useGateView(): GateView {
  const store = useSessionStore();
  const state = useSyncExternalStore(store.subscribe, store.getState, () => LOADING);
  return gateView(state);
}
