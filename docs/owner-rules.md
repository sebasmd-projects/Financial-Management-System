# FMS — decisiones y reglas técnicas del propietario (2026-11-10)

Stack por defecto (pendiente de que el propietario lo confirme): repo nuevo; Expo/React Native (Android + web primero, iOS después);
Django + PostgreSQL en el VPS; un usuario con MFA, modelo listo para hogar.

Reglas técnicas obligatorias (texto del propietario):
1. DecimalField para todo valor monetario. Nunca float.
2. Motor de cálculos financieros separado de vistas y serializers (dominio en Python puro, como backend/domain del CV).
3. Trazabilidad de modificaciones y anulaciones.
4. Transacciones atómicas en operaciones contables.
5. No modificar movimientos conciliados sin un ajuste auditable.
6. Zonas horarias y fechas de vencimiento correctas (America/Bogota; fechas de negocio como DateField).
7. Permisos, cifrado y MFA para la información financiera.
8. Pruebas unitarias de tasas, cuotas, amortizaciones y saldos.
9. Idempotencia para evitar movimientos duplicados (claves de idempotencia en la API y en la generación de recurrencias).
10. Saldos derivados del Ledger, con mecanismos de conciliación.

Además: doble partida (asientos que cuadran), estados pendiente/confirmado/anulado/conciliado (anular = reverso),
parámetros regulatorios y tasas como datos con vigencia (nunca codificados), festivos de Colombia, GMF, UVR, multimoneda.

Principio de arquitectura (propietario, 2026-11-10): el núcleo es cuentas + movimientos + Ledger. Tarjetas, suscripciones,
cuotas, créditos y presupuestos construyen sus operaciones sobre ese núcleo (escriben y leen asientos), no son módulos
aislados con sus propios saldos.

Respuestas del propietario a las preguntas abiertas del diseño (2026-11-10):
1. Periodo: mes calendario (1 al último día); los gastos fijos se reinician el día 1.
2. Compra a cuotas en «Gastado»: en el mismo cuadro, GRANDE en naranja el costo total real (cuotas + intereses) y
   pequeño en rojo el valor de compra. (No es ni «valor completo» ni «solo la cuota»: muestra ambos.)
3. «Te queda»: ahorro primero (se restan los aportes planeados a metas).
4. Autoconfirmación: solo las recurrencias que el propietario elija, con aviso al confirmarse.
5. Pago de tarjeta por defecto en el Resumen: pago total del extracto (propuesta de diseño; no se preguntó, se puede cambiar).

## Registro de decisiones

### 2026-11-19: dependencias con al menos una semana de publicadas (antes dos)

Decisión del propietario: la antigüedad mínima de una dependencia pasa de **dos semanas a una**. Una versión es elegible si se publicó
hace siete días o más. Las CVE críticas con parche siguen sin espera (entrada del 2026-11-18); los avisos no críticos conservan la
semana. Se aplica ya a `package.json` y a los bloqueos.

### 2026-11-18: CVE críticas con parche: excepción a las dos semanas (hoy, una semana)

Decisión del propietario (textual): «que todas las CVE críticas tengan excepción si tienen parche, que no se tenga que esperar».

La regla general es que toda dependencia tenga **al menos dos semanas** de publicada. Excepción **permanente**: una vulnerabilidad
**crítica** (CVSS ≥ 9.0, o «critical» en GHSA, `npm audit` o `pip-audit`) con versión parcheada publicada se adopta de inmediato.

* Se toma la **versión más baja con parche dentro de la misma mayor**.
* El commit y el PR nombran el aviso (GHSA y/o CVE) y su severidad.
* Se ejecutan las comprobaciones normales; la excepción no exime de ninguna.
* Se anota abajo, en el mismo PR. Los avisos no críticos conservan las dos semanas (el propietario puede conceder una excepción puntual).

| Fecha | Paquete | Versión | Aviso | Severidad | Aprobó |
|---|---|---|---|---|---|
| _(sin entradas)_ | | | | | Decisión permanente del propietario, 2026-11-18 |

### 2026-11-14: eliminar es un borrado lógico con papelera de 30 días

Decisión del propietario, sobre todo lo que la persona puede crear (movimientos, cuentas, tarjetas, créditos, deudas, categorías, presupuestos,
metas, activos y sus hijos, medios de pago, atributos personalizados, recurrencias, escenarios, reglas):

1. **Eliminar = borrado lógico y, a los 30 días, borrado de verdad.** Lo eliminado desaparece de listas, saldos, informes, paneles, calendario,
   exportaciones y búsqueda. Una cuenta (o tarjeta, crédito, deuda) **con movimientos** se elimina con todos ellos: ya no hay `409 has_history`.
