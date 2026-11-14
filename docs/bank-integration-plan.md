# FMS: plan de integración con los bancos (solo lectura)

Estado: **propuesta para el propietario** (2026-11-14). No hay código: esto es planeación. Lo que aquí se decide de arquitectura
o de seguridad necesita un ADR nuevo (apéndice A); los agentes no editan ADR.

Pedido del propietario (literal): «Empieza con la planeación para la integración con los propios bancos, no hace envíos,
transferencias, únicamente lectura de movimientos».

Documentos relacionados: [reglas del propietario](owner-rules.md), [plan técnico](technical-plan.md), [diseño](design-spec.md).
En el repo del CV: `docs/adr/ADR-019-fms-finanzas.md`, `backend/apps/finance_import/README.md` (el importador que se reutiliza)
y `backend/apps/finance_household/README.md` (Hogar).

Convención de confianza en las fuentes: **[P]** fuente primaria leída (texto oficial), **[S]** fuente secundaria (prensa,
bufetes, directorios), **[?]** sin confirmar: lo resuelve un *spike* de la fase 0.

---

## 1. Resumen ejecutivo y recomendación

1. **Las finanzas abiertas reguladas no sirven hoy para el FMS, ni van a servir pronto.** El Decreto 0368 de 2026 hizo
   obligatorio el sistema para las entidades vigiladas, pero (a) un receptor **no vigilado** solo entra mediante un acuerdo
   bilateral con un proveedor vigilado y, según el proyecto de la SFC, solo con los clientes de ese acuerdo; (b) el proyecto de
   cronograma de la SFC deja el estándar de **historial transaccional de depósitos a la vista a 96 meses** y el de **créditos a
   84 meses** desde que se publique el cronograma. En la práctica, el canal regulado para leer movimientos llegaría hacia 2034.
   Una persona natural con una app propia no tiene hoy una vía regulada para leer por API sus propios movimientos.
2. **Ningún banco del propietario ofrece una API pública de movimientos para personas.** Bancolombia publica APIs para
   empresas y aliados (su API de validación de cuentas excluye de forma expresa saldos y movimientos). El Aval API Market
   (julio de 2026) es para empresas: créditos preaprobados, apertura de cuentas, pagos. Nequi Conecta es de cobros. Nu
   Colombia e ICETEX no publican APIs.
3. **Los agregadores existen, pero no encajan hoy.** Belvo cubre bancos colombianos (sobre todo con credenciales, es decir,
   *scraping*), pero su plan de producción más barato publicado cuesta **1.000 USD al mes** y está pensado para empresas.
   Prometeo exige que **nuestro servidor** reciba usuario y contraseña del banco (`POST /login/`), lo que viola la regla de
   seguridad de este plan. Floid aparece con cobertura en Colombia solo en directorios. Fintoc (Chile, México) y Pluggy
   (Brasil) no operan en Colombia.
4. **Recomendación: una fase 1 sin terceros, con dos canales rápidos y uno de verdad:**
   * **Correos de alerta del banco** reenviados a un buzón dedicado, leídos por el servidor, con **verificación DKIM
     obligatoria**. Proponen movimientos y no los confirman.
   * **Notificaciones de la app del banco en el Android propio** (opcional, opt-in), para Nequi y Nu si no mandan correo.
   * **Extractos** (CSV, XLSX y OFX ya existen; PDF es nuevo): son la **fuente de verdad**. Confirman y concilian lo que los
     dos canales rápidos propusieron.

   Todo entra por el **mismo flujo del importador** (`domain/finance/importing.classify`): huella ciega, cruce con pendientes,
   deshacer por lote y conciliación. No se guardan credenciales bancarias en ningún momento y no hay nada que pueda mover
   dinero.
5. **Para más adelante:** un agregador con *widget* propio (las credenciales nunca pasan por el FMS), solo si el propietario
   acepta el costo y el tercero. Y el canal regulado, cuando la SFC expida los estándares de historial transaccional.

## 2. Regulación colombiana (estado al 2026-11-14)

| Norma | Qué dice para este plan | Confianza |
|---|---|---|
| Decreto 1297 de 2022 | Primer marco, **voluntario**: las entidades vigiladas pueden tratar datos con autorización expresa e informada del consumidor. | [P] lo cita la carta circular de la SFC |
| Circular Externa 004 de 2024 (SFC, 7-feb-2024) | Estándares tecnológicos y de seguridad, consentimiento y lineamientos para esquemas con terceros no vigilados. Plazos prorrogados por la CE 009 de 2025 y la CE 001 de 2026 (3-feb-2026). | [P] mención en la carta circular; [S] prórrogas |
| **Decreto 0368 de 2026** (7-abr-2026) | Sustituye el título 8 del libro 35 de la parte 2 del Decreto 2555 de 2010: **sistema obligatorio** para las entidades vigiladas del art. 2.35.8.2.3. Ser receptor es **voluntario**. Los datos son **gratuitos**; solo cabe recuperar costos limitados de infraestructura. La SFC debía publicar el cronograma de estándares en 6 meses y poner a funcionar el **Directorio de Participantes** en 12. Cada estándar se habilita en los 12 meses siguientes a su expedición (prorrogable 6). | [P] art. 3 (transcrito en la carta circular); [S] el resto |
| Decreto 977 de 2026 (4-ago-2026) | **Portabilidad financiera** como caso de uso del sistema, con 24 meses para sus estándares. | [P] transcrito en la carta circular |
| Proyecto de CE 010 de 2026 (comentarios hasta el 10-ago-2026) | Terceros **vigilados**: autorizados por la SFC e inscritos en el directorio. **No vigilados**: solo a través de un proveedor vigilado con acuerdo bilateral, y solo con los clientes que lo suscribieron. El proveedor les verifica el Registro Nacional de Bases de Datos, PQR, autorización, capacidad técnica y financiera, ciberseguridad y cifrado. APIs, cifrado en reposo y en tránsito, PCI-DSS si hay datos de tarjetas. Los esquemas de la CE 004 se adecúan antes del **7-abr-2027**. Recibió 651 observaciones. | [S] Holland & Knight; [P] cifra de observaciones (URF) |
| Proyecto de carta circular (31-ago-2026): cronograma | Plazos máximos, en meses desde la publicación del cronograma: portabilidad de crédito de consumo 8, hipotecario 16, comercial 24; características de productos de crédito 36, de captación 48, de seguros 60, de inversión 72; **historial transaccional de créditos 84**; **historial de depósitos a la vista 96**; vinculación 108; CDT 120; **iniciación de pagos 132**. | [P] texto del proyecto |
| Proyecto de decreto (URF, sep-2026) | Propone **6 meses más** para cada plazo de la SFC (cronograma, directorio, portabilidad). | [P] documento técnico de la URF |

