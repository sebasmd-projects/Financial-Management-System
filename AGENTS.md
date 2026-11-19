# AGENTS.md (FMS)

* **Seguridad primero, sin quitar funciones** (propietario, 2026-11-10): datos financieros cifrados por usuario en el
  servidor, aislados por dueño, MFA obligatorio. El frontend nunca guarda datos financieros en `localStorage`; nada de
  montos en registros, analítica ni URLs.
* Reglas técnicas: `docs/owner-rules.md` (dinero en `Decimal` en el backend; en el frontend, cadenas decimales tal como
  llegan de la API: **nunca `Number`/`parseFloat` para operar con dinero**).
* Commits en español: `[tipo] [VERSION] (ámbito): descripción` (tipos: feat, fix, docs, test, chore, refactor, style, ci).
  Quien integra asigna la versión. Toda rama termina en un PR a `main`; no hay merge sin aprobación del propietario.
* Dependencias con al menos una semana de publicadas (propietario, 2026-11-19; antes dos); se commitea el bloqueo.
  Excepción permanente (propietario, 2026-11-18): una CVE **crítica** (CVSS ≥ 9.0 o «critical» en GHSA, `npm audit`, `pip-audit`) con
  parche publicado se adopta ya: la versión más baja con parche de la misma mayor, aviso (GHSA/CVE) y severidad en commit y PR, las
  comprobaciones de siempre y una fila en el registro de `docs/owner-rules.md`. Las demás severidades siguen con la semana.
* Documentación y comentarios en español; identificadores en inglés.
* Nada de secretos, IP reales ni datos financieros reales en el repositorio, PR o registros.
