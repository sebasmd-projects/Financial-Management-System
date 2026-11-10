# AGENTS.md (FMS)

* **Seguridad primero, sin quitar funciones** (propietario, 2026-11-10): datos financieros cifrados por usuario en el
  servidor, aislados por dueño, MFA obligatorio. El frontend nunca guarda datos financieros en `localStorage`; nada de
  montos en registros, analítica ni URLs.
* Reglas técnicas: `docs/owner-rules.md` (dinero en `Decimal` en el backend; en el frontend, cadenas decimales tal como
  llegan de la API: **nunca `Number`/`parseFloat` para operar con dinero**).
* Commits en español: `[tipo] [VERSION] (ámbito): descripción` (tipos: feat, fix, docs, test, chore, refactor, style, ci).
  Quien integra asigna la versión. Toda rama termina en un PR a `main`; no hay merge sin aprobación del propietario.
* Dependencias con al menos dos semanas de publicadas; se commitea el bloqueo.
* Documentación y comentarios en español; identificadores en inglés.
* Nada de secretos, IP reales ni datos financieros reales en el repositorio, PR o registros.