**Lo que no se pudo confirmar:** si el cronograma definitivo ya se publicó y si conserva los 96 y 84 meses; si el decreto de
prórroga ya se expidió; el detalle del consentimiento (la sección II de la CE 010, «tratamiento de datos», aún no se había
publicado); y si existe un costo de inscripción en el directorio.

**Qué implica para el FMS:**

* El FMS es un proyecto personal, sin persona jurídica ni vigilancia de la SFC. No puede ser receptor vigilado. Para ser no
  vigilado necesitaría una persona jurídica y un acuerdo bilateral con cada banco: inviable para una persona.
* La ley de habeas data (Ley 1581 de 2012) sigue rigiendo el tratamiento de datos que hace el propio FMS: autorización,
  finalidad y supresión. Eso ya lo cubren el flujo legal F9-13 y el *crypto-shredding*.
* La vía regulada se vuelve a evaluar cuando se expida el estándar de historial transaccional (fase 5). El diseño de conectores
  de §5 la admite sin rehacer nada.

## 3. Qué ofrece cada institución

| Institución (productos) | API propia para personas | Finanzas abiertas | Agregadores | Correo de alerta | Notificación push | Extracto |
|---|---|---|---|---|---|---|
| **Bancolombia** (ahorros) | No. El portal es para empresas y aliados; la API de validación de cuentas **excluye** saldos y movimientos [S] | Bancolombia es proveedor y receptor (función «Tus Bancos» en su app) [S]; nada abierto a una persona | Belvo [S], Floid [S], Prometeo [S] (con credenciales) | **Sí**: alertas por correo o SMS, con montos mínimos configurables y Clave Dinámica para inscribirse [P] (página de ayuda) | Sí (app) [?] | Sucursal Virtual: extractos descargables [P]; formato por confirmar [?] |
| **AV Villas** (ahorros, TC, crédito) | No; el Aval API Market (jul-2026) es para empresas [S] | Grupo Aval anuncia más funciones «hacia fin de año o el 1T-2027» [S] | Belvo [S] | Probable (SMS o correo con los datos registrados) [?] | Sí (app) [?] | Banca virtual [?] |
| **Nequi** (ahorros, crédito) | No: Nequi Conecta es de cobros (push, QR, suscripciones) [S] | Primer acuerdo bilateral regulado con Belvo (feb-2024) [S]: es para empresas | Belvo [S], Floid [S] | Poco probable [?] | **Sí**: canal principal [?] | Extracto o certificado desde la app [?] |
| **Nu Colombia** (ahorros, TC) | No [S] | «Se prepara» [S] | Sin evidencia [?] | Su política de datos prevé correo, SMS, WhatsApp y push [P]; las alertas de compra se activan en la app [S] | **Sí** [S] | Extracto de la TC en la app [?]; ya hay una pantalla de Extractos al estilo Nu en el FMS |
| **ICETEX** (crédito educativo) | No | No es banco; no está claro que sea proveedor obligado [?] | No | Avisos de cobro [?] | No | «Mi Portal»: estado de cuenta en PDF e historial de pagos [S] |
| **Pexto Capital** | No [?] | [?] | No | [?] | [?] | Hay que confirmar con el propietario qué entidad y qué producto es (la búsqueda solo lleva a Pexto/Cobre, de tesorería empresarial) [?] |
| **Patrimonios autónomos** (fiducia) | No | Las fiduciarias son vigiladas; sin estándar de inversión antes de ~72 meses | No | Rara vez | No | **Extracto mensual** de la fiduciaria (PDF) [?] |

### Los canales en sí