2. **Antes de confirmar**, la app muestra qué se verá afectado (productos relacionados, cuántos movimientos, medios de pago y recurrencias que
   quedan sin enlace, metas cuyo aporte vuelve a la cuenta de origen) y, en una cuenta con movimientos, ofrece **exportarlos antes**
   (el CSV que el importador vuelve a leer en las cuentas de activo; JSON en el resto).
3. **Libro**: por dentro el libro sigue cuadrado: cada asiento eliminado escribe su reverso, **oculto** (no sale en ninguna lista), y la
   verificación de saldos sigue pasando antes, después de restaurar y después de purgar.
4. **Auditoría**: queda quién y cuándo eliminó y restauró; la purga a los 30 días es una acción **del sistema**. El registro de auditoría se conserva
   (solo se añade) y no lleva montos.
5. **Conciliados**: la persona puede reabrir la conciliación antes (opcional). Si confirma sin hacerlo, se elimina igual y esa conciliación queda
   marcada **«descuadrada»** (estado nuevo, visible en la pantalla de conciliación).
6. **Categorías**: eliminarla pasa sus movimientos a «Sin categoría». **Presupuestos y metas**: eliminación directa; los aportes de una meta con su propio
   fondo vuelven a la cuenta de origen. **Activos**: caen con sus valorizaciones, costos y mantenimientos.
7. **Papelera**: lista lo eliminado con los días que quedan y «Restaurar» (web: Configuración → Papelera; app: Más → Papelera).
8. **Hogar**: las mismas reglas con el ámbito y los permisos del hogar: solo quien puede escribir elimina o restaura; un visor solo ve la papelera.
   Las filas eliminadas siguen cifradas y la purga respeta la llave del hogar.

Contrato: `GET deletions/preview`, `POST deletions`, `GET deletions`, `POST deletions/{id}/restore` y `POST deletions/export` (backend, `finance_trash`).
Código: `core/trash.ts` (lógica y cliente compartidos), `src/features/finance/trash/` (web) y `mobile/src/features/trash/` (app).

### 2026-11-15: «Borrar todos mis datos de Finanzas» (sin cerrar la cuenta del sitio)

Pregunta del propietario: «¿Cómo borro toda mi información financiera?». Hasta hoy solo se podía borrando la cuenta del sitio entera. Decisión:

1. **Una acción propia** (web: Perfil y seguridad → Zona de peligro; app: Seguridad → «Borrar todos mis datos de Finanzas») que destruye **solo lo financiero**
   (filas, también la papelera, originales y conexiones por correo, historial cifrado, endpoints de push y la llave de datos) y deja la cuenta del sitio
   (chat, textos legales). La próxima visita pide activar Finanzas de nuevo, con una llave nueva.
2. **Inmediato e irreversible**: no pasa por la papelera de 30 días (decisión explícita del propietario).
3. **Antes de borrar**: vista previa del servidor con recuentos por tipo, aviso de las **copias de seguridad** (conservan la llave envuelta hasta que caducan por
   rotación: ADR-019 §5), **«Exportar primero»** (el mismo «Exportar todos mis datos de Finanzas»: un ZIP asíncrono con `finanzas.json` y un CSV por cuenta y tarjeta, de un solo uso; en la app se abre la web, que es donde se descargan archivos), la frase escrita
   («BORRAR MIS FINANZAS» / «DELETE MY FINANCES») y **reautenticación reciente**.
4. **Hogar**: se sale de cada hogar (su llave se renueva); lo compartido es del hogar y se queda. Propietario de un hogar con más miembros: el servidor responde
   `409 household_owner` y hay que ceder la propiedad o borrar el hogar antes. Único miembro: el hogar se destruye con él.
5. Queda **una fila de auditoría sin contenido** (quién y cuándo). Los demás dispositivos de la app pierden la sesión; el actual la conserva.
6. Tras borrar, activar espera unos segundos (`409 erase_cooling_down`): otro proceso del servidor puede recordar la llave vieja.

Contrato: `GET me/erase/preview` y `POST me/erase` (backend, `finance_core/erasure.py`). Código: `core/erase.ts` (lógica y cliente compartidos),
`src/features/finance/erase/` (web) y `mobile/src/app/(app)/erase.tsx` (app).

### 2026-11-16: «Exportar todos mis datos de Finanzas»

Decisión del propietario: «Así como se pueden borrar todos los datos, se debe también poder exportar todos los datos».

1. **Un ZIP, armado aparte** (Celery): `finanzas.json` (todo descifrado, la papelera marcada `in_trash`, la auditoría descifrada, las conexiones de correo **sin** direcciones, tokens ni correos
   originales), un CSV por cuenta de activo y por tarjeta **en el formato del importador** (se pueden volver a importar), el CSV de los planes de apertura de cada tarjeta y un `LEEME.txt` (es/en) que
   dice que **el ZIP no va cifrado**. No lleva los comprobantes (solo su nombre, tipo y tamaño).
