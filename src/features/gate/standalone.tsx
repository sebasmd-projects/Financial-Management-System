import type { ReactNode } from "react";

/** Una pantalla sola, sin la cáscara de la app (cargando, error, activación): centrada y con `main#contenido`. */
export function Standalone({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <main id="contenido" tabIndex={-1} className="standalone" aria-label={label}>
      <div className="standalone__card">{children}</div>
    </main>
  );
}