| Canal | Disponibilidad | Costo | Fiabilidad | Riesgo de seguridad | Esfuerzo |
|---|---|---|---|---|---|
| Finanzas abiertas reguladas | No antes de ~2034 para movimientos; además exige ser persona jurídica | Gratis (datos) más el cumplimiento | Alta (estándar) | Bajo (OAuth, consentimiento) | Muy alto (legal) |
| API propia del banco | No existe para personas | — | — | — | — |
| Agregador con *widget* (Belvo) | Sí para Bancolombia, AV Villas y Nequi según la prensa; Nu sin evidencia | ≥ 1.000 USD/mes (plan Launch) más contrato | Media: el *scraping* se rompe con cada cambio del banco y con la MFA | Medio: un tercero con las credenciales del usuario; lo mitiga ISO 27001 [S] | Medio |
| Agregador con credenciales por API (Prometeo) | Sí (83 % de cuentas en Colombia, según su perfil [S]) | Precio a consultar | Media | **Inaceptable**: la contraseña del banco pasaría por nuestro servidor | Medio |
| Correo de alerta | Bancolombia sí; AV Villas y Nu probable; Nequi dudoso | 0 (el buzón ya está en el VPS con Virtualmin, o un buzón dedicado) | Media: casi en tiempo real, pero **incompleto** (topes mínimos, no todo genera alerta) y el formato cambia sin aviso | Medio: suplantación (se mitiga con DKIM, §4.4) | Bajo a medio: un analizador por banco |
| Notificación de Android | Todo banco con app y push | 0 | Media-baja: depende del teléfono, del ahorro de batería y de que la notificación no se descarte; texto truncado | Medio-alto: el permiso permite leer **todas** las notificaciones (§4.5) | Medio: módulo nativo en el *prebuild* de Expo |
| SMS | Bancolombia (alertas SMS) y otros | Costo del SMS para el banco, no para nosotros | Media | Alto: el permiso `READ_SMS` lee también los códigos OTP | Medio |
| Extracto (CSV, XLSX u OFX; PDF) | Todos, con mayor o menor esfuerzo | 0 | **Alta**: es lo que el banco certifica | Bajo: ya se trata como archivo hostil | Bajo para CSV, XLSX y OFX (existe); medio para PDF (un analizador por formato) |

## 4. Diseño de seguridad

### 4.1 Reglas que no se negocian

1. **Solo lectura, por construcción.** Ningún conector implementa operaciones que muevan dinero. Con un agregador se piden
   solo productos de lectura (cuentas, saldos, movimientos) y la cuenta del agregador se contrata **sin** pagos. Una prueba de
   arquitectura (`import-linter` o un test de *registry*) falla si un conector expone un método de escritura hacia el banco.
2. **Nunca guardamos ni vemos la contraseña del banco.** Si un agregador la necesita, la persona la escribe en el *widget* del
   agregador, servido por su dominio (iframe o redirección). Nuestro servidor solo recibe un identificador de enlace (`link_id`)
   o un token. Un agregador que exija credenciales por nuestra API queda descartado.
3. **Lo que sí guardamos va cifrado con la DEK del ámbito** (personal u Hogar; AES-256-GCM, datos asociados
   `modelo|campo|fila`, como el resto del FMS): tokens y `link_id` del agregador, la contraseña del buzón IMAP si se usa, los
   «últimos 4» que identifican la cuenta en un correo (además como HMAC ciego para buscar), y todos los campos de un evento
   (monto, descripción, comercio).
4. **Nada de montos ni descripciones en registros, métricas, URLs o analítica.** Un *run* registra conteos y códigos de error
   estables, nunca contenido. Una prueba con `caplog` lo comprueba para cada conector.
5. **Revocable.** Cada fuente se puede pausar y borrar. Borrarla elimina los tokens (y, con un agregador, llama a su API para
   borrar el enlace), sin tocar los movimientos ya creados; deshacerlos es el «deshacer lote» del importador. Al borrar la cuenta
   del FMS, el *crypto-shredding* deja ilegible todo lo guardado.
6. **Nada se autoconfirma por defecto.** Un correo o una notificación crean una **propuesta** (pendiente con origen «sync»).
   Se confirma a mano o con una regla que el usuario elige por fuente (análoga a la autoconfirmación de recurrencias de
   [owner-rules](owner-rules.md), respuesta 4). El extracto concilia.
7. **MFA y reautenticación** para crear, ver la configuración o borrar una fuente (el mismo `403 reauthentication_required`
   del FMS).

### 4.2 Bordes nuevos (nginx y Django)

* Las rutas autenticadas (`/api/fms/v1/sync/...`) caben en el `location ^~ /api/fms/` actual: sin compresión y con
  `limit_req zone=cv_fms`.
* **Webhooks de un agregador** (fase 4): `location = /api/fms/v1/sync/hooks/<proveedor>` propio, solo `POST`, cuerpo de
  64 KB como máximo, su propia `limit_req`, la IP real según `CV_EDGE`, y lista de IP del proveedor si la publica. En Django:
  sin sesión, exento de CSRF solo en esa vista, y **firma HMAC verificada en tiempo constante**, con marca de tiempo y una
  ventana anti-repetición de 5 minutos más un registro de ids ya vistos. Si el proveedor no firma, el webhook es solo un aviso:
  no se confía en su cuerpo y se consulta la API del proveedor con nuestro token.
* Toda ruta nueva pasa por `manage.py check_attack_terms` (que `sync`, `hooks` o el nombre del proveedor no choquen con
  `COMMON_ATTACK_TERMS`) y va a `deploy/nginx/cv-locations.conf.template` (bloque `@FMS`) y a la tabla de rutas de
  `backend/tests/deploy/test_nginx.py`. Se comprueba con `deploy/nginx/test/run.sh check` (nginx 1.24).
* El canal de correo **no añade rutas HTTP**: el servidor lee el buzón (IMAP sobre TLS, saliente). Si el buzón vive en el mismo
  VPS (Virtualmin), la conexión va a `localhost:993` o al socket, sin abrir puertos.
* Las notificaciones de Android llegan por la API autenticada existente (token de sesión de la app, `Idempotency-Key`).

### 4.3 Auditoría