2. **Reautenticación reciente**, **3 por día** por usuario (los dos ámbitos comparten cupo) y una fila de auditoría sin contenido.
3. **De un solo uso**: el archivo vive cifrado en el servidor; el estado trae un enlace firmado de 15 minutos que se gasta al bajar, y el archivo se destruye al bajarlo o a las 24 horas.
4. **Hogar**: cualquier miembro con lectura (también un visor) exporta lo del hogar en la configuración del hogar; la exportación personal lista los hogares.
5. **Web y app**: en `/perfil`, «Exportar mis datos de Finanzas» va encima de la zona de peligro; «Exportar primero» del diálogo de borrar usa esta misma exportación y baja el ZIP solo al estar listo.
   La app no descarga archivos: abre el apartado de la web.

Contrato: `POST|GET me/export`, `GET me/export/{id}` y `.../download` (y `households/{id}/export…`). Código: `core/export.ts` (lógica y cliente compartidos), `src/features/finance/export/` (web),
`mobile/src/app/(app)/security.tsx` y `erase.tsx` (la app abre la web).

### 2026-11-14: integración con los bancos, solo lectura

Respuestas del propietario a las preguntas del [plan de integración con los bancos](bank-integration-plan.md) (§7 de su primera versión):

1. **Correo: el usuario conecta su propio correo** (uno o varios: un banco puede escribir a una dirección y otro a otra). No hay un buzón de
   alertas compartido. El FMS lee de ahí los correos de alerta (movimientos, transferencias, cobros, ingresos) **y los extractos adjuntos**.
   Vale para **cualquier usuario y para el Hogar** desde el inicio, no solo para el propietario.
2. **La plataforma nunca muestra el correo completo.** Flujo: aviso → movimiento propuesto → **Aprobar | Modificar | «Ir al correo»** (enlace que
   abre ese mensaje en el proveedor de correo del usuario). El correo original se guarda cifrado con la DEK del ámbito **solo para depurar un
   analizador que falla**, con retención de **30 días**; los eventos descartados, igual.
3. **Ni lector de notificaciones de Android ni SMS**: el propietario no quiere permisos adicionales.
4. **Nequi y Nu** solo se activan **desde la app móvil**, cuando el usuario lo enciende ahí (interpretación en el plan, §5.6).
5. **Presupuesto: 20 USD al mes** para este proyecto. **Se acepta un agregador** solo si las credenciales se escriben en la pantalla propia del
   agregador y el FMS nunca las ve ni las guarda, exige como mínimo segundo factor, y cumple protocolos mínimos de seguridad (certificaciones).
6. **Reglas de autoconfirmación**: p. ej. la nómina con un patrón concreto se confirma sola. Hay una tabla o pantalla de estas reglas: el sistema
   **sugiere** una regla cuando detecta un patrón, y el usuario también puede **escribir la suya**.
7. Pexto Capital y los patrimonios autónomos: el propietario no sabe qué son en detalle; quedan fuera de la fase 1.
8. «¿Bajarías el monto mínimo a cero?»: el propietario pidió la explicación; está en el plan (§3.1, «El monto mínimo de las alertas»).

### 2026-11-14: integración con los bancos, segundas respuestas

Respuestas del propietario a las preguntas abiertas del [plan de integración con los bancos](bank-integration-plan.md) (§8 de su versión 2):

1. **Q2, canal**: se acepta el **reenvío filtrado a una dirección única por conexión** como forma de «conectar tu correo».
2. **Q7, correo entrante**: el VPS puede recibir correo en `ingest.<dominio>`. Los usuarios en español reciben además una dirección en un subdominio con
   nombre en español: se propone **`recibir.<dominio>`**. Los subdominios son una lista configurable (`FMS_SYNC_INGEST_DOMAINS`) con uno por defecto por
   idioma; todos se enrutan igual.
3. **Q3, contraseña de los PDF**: se **pide cada vez** por defecto. En Seguridad el usuario puede activar «guardar mi cédula»: se cifra con su DEK y la app
   la prueba sola como contraseña del PDF. Nunca va a un registro; verla o cambiarla pide reautenticación.
4. **Q4, reglas de autoconfirmación**: totalmente configurables. Una regla de **gasto no exige un rango de monto** (p. ej. un proveedor de montos variables
   y nombre fijo). El rango de monto es opcional en toda regla.
5. **Q5, «Modificar»**: **todos los campos** se pueden editar antes de aprobar, **el monto incluido** (queda auditado).
6. **Q1, Nequi y Nu**: no se lee nada del teléfono salvo que sea estrictamente necesario; Nequi y Nu solo se **activan** en la app y se leen por correo.

### 2026-11-14: reglas de autoconfirmación también en el Hogar, y `recibir.` confirmado

