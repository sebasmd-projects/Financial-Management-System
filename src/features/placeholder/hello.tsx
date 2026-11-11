"use client";

import { useGateView } from "@/features/session/provider";

/** «Hola, Ana»: el nombre sale de `/me`. Es el único dato de la persona que se muestra en FMS-0 (y no es financiero). */
export function Hello({ greeting }: { greeting: string }) {
  const view = useGateView();
  if (view.kind !== "app") return null;
  return (
    <p className="muted">
      {greeting}, {view.me.user.display_name}.
    </p>
  );
}