Se registra cada alta, pausa, reanudación y borrado de una fuente, cada consentimiento con un agregador, cada *run* (inicio,
fin, conteos, código de error) y cada decisión sobre un evento (propuesto, confirmado, descartado, cruzado con...). Va al
registro de auditoría del FMS (regla 3), con quién y cuándo y sin contenido en claro. El admin de Django muestra solo conteos
por fuente y estado, como el resto del FMS.

### 4.4 Modelo de amenazas

| Amenaza | Canal | Mitigación |
|---|---|---|
| **Suplantación de correo**: alguien escribe al buzón con `From:` del banco y mete movimientos falsos | Correo | Se exige una **firma DKIM válida** con `d=` alineado a un dominio de la lista del banco (datos con vigencia, no código). Si el correo llega reenviado y la firma original se rompe, se acepta solo un **ARC** sellado por el reenviador que el usuario declaró (p. ej. `google.com`) que diga `dkim=pass` para el dominio del banco. Todo lo demás se descarta y se cuenta. Además: nunca se autoconfirma sin regla explícita; el extracto concilia; la dirección de ingesta lleva un sufijo aleatorio por usuario (`alertas+<token>@...`), rotable |
| *Phishing* dentro de un correo legítimo (enlaces) | Correo | No se sigue ningún enlace ni se cargan recursos remotos; se analiza el texto con un lector HTML sin red; solo se extraen campos con patrones estrictos por banco |
| Correo hostil (bombas, adjuntos, codificaciones raras) | Correo | Tope de tamaño (256 KB), adjuntos ignorados (salvo PDF de extracto en una fase posterior, con el tratamiento de archivos hostiles del importador), sin `eval` de nada, tiempos máximos por mensaje |
| Repetición (el mismo correo dos veces, o reenviado) | Correo | Idempotencia por HMAC de `Message-ID` más un HMAC del contenido normalizado; huella ciega por fila (la del importador) |
| Robo de la contraseña IMAP | Correo | Buzón **dedicado** que solo recibe alertas (no es el correo personal); contraseña de aplicación cifrada con la DEK; solo lectura y borrado de lo procesado; revocable |
| Una app maliciosa publica una notificación con la apariencia del banco | Android | Filtro por **nombre de paquete** de la lista blanca **y** firma del instalador del paquete (`PackageManager`, certificado esperado) [?]; el servidor trata el evento como propuesta |
| Fuga de notificaciones ajenas (chats, OTP) | Android | Filtro **en el dispositivo** antes de salir: solo paquetes de la lista blanca; se descartan textos con forma de OTP; nada se guarda en disco (regla de la app móvil); Android 15 ya oculta las notificaciones sensibles a los *listeners* no confiables |
| Webhook falsificado o repetido | Agregador | HMAC, marca de tiempo, ids vistos, IP; cuerpo no confiable (§4.2) |
| El agregador es comprometido | Agregador | Solo productos de lectura; ningún dato nuestro va hacia él; tokens revocables; un tercero que no acepte borrar el enlace queda descartado |
| Inyección de fórmulas o de texto en las descripciones | Todos | Lo mismo que el importador: celdas como texto, neutralización al exportar, longitudes máximas |
| Desbordar el libro (miles de eventos) | Todos | Tope de eventos por fuente y día; la cola de propuestas se pagina; alerta al propietario si se supera |
| Root del VPS con la KEK | Todos | Límite honesto ya documentado en el plan técnico §2: puede descifrar; no hay contraseñas del banco que robar |

### 4.5 Privacidad del lector de notificaciones

`NotificationListenerService` lo concede la persona en Ajustes, y da acceso a **todas** las notificaciones del teléfono. Aunque
el APK se instala fuera de Play (su política no aplica), el FMS se impone las mismas reglas: opt-in explícito con pantalla
propia, lista blanca de paquetes visible y editable, filtrado en el dispositivo, un contador de «enviadas hoy», un botón de
apagado, y nada se guarda en disco. Si la app muere sin red, los eventos en memoria se pierden; lo recupera el extracto. Si el
propietario prefiere no perder nada, la alternativa (una cola en disco cifrada con una llave del Keystore) **rompe una regla
de la app móvil** y necesita su decisión (pregunta Q6).

## 5. Arquitectura

### 5.1 Una app nueva: `apps/finance_sync` (backend del CV) más `domain/finance/sync/`

```
domain/finance/sync/            (Python puro, sin Django: import-linter)
  events.py      Observation: fecha, monto Decimal, signo, descripción, comercio, últimos4, institución, canal, ref
  email/         un analizador por banco (bancolombia.py, avvillas.py, nu.py...), versionado; entrada: texto ya verificado
  push/          un analizador por paquete Android
  normalize.py   Observation -> domain.finance.importing.Row (el mismo Row del importador)
apps/finance_sync/
  models.py      SyncSource, SyncEvent, SyncRun (OwnerScopedModel; con ámbito personal u Hogar)
  connectors/    base.py (Protocol), imap.py, android.py, aggregator_belvo.py (fase 4), openfinance.py (fase 5)
  dkim.py        verificación DKIM y ARC (nueva dependencia: dkimpy, con ≥ 2 semanas publicada)
  services.py    ingest(observations) -> classify -> propuesta / cruce; decide(evento)
  tasks.py       poll_imap (beat cada 5 min), refresh_aggregator (diaria), purge_events (retención)
  fms_views.py   sources CRUD, events (lista y decisión), android/ingest
```

**Interfaz de conector** (lectura pura):

```python
class Connector(Protocol):
    kind: str                                  # "imap" | "android" | "aggregator" | "openfinance"
    def fetch(self, source: SyncSource, cursor: str | None) -> tuple[list[Observation], str | None]: ...
    def revoke(self, source: SyncSource) -> None: ...
    # Sin pay/transfer/write: una prueba falla si aparece un método así.
```