Respuestas a las dos preguntas que quedaban abiertas del [plan de integración con los bancos](bank-integration-plan.md) (§8):

1. **Q8, subdominio en español**: **`recibir.<dominio>`** queda confirmado (junto a `ingest.<dominio>`). Sigue siendo solo configuración
   (`FMS_SYNC_INGEST_DOMAINS`, `en=ingest.<dominio>,es=recibir.<dominio>`).
2. **Q9, reglas del Hogar**: las reglas de autoconfirmación **también funcionan en el Hogar**. Antes la API de reglas era solo personal y un correo
   de una conexión del Hogar siempre quedaba propuesto.

Plan (y qué se hizo):

* **Por ámbito, sin cruzarse**: un correo de una conexión del Hogar solo evalúa las reglas de **ese** Hogar; uno personal, solo las del usuario. Las reglas y
  las sugerencias (y sus descartes) son del ámbito, y las del Hogar se cifran con la llave del Hogar.
* **Permisos**: crear, cambiar, pausar y eliminar reglas, y descartar sugerencias, pide rol de escritura (propietario, administrador o editor). Un visor las ve y
  puede «Probar» (no escribe), sin botones de edición. Crear o cambiar una regla de autoconfirmación sigue pidiendo reautenticación reciente. Todo queda auditado
  a nombre del miembro.
* **Solo `sync_event` + `auto_confirm`** en el Hogar: las reglas de avisos del libro (tarjetas, presupuestos, saldos, obligaciones) siguen siendo personales.
* **API**: las mismas rutas bajo `households/{id}/` (`automation/catalog`, `automation/rules[...]`, `sync/rule-suggestions[/dismiss]`). **Web**: la pantalla
  «Autoconfirmación» sigue el ámbito activo como las demás del Hogar. **App**: la lista de reglas del Hogar (pausar, reactivar, borrar y sugerencias según el rol).
* Contrato: `core/api/openapi-fms.yaml` sincronizado con el backend (`households/{id}/automation/*` y `households/{id}/sync/rule-suggestions*`).

### 2026-11-15: compras a cuotas vigentes y simulador de pagos

Dos preguntas del propietario sobre las tarjetas y los créditos: «¿ya se tienen en cuenta los históricos con sus cuotas?» y «si quiero pagar X de la tarjeta, ¿dejo todas mis compras a X cuotas o pago Y sobre el total? (igual para los créditos)».

1. **Compras a cuotas vigentes** (anteriores al inicio, a medio pagar). Se registran **a mitad de camino**: fecha de la compra, valor original, cuotas totales, cuotas ya facturadas, saldo de capital del banco (opcional), tasa (opcional: sin ella sigue la de la tarjeta) y próxima cuota (opcional).
   Crea el plan y **solo las cuotas que faltan**; **no hay gasto en el periodo**. La cuenta: el saldo inicial de la tarjeta ya incluye el capital que falta, así que **saldo inicial = revolvente + capital de las compras a cuotas** (la pantalla lo muestra y avisa si no cuadra); si el saldo inicial no las
   incluía, se marca «Sumar al saldo inicial». Pantalla: tarjeta → «Compras a cuotas vigentes» (de una en una o con un CSV/Excel y plantilla descargable, con vista previa antes de confirmar). Detalle contable en el README de `finance_credit` del backend.
2. **Simulador de pagos** (web: Créditos → Simuladores → «Simulador de pagos», desde la tarjeta, el crédito y el Resumen; app: «Más» → «Simular un pago» y Extractos). **No escribe nada.** Tarjeta: pagar el total, el mínimo, X o **diferir** el resto (o todo) a N cuotas con la tasa de la tarjeta o la que escribas;
   lado a lado, mes a mes y con la más barata marcada, más las preguntas al revés (¿cuánto para no pagar intereses? ¿para terminar en N meses? ¿en cuántas cuotas para que no pase de X?). Crédito: solo la cuota frente a abonar X (reducir plazo o cuota) y «¿cuánto abonar para terminar en N cuotas?».
   Cada respuesta lista sus **supuestos** (no compras nada nuevo, pagas en la fecha de pago, la tasa vigente en cada corte, el banco acepta diferir) y avisa si la tasa que escribes supera la usura que registraste.
* Contrato: `core/api/openapi-fms.yaml` sincronizado con el backend.

Decisión del propietario (2026-11-16): el acento de la interfaz no es rosado ni coral sino **blanco**. En el tema oscuro, `accent` es
blanco cálido (`#FBF9F4`) con `on-accent` en tinta (`#141311`); en el claro, donde el blanco no se distingue del fondo, su contraparte
monocromática: tinta casi negra (`#141311`) con `on-accent` blanco. La serie 2 de las gráficas es un gris neutro. Los semánticos
(`negative` carmesí, `positive` verde) no cambian.
