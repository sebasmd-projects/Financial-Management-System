"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { drillRoute, stageDrill } from "./drill";
import { useHref } from "./hooks";

/** «Ver movimientos»: navega a Movimientos y le pasa el filtro por memoria, no por la URL (un monto nunca va en la URL). */
export function DrillLink({ filter, className, children, ...rest }: { filter: Record<string, unknown> | null | undefined; className?: string; children: ReactNode; "aria-label"?: string }) {
  const href = useHref();
  return (
    <Link href={href(drillRoute(filter))} className={className} onClick={() => stageDrill(filter)} {...rest}>
      {children}
    </Link>
  );
}