**Modelos** (todo campo con contenido va cifrado; en claro solo ids, fechas, estado, tipo y versión de llave):

* `SyncSource`: dueño y ámbito, `kind`, institución (código), cuenta del libro destino (o reglas «últimos4 → cuenta»), estado
  (`active`, `paused`, `error`, `revoked`), regla de autoconfirmación, configuración cifrada (token, dirección de ingesta,
  contraseña IMAP), `last_success_at`, cursor.
* `SyncEvent`: la observación normalizada y cifrada, HMAC ciego para idempotencia, estado (`received`, `proposed`, `matched`,
  `confirmed`, `discarded`, `rejected_auth`, `parse_error`), enlace al movimiento creado o cruzado y al `ImportBatch`.
* `SyncRun`: conteos por estado, duración y código de error. Sin contenido.

### 5.2 Reutilizar el importador (no un segundo motor)

* `normalize` produce el mismo `Row` que `domain/finance/statements` y `domain/finance/importing.classify(rows, candidates)`
  decide `new`, `matches_pending`, `matches_confirmed`, `possible_duplicate` o `duplicate` con su ventana de días.
* `apps/finance_import` gana una entrada `commit_rows(owner, account, rows, origin="sync", source_id=...)` que comparte el núcleo
  de `commit` (candado del dueño, todo o nada, huellas, `ImportBatch` con `kind="sync"`). Así **deshacer**, la conciliación y la
  inmutabilidad de lo conciliado salen gratis. Cada *run* que crea propuestas abre un lote; deshacerlo anula con reverso.
* **Cruce entre canales:** el correo de una compra y la fila del extracto describen lo mismo con textos distintos. Cuando la fila
  llega, `classify` la cruza por cuenta, monto exacto y ventana de fecha (la del correo es la del evento y la del extracto puede
  ser la de aplicación), y la descripción se compara solo como desempate (`similar`). Resultado: `matches_pending`, de modo que el
  extracto **confirma** la propuesta en vez de duplicarla. La huella de la fila del extracto queda enlazada al movimiento.
* **Movimientos manuales:** si el usuario ya registró el gasto, el evento cruza con su pendiente o confirmado y queda enlazado,
  **sin modificarlo**. Si el monto difiere (p. ej. una propina, o una compra en dólares), se muestra la diferencia y se ofrece un
  ajuste; nunca se reescribe solo. Lo conciliado es inmutable (regla 5): una diferencia contra un conciliado genera una propuesta
  de ajuste auditable.
* **Tarjetas:** las alertas de compra con TC van a la cuenta de pasivo de la tarjeta. El importador de tarjetas
  (`feat/fms-card-import`, en curso) define cómo cruzan con el extracto de la tarjeta; `finance_sync` se monta encima cuando
  esté integrado.

### 5.3 Celery

* `finance_sync.poll_imap`: *beat* cada 5 minutos. Lee los no procesados, verifica DKIM/ARC, analiza, ingiere, marca o borra el
  mensaje. Es idempotente (HMAC de `Message-ID`) y tiene un candado por fuente para no ejecutarse dos veces a la vez.
* `finance_sync.refresh_aggregator` (fase 4): diaria, con reintentos exponenciales; si el webhook avisa, se adelanta.
* `finance_sync.purge_events`: borra los `SyncEvent` descartados o rechazados a los 30 días (retención, a confirmar).
* `finance_sync.health`: si una fuente activa no produce nada en N días (configurable por banco), avisa al dueño. Así se
  detecta que el banco cambió el formato del correo o que el *listener* se apagó.
* Todo con America/Bogotá para las fechas de negocio y UTC para los instantes.

### 5.4 Hogar

* Una fuente pertenece a **un** ámbito: el personal de su dueño o un Hogar del que es miembro con rol que permita escribir.
  Sus eventos se cifran con la DEK del ámbito (la del Hogar, envuelta por miembro: `finance_household`).
* Los correos y notificaciones son de una persona: la fuente es suya aunque deposite en una cuenta del Hogar. Al salir del Hogar
  o al ser expulsado, sus fuentes hacia el Hogar se **pausan** (no se borran los movimientos ya creados).
* Cada miembro tiene su propia dirección de ingesta; nadie ve la configuración de la fuente de otro (solo «miembro X tiene una
  fuente activa hacia esta cuenta»).

### 5.5 Frontend y móvil

* Web (`/finanzas`): «Conexiones» en Configuración (alta guiada por banco, estado, última lectura, pausar o borrar) y una
  bandeja **«Por revisar»** (propuestas con confirmar, descartar o editar categoría), integrada al Resumen como contador.
* Android: el *listener* como módulo nativo propio con un *config plugin* de Expo en `mobile/plugins/` (el *prebuild* ya existe),
  aislado en un único módulo como las demás API sensibles (`src/sync/notification-listener.ts`), con su prueba en
  `guards.test.ts`. Pantalla de activación con la explicación de §4.5.
* Dinero como cadenas decimales de punta a punta (`core/money.ts`). El analizador de push manda la **cadena** tal como aparece;
  el servidor la convierte a `Decimal`. Nunca `Number`.

## 6. Hoja de ruta

### Fase 0: *spikes* (1 a 2 semanas; sin código de producción)

