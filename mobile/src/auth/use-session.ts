import { useSyncExternalStore } from "react";
import { reauth, runtime } from "./runtime";
import type { Phase } from "./session";

export function usePhase(): Phase {
  const { session } = runtime();
  return useSyncExternalStore(session.subscribe, session.getPhase, session.getPhase);
}

export const useSession = () => runtime().session;
export const useAllauth = () => runtime().allauth;
export const useFms = () => runtime().http.fms;

export function useReauthOpen(): boolean {
  return useSyncExternalStore(reauth.subscribe, reauth.isOpen, reauth.isOpen);
}