| # | Spike | Sale con |
|---|---|---|
| S1 | Correos reales de **Bancolombia, AV Villas y Nu** (y Nequi si manda): qué operaciones generan correo, con qué topes, remitente, dominio DKIM, si sobrevive al reenvío de Gmail o de Virtualmin, y el formato | Por banco: lista de dominios `d=`, 3 o más ejemplos **sintéticos** (montos y comercios inventados) para las pruebas, y un sí o no |
| S2 | *Listener* en el teléfono del propietario (versión de Android, ahorro de batería del fabricante, texto que muestran Nequi y Nu, si truncan) | APK de prueba, texto de ejemplo **sintético**, tasa de pérdida observada en una semana |
| S3 | Extractos de cada institución: formato (CSV, XLSX, OFX o PDF), si el PDF tiene contraseña, si es texto o imagen | Tabla de formatos; decide si hace falta un lector PDF (dependencia nueva: `pypdf` o `pdfplumber`) |
| S4 | Cotización real de Belvo y Floid (y Prometeo solo si ofrece *widget*): cobertura de estas instituciones, método (credenciales u Open Finance), precio para un usuario, residencia de datos, términos para uso personal | Solo si el propietario lo autoriza (Q2) |
| S5 | Legal: el texto de privacidad del FMS cubre el tratamiento de correos y notificaciones | Borrador para el flujo F9-13 |
| S6 | Confirmar el estado regulatorio (cronograma definitivo, decreto de prórroga, sección II de la CE 010) | Nota de actualización de §2 |

### Fase 1: MVP del canal de correo y de la bandeja «Por revisar»

Alcance: `finance_sync` con `imap`, analizadores de los bancos que pasaron S1 (se espera Bancolombia y AV Villas), la bandeja
«Por revisar» en la web y el cruce con el extracto vía `commit_rows`.

Criterios de aceptación:

1. Un correo de alerta válido produce **una** propuesta en la cuenta correcta (por «últimos 4») en menos de 10 minutos.
2. El mismo correo procesado dos veces, o reenviado, produce **0** propuestas nuevas.
3. Un correo con `From:` del banco **sin** DKIM válido alineado (ni ARC del reenviador declarado) se rechaza
   (`rejected_auth`) y no toca el libro.
4. Importar después el extracto del mes **confirma** las propuestas en lugar de duplicarlas; las que el extracto no trae quedan
   señaladas.
5. «Deshacer» el lote de un *run* anula con reverso lo que creó; si algo ya está conciliado, se niega (`immutable_entry`) y no
   queda nada a medias.
6. Un movimiento manual previo cruza y queda enlazado sin cambiar su monto.
7. Ningún monto ni descripción aparece en registros, en métricas ni en las respuestas de error.
8. Otro usuario no ve ni la fuente ni los eventos (404), y la prueba que recorre todos los endpoints con dos usuarios incluye los
   de `sync`.
9. Una fuente que deja de producir eventos en N días genera un aviso.

Pruebas: analizadores con *fixtures* sintéticos y dorados por banco y versión; Hypothesis sobre el analizador (nunca lanza nada
fuera de `ParseError`, nunca devuelve `float`); DKIM con claves de prueba (válido, inválido, dominio no alineado, ARC);
idempotencia; `commit_rows` y `undo`; aislamiento; `caplog` sin contenido; `import-linter` (dominio sin Django; conectores sin
escritura). Si se toca nginx: `uv run pytest tests/deploy` y `deploy/nginx/test/run.sh check`.

### Fase 2: notificaciones de Android (Nequi y Nu)

Alcance: módulo nativo más *config plugin*, pantalla de activación y lista blanca, `android/ingest` con `Idempotency-Key`.
Criterios: solo salen eventos de los paquetes de la lista; un texto con forma de OTP nunca sale; al apagar el permiso, nada se
envía; nada se escribe en disco (`guards.test.ts`); la propuesta cruza con el correo del mismo movimiento (si ambos llegan, hay
**una** sola propuesta).

### Fase 3: extractos en PDF y créditos

Alcance: lector PDF de texto (no OCR) para los formatos de S3, con el tratamiento de archivo hostil del importador; ICETEX y
el crédito de AV Villas por extracto para conciliar saldo y cuota con `finance_credit`; patrimonios autónomos (extracto de la
fiduciaria) como saldo de activo, sin movimientos detallados.
Criterios: el mismo PDF dos veces importa 0; un PDF con JavaScript, adjuntos o cifrado desconocido se rechaza con código
estable; los saldos del extracto concilian con el libro.

### Fase 4 (opcional): agregador con *widget*

Solo si el propietario acepta el costo y el tercero (Q1, Q2) y S4 encontró uno que cumpla §4.1. Conector `aggregator_<x>`,
webhook con firma (§4.2), tokens cifrados y revocación que borra el enlace en el agregador. Criterios: ninguna petición de
nuestro servidor lleva credenciales del banco (prueba sobre el cliente HTTP); revocar deja de recibir datos y borra el token;
un webhook sin firma válida no cambia nada.

### Fase 5: finanzas abiertas reguladas

Cuando la SFC expida los estándares de historial transaccional (y si para entonces existe una vía para un receptor como el
FMS), un conector `openfinance` con OAuth y consentimiento del estándar. Se reevalúa con cada circular nueva.

## 7. Preguntas para el propietario

| # | Pregunta | Por qué importa |
|---|---|---|
| Q1 | ¿Cuál es el presupuesto mensual para esto? (0, menos de 20 USD, del orden de 1.000 USD) | Decide si un agregador es siquiera opción (Belvo Launch: 1.000 USD/mes) |
| Q2 | ¿Aceptas, en principio, que un tercero (agregador) tenga tus credenciales bancarias a través de su *widget*? | Sin esto, la fase 4 no existe y S4 no se hace |
| Q3 | ¿Creamos un **buzón dedicado** para las alertas? ¿En el VPS (Virtualmin, dominio propio) o en un proveedor externo? ¿Y cómo llegan los correos: el banco escribe directo a ese buzón o reenvías con un filtro desde tu correo? | Define DKIM frente a ARC, la superficie de ataque y si hace falta la API de Gmail (alcance restringido, verificación de Google): se evita con un buzón propio |
| Q4 | ¿Qué alertas tienes activas hoy en cada banco y con qué tope mínimo? ¿Estás dispuesto a bajar el tope a 0 para que todo genere correo? | Cobertura real del canal de correo |
| Q5 | ¿Activamos el **lector de notificaciones** en tu Android? ¿Qué versión y fabricante es el teléfono? | Fase 2; ahorro de batería y Android 15 |
| Q6 | Si la app muere sin red, ¿aceptas perder esos eventos (los recupera el extracto) o prefieres una cola en disco cifrada con el Keystore, lo que rompe la regla «nada financiero en disco»? | Regla de la app móvil |
| Q7 | ¿Las propuestas se confirman siempre a mano, o quieres autoconfirmar alguna fuente (p. ej. compras con TC de Bancolombia)? | §4.1, punto 6 |
| Q8 | ¿Qué es exactamente **Pexto Capital** para ti (qué producto, qué entidad) y qué recibes de los **patrimonios autónomos** (extracto mensual, certificado)? | No se pudo identificar con fuentes públicas |
| Q9 | ¿Retención de eventos descartados: 30 días está bien? ¿Se guarda el correo original (cifrado) para depurar un analizador, o nunca? | Privacidad frente a depuración |
| Q10 | ¿El SMS queda descartado? (Leer SMS da acceso a los OTP; se propone no hacerlo) | Superficie de riesgo |
| Q11 | ¿Esto se abre a otros usuarios del FMS y del Hogar desde el inicio, o primero solo para ti? | Dirección de ingesta por usuario, texto legal y carga de soporte de los analizadores |

## 8. Fuentes (consultadas el 2026-11-14)

Regulación:

* SFC, Proyecto de carta circular, 31-ago-2026: «Cronograma para la expedición de estándares de intercambio de información en el
  sistema de finanzas abiertas» (página y documento adjunto) [P]:
  https://www.superfinanciera.gov.co/publicaciones/10116237/proyecto-de-carta-circular-agosto-31-de-2026/
* URF, «Ajustes en los plazos de implementación del sistema de finanzas abiertas obligatorio», documento técnico, sep-2026 [P]:
  https://www.urf.gov.co/documents/283253/3555757/003_Documento_Tecnico.pdf
* Presidencia, Decreto 0368 del 7 de abril de 2026 (PDF; no se pudo descargar en esta sesión) [P no leído]:
  https://dapre.presidencia.gov.co/normativa/normativa/DECRETO%20No.%200368%20DEL%2007%20DE%20ABRIL%20DE%202026.pdf
* Holland & Knight, «SFC propone nuevas reglas para implementar el sistema de finanzas abiertas», jul-2026 [S]:
  https://www.hklaw.com/en/insights/publications/2026/07/sfc-propone-nuevas-reglas-para-implementar-el-sistema-de-finanzas
* Pérez-Llorca, «Colombia issues Open Finance Decree and narrows the scope», 24-abr-2026 [S]:
  https://www.perezllorca.com/en-co/news/legal-guide/colombia-open-finance-decree-0368-2026-narrowed-scope/
* Yarumo, «Open Finance: who is required and what data must be exposed» [S]:
  https://www.yarumo.ai/en/blog/open-finance-who-is-required-and-what-data-to-expose
* Fiskil, «Colombia open finance tracker» [S]: https://www.fiskil.com/open-finance-tracker/colombia
* AFIC, sobre la Circular Externa 001 de 2026 [S]:
  https://afic.com.co/sfc-ajusta-el-cronograma-de-finanzas-abiertas-en-colombia-conoce-las-nuevas-fechas-limite/

Bancos:

* Bancolombia, centro de ayuda para desarrolladores (catálogo: APIs de empresas y aliados) [P]:
  https://soportedeveloper-portal.bancolombia.com/hc/es-419
* Bancolombia, soporte: «¿Esta API me permite consultar información de una cuenta?» (alcance: solo titularidad) [P, vía resultado de búsqueda]:
  https://soportedevs.bancolombia.com/hc/es-419/articles/14564107863060--Esta-API-me-permite-consultar-informaci%C3%B3n-de-una-cuenta
* Bancolombia, canales y alertas por correo o SMS [P]: https://bancolombia.com/centro-de-ayuda/canales/sucursal-telefonica
* Portafolio, «Tus Bancos» en la app de Bancolombia, 6-may-2023 [S]:
  https://www.portafolio.co/economia/finanzas/7-8-millones-de-clientes-de-app-bancolombia-con-open-banking-582443
* La República, Aval API Market, jul-2026 [S]:
  https://www.larepublica.co/finanzas/grupo-aval-lanzo-aval-api-market-para-integrar-soluciones-financieras-y-tecnologicas-4442163
* Valora Analitik, entrevista a Grupo Aval sobre finanzas abiertas [S]: https://www.valoraanalitik.com/grupo-aval-aprovechar-finanzas-abiertas/
* LatamFintech, acuerdo Belvo–Nequi, 23-feb-2024 [S]:
  https://www.latamfintech.co/articles/fintechs-belvo-y-nequi-realizan-el-primer-acuerdo-de-open-finance-en-colombia
* EBANX, Nequi como medio de pago (push, QR) [S]:
  https://docs.ebanx.com/docs/payments/guides/accept-payments/api/colombia/nequi
* Nu Colombia, política de tratamiento de datos (canales de comunicación) [P]:
  https://contracts.nu.com.co/legal-documents/nu-SA-data-policy-version-1.pdf
* Colombia Tramita, consultar el estado de cuenta en ICETEX [S]: https://colombiatramita.co/educacion/consultar-saldo-icetex/

Agregadores:

* Belvo, planes y precios (Sandbox gratis; Launch 1.000 USD/mes; Growth a la medida) [P]: https://belvo.com/plans-and-pricing/
* Belvo, objeto «Institution» (tipos de conexión: credenciales u Open Finance) [P]:
  https://developers.belvo.com/apis/belvoopenapispec/institutions/institutionpublicapi
* Belvo, ISO 27001 [P]: https://belvo.com/blog/belvo-doubles-down-commitment-security-achieves-iso-27001/
* LatamFintech, Monet y Belvo (bancos colombianos cubiertos), 18-sep-2023 [S]:
  https://www.latamfintech.co/articles/fintechs-monet-y-belvo-revolucionan-el-acceso-al-credito-en-colombia-a-traves-del-open-finance
* Prometeo, `POST /login/` con usuario y contraseña del banco [P]: https://docs.prometeoapi.com/reference/login
* Open Banking Tracker, Floid en Colombia (directorio, generado automáticamente) [S]: https://www.openbankingtracker.com/floid-io
* TechCrunch, Fintoc (Chile y México), 25-abr-2024 [S]: https://techcrunch.com/2024/04/25/fintoc-a2a-payments-chile-mexico
* LatamFintech, Minka Payments Hub (infraestructura de pagos Bre-B, no agregación) [S]:
  https://www.latamfintech.co/articles/minka-lanza-payments-hub-en-colombia-para-convertir-la-conexion-a-bre-b-en-nuevas-lineas-de-negocio

Canales sin tercero:

* Android Authority, Android 15 y las notificaciones sensibles para *listeners* no confiables [S]:
  https://androidauthority.com/android-15-sensitive-notifications-3416414
* Google, preguntas frecuentes sobre la verificación de OAuth (alcances restringidos como `gmail.readonly`) [P]:
  https://support.google.com/cloud/answer/13463817

---

## Apéndice A: ADR-020 propuesto: sincronización de solo lectura con entidades financieras

*(Texto propuesto para el repo del CV, `docs/adr/`. Número a confirmar por quien dirige; lo aprueba el propietario.)*

**Estado:** propuesto.

**Contexto.** El FMS (ADR-019) importa extractos (CSV, XLSX y OFX) con huella ciega, cruce y deshacer. El propietario pide leer
movimientos de sus bancos de forma automática, **sin** iniciar pagos ni transferencias. En Colombia no hay hoy una vía regulada
para que una app personal lea movimientos: el Decreto 0368 de 2026 deja a los no vigilados detrás de acuerdos bilaterales, y el
cronograma propuesto por la SFC sitúa el estándar de historial transaccional a 84 y 96 meses. Los bancos no tienen APIs para
personas. Los agregadores cuestan desde 1.000 USD/mes o exigen credenciales por API.

**Decisión.**

1. Se crea `apps/finance_sync` con conectores de **solo lectura** detrás de una interfaz sin operaciones de escritura hacia la
   entidad. Todo evento entra por el flujo del importador (`classify` y `commit_rows`, `ImportBatch kind=sync`).
2. Canales aprobados: correo de alerta (con DKIM o ARC obligatorios), notificaciones del Android propio (opt-in, filtradas en
   el dispositivo) y extractos (incluido PDF de texto). Un agregador se añade solo con *widget* propio del agregador y con un
   ADR o enmienda aparte.
3. **El FMS nunca recibe, guarda ni transmite credenciales bancarias.** Se prohíbe un conector que las pida por nuestro servidor.
4. Lo que se guarda (tokens, configuración, eventos) se cifra con la DEK del ámbito; nada de contenido en registros, URLs ni
   métricas.
5. Los eventos son **propuestas**; se confirman a mano o con una regla de autoconfirmación por fuente elegida por el usuario. El
   extracto concilia. Lo conciliado sigue siendo inmutable.
6. Los webhooks (si los hay) van en una ruta propia de nginx, con firma HMAC, marca de tiempo y anti-repetición; toda ruta nueva
   pasa por `check_attack_terms` y por `test_nginx.py`.
7. El SMS no se lee.

**Consecuencias.** Cobertura parcial y dependiente de formatos que el banco cambia sin aviso (se vigila con la tarea `health` y
con *fixtures* versionados). Sin costo de terceros. Riesgo nuevo: suplantación de correo (mitigado con DKIM o ARC, propuestas y
conciliación) y la lectura de notificaciones en el teléfono (mitigada con opt-in y lista blanca). Dependencia nueva: `dkimpy`
(y un lector PDF si la fase 3 lo confirma), con al menos dos semanas de publicadas. Se reevalúa cuando la SFC expida el estándar
de historial transaccional.

**Alternativas descartadas.** Prometeo u otro agregador que pida credenciales por API (viola el punto 3). La API de Gmail con
`gmail.readonly` (alcance restringido, verificación de Google y CASA al superar el uso personal; se prefiere un buzón propio por
IMAP). Lectura de SMS (acceso a OTP). Esperar al canal regulado (años).
