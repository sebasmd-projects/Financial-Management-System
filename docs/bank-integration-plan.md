# FMS: plan de integración con los bancos (solo lectura)

Estado: **versión 3, con las segundas respuestas del propietario** (2026-11-14). La fase 1 del backend (tickets B1 a B7 y B11 a B15) está en la rama
`feat/fms-email-sync` del repo del CV, pendiente de revisión; B8 a B10 esperan al *spike* S1 (§7). Lo que aquí se decide de arquitectura o de seguridad
necesita un ADR nuevo (apéndice A); los agentes no editan ADR.

Pedido del propietario (literal): «Empieza con la planeación para la integración con los propios bancos, no hace envíos,
transferencias, únicamente lectura de movimientos».

Decisiones del propietario que este plan aplica: [reglas del propietario, 2026-11-14](owner-rules.md#2026-11-14-integración-con-los-bancos-solo-lectura) y
[segundas respuestas](owner-rules.md#2026-11-14-integración-con-los-bancos-segundas-respuestas).
Documentos relacionados: [plan técnico](technical-plan.md), [diseño](design-spec.md). En el repo del CV: `docs/adr/ADR-019-fms-finanzas.md`,
`backend/apps/finance_import/README.md` (el importador que se reutiliza), `backend/apps/finance_automation/README.md` (reglas propias) y
`backend/apps/finance_household/README.md` (Hogar).

Convención de confianza en las fuentes: **[P]** fuente primaria leída (texto oficial), **[S]** fuente secundaria (prensa,
bufetes, directorios), **[?]** sin confirmar: lo resuelve un *spike* de la fase 0.

---

## 1. Resumen ejecutivo y recomendación

1. **No hay vía regulada ni API de banco para una app personal** (§2 y §3). Las finanzas abiertas obligatorias (Decreto 0368 de 2026) no
   llegan al historial transaccional antes de unos 84 a 96 meses según el proyecto de cronograma de la SFC, y un receptor no vigilado
   necesita un acuerdo bilateral con cada banco. Ningún banco del propietario publica una API de movimientos para personas.
2. **Ningún agregador cabe en 20 USD al mes.** Belvo publica 1.000 USD/mes como su plan de producción más barato; Floid y Prometeo no
   publican precios y sus API reciben usuario y contraseña del banco en el cuerpo de la petición (hay *widget* en Floid, pero sin precio
   público). Se mantiene como opción condicionada (fase 4): solo con *widget* propio, segundo factor, certificación y dentro del presupuesto.
3. **Canal recomendado para la fase 1: una dirección de reenvío única por conexión** (`<token>@<subdominio de ingesta>`). El usuario
   crea en **su propio correo** (Gmail, Outlook, el que sea) un filtro que reenvía **solo** los correos de su banco a esa dirección. El
   FMS:
   * recibe únicamente los correos del banco, nunca el buzón entero;
   * no guarda ninguna credencial del correo ni del banco;
   * verifica la **firma DKIM del banco** (o el sello ARC del proveedor que reenvía);
   * extrae movimientos y **extractos adjuntos**;
   * guarda el original cifrado con la DEK solo 30 días, para depurar;
   * propone el movimiento: **Aprobar | Modificar | «Ir al correo»**.

   Funciona igual para cualquier usuario y para el Hogar. Cuesta **0 USD** adicionales sobre el VPS y el dominio que ya existen.
4. **Por qué no leer el buzón con OAuth o IMAP** (§4.1): `gmail.readonly` es un alcance **restringido** de Google. Una app pública
   necesita verificación y una **evaluación de seguridad anual (CASA)**: según los laboratorios, entre ~500 y ~5.400 USD al año. Eso
   está por encima de los 240 USD anuales del presupuesto. IMAP con contraseña de aplicación obliga a **guardar una credencial que abre
   todo el buzón (y permite enviar)**, lo que choca con la regla de no guardar credenciales. Microsoft Graph `Mail.Read` es viable sin
   costo para cuentas personales de Outlook y queda como opción de la fase 2 para quien no pueda reenviar (p. ej. una cuenta de trabajo
   que bloquea el reenvío externo).
5. **Fuera:** lector de notificaciones de Android y SMS (decisión del propietario), y Pexto Capital y patrimonios autónomos en la fase 1.
6. **Reglas de autoconfirmación** sobre `finance_automation`: el sistema sugiere una regla al ver un patrón (p. ej. la nómina) y el
   usuario puede escribir la suya. Nada se confirma solo sin una regla que el usuario aceptó.

**Costo estimado:** 0 USD/mes en la fase 1 (correo entrante en el VPS y DNS en Virtualmin, ya pagados; almacenamiento de unos
15 MB por usuario y mes de originales cifrados, borrados a los 30 días). El presupuesto de 20 USD/mes queda libre para un agregador si
alguno cotiza dentro de él (fase 4), o para un servicio de correo entrante gestionado si el VPS no pudiera recibir correo (§4.2).

## 2. Regulación colombiana (estado al 2026-11-14)

| Norma | Qué dice para este plan | Confianza |
|---|---|---|
| Decreto 1297 de 2022 | Primer marco, **voluntario**: las entidades vigiladas pueden tratar datos con autorización expresa e informada del consumidor. | [P] lo cita la carta circular de la SFC |
| Circular Externa 004 de 2024 (SFC, 7-feb-2024) | Estándares tecnológicos y de seguridad, consentimiento y lineamientos para esquemas con terceros no vigilados. Plazos prorrogados por la CE 009 de 2025 y la CE 001 de 2026 (3-feb-2026). | [P] mención en la carta circular; [S] prórrogas |
| **Decreto 0368 de 2026** (7-abr-2026) | **Sistema obligatorio** para las entidades vigiladas del art. 2.35.8.2.3 del Decreto 2555 de 2010. Ser receptor es voluntario. Los datos son **gratuitos** (solo cabe recuperar costos limitados de infraestructura). Cronograma de estándares en 6 meses y **Directorio de Participantes** en 12. Cada estándar se habilita en los 12 meses siguientes a su expedición (prorrogable 6). | [P] art. 3 (transcrito en la carta circular); [S] el resto |
| Decreto 977 de 2026 (4-ago-2026) | **Portabilidad financiera** como caso de uso del sistema, con 24 meses para sus estándares. | [P] transcrito en la carta circular |
| Proyecto de CE 010 de 2026 | Terceros **vigilados**: autorizados e inscritos en el directorio. **No vigilados**: solo a través de un proveedor vigilado con acuerdo bilateral, y solo con los clientes de ese acuerdo. Cifrado en reposo y en tránsito, PCI-DSS con datos de tarjetas. Los esquemas de la CE 004 se adecúan antes del 7-abr-2027. 651 observaciones. | [S] Holland & Knight; [P] cifra (URF) |
| Proyecto de carta circular (31-ago-2026): cronograma | Plazos máximos desde la publicación del cronograma (meses): portabilidad de consumo 8, hipotecario 16, comercial 24; características de productos de crédito 36, captación 48, seguros 60, inversión 72; **historial transaccional de créditos 84**; **de depósitos a la vista 96**; vinculación 108; CDT 120; **iniciación de pagos 132**. | [P] texto del proyecto |
| Proyecto de decreto (URF, sep-2026) | Propone **6 meses más** para cada plazo de la SFC. | [P] documento técnico de la URF |

**Sin confirmar:** si el cronograma definitivo ya salió y conserva los 84 y 96 meses; si el decreto de prórroga se expidió; el detalle
del consentimiento (la sección II de la CE 010 no se había publicado); el costo de inscribirse en el directorio.

**Para el FMS:** no es receptor vigilado y, para ser no vigilado, necesitaría una persona jurídica y un acuerdo por banco. La Ley 1581
de 2012 (habeas data) rige lo que el propio FMS trata. Eso ya lo cubren el flujo legal F9-13 y el *crypto-shredding*; el texto de
privacidad se amplía para los correos (fase 0, S5).

## 3. Qué ofrece cada institución

| Institución (productos) | API para personas | Agregadores | Correo de alerta | Extracto | Fase 1 |
|---|---|---|---|---|---|
| **Bancolombia** (ahorros) | No: portal para empresas; la API de validación de cuentas excluye saldos y movimientos [S] | Belvo, Floid, Prometeo [S] | **Sí**, por correo o SMS, con **montos mínimos configurables** y Clave Dinámica para inscribirse [P] | Sucursal Virtual [P]; formato [?] | **Sí**: alertas más extracto adjunto si llega por correo |
| **AV Villas** (ahorros, TC, crédito) | No: el Aval API Market es para empresas [S] | Belvo [S] | Probable [?] | Banca virtual [?] | Sí, si S1 lo confirma |
| **Nequi** (ahorros, crédito) | No: Nequi Conecta es de cobros [S] | Belvo, Floid [S] | **No consta**: los movimientos se avisan por **SMS** (85954) y push [S] | **Extracto en PDF al correo** desde la app («Enviar al correo») [S] | Solo **extractos** por correo, activado desde la app (§5.6) |
| **Nu Colombia** (ahorros, TC) | No [S] | Sin evidencia | Su política de datos prevé correo, SMS, WhatsApp y push [P] | Extracto de la TC en la app [?] | Alertas o extractos por correo según S1, activado desde la app (§5.6) |
| **ICETEX** (crédito educativo) | No | No | Avisos de cobro [?] | «Mi Portal»: estado de cuenta en PDF [S] | Extracto (subida manual o reenvío) |
| **Pexto Capital**, **patrimonios autónomos** | — | — | — | — | Fuera de la fase 1 (el propietario no los tiene identificados) |

### 3.1 El monto mínimo de las alertas (texto para los usuarios)

> Los bancos solo te mandan correo de una compra, un retiro o una transferencia si **supera un monto mínimo** que el banco trae por
> defecto o que tú configuraste. Con un mínimo de, por ejemplo, $100.000, una compra de $30.000 no genera correo y el FMS no se entera
> hasta el extracto. **Pon ese mínimo en $0 (o en el valor más bajo que el banco permita)** para que **cada** movimiento te llegue por
> correo. El FMS solo lee los correos que tu filtro le reenvía; el resto de tu correo nunca sale de tu buzón.

Dónde se cambia, por banco:

* **Bancolombia** [P]: en la **Sucursal Virtual Personas**, en la Sucursal Telefónica o en una oficina, en el servicio «Alertas y
  Notificaciones». Ahí se elige el canal (correo o SMS) y los **montos o topes mínimos**. Hace falta la **Clave Dinámica** activa. Si no
  personalizas los topes, se aplican los del banco.
* **AV Villas, Nu, Nequi** [?]: no hay una página pública que lo explique. El *spike* S1 lo confirma en la app y en la banca virtual de
  cada uno; la pantalla de «Conectar banco» muestra la ruta exacta cuando se conozca. Nequi, según la prensa, no avisa por correo:
  ahí se usa el extracto.

## 4. Decisiones técnicas difíciles

### 4.1 Cómo leer el correo del usuario

| Opción | Qué ve el FMS | Credencial guardada | Costo | Para quién | Veredicto |
|---|---|---|---|---|---|
| **A. API de Gmail con OAuth** (`gmail.readonly`) | Todo el buzón | *Refresh token* (cifrado) | Alcance **restringido** [P]: verificación de Google más **CASA cada 12 meses** [P]; los laboratorios cotizan de ~500 a ~5.400 USD/año [S]. Sin verificar: aviso de app no verificada, tope de usuarios y solo personas «conocidas personalmente» [P] | Gmail | **No** (excede el presupuesto y ve demasiado) |
| **B. Microsoft Graph** (`Mail.Read`, delegado) | Todo el buzón | *Refresh token* (cifrado) | Cuentas personales de Microsoft pueden consentir [P]; la verificación de editor no tiene costo [S] (exige una cuenta del Microsoft Partner Program y un dominio). En cuentas de trabajo sin verificar se pide aprobación del administrador [S] | Outlook | **Fase 2, opcional**, para quien no pueda reenviar |
| **C. IMAP con contraseña de aplicación** (o XOAUTH2) | Todo el buzón | **Una contraseña que abre todo el buzón**, también para enviar (SMTP). XOAUTH2 en Gmail cae en el mismo alcance restringido que A | 0 | Casi todos | **No**: es guardar una credencial con más poder del necesario |
| **D. Reenvío filtrado a una dirección única por conexión** | **Solo** los correos que el filtro del usuario reenvía | **Ninguna** (la dirección es un identificador, no una clave; se rota) | 0 (correo entrante en el VPS) | Gmail, Outlook.com, Yahoo y todo proveedor con filtros; algunas cuentas de trabajo de Microsoft 365 **bloquean** el reenvío externo [S] | **Recomendada** |

**¿Choca D con «nada de buzón de alertas compartido»?** No en lo que importa. El usuario conecta **su** correo: la regla vive en su
buzón y él decide qué sale. La dirección es **suya y única por conexión**, sin nada en común con otros usuarios. El FMS no guarda el
buzón: cada mensaje se procesa, su original se cifra con la DEK del usuario o del Hogar, y se **borra del servidor de correo en el
mismo paso**. Por dentro sí hay un único servidor de recepción (el del VPS), con una cuenta de servicio desde la que el *worker* lee.
Esa cuenta es del FMS, no del usuario, y nadie la consulta. Si el propietario prefiere evitar incluso eso, la alternativa es B
(o A cuando haya presupuesto), con las contras de la tabla.

**Detalles de D que hay que resolver (spike S2):**

* **Confirmación del reenvío:** Gmail manda un correo de verificación a la dirección de destino antes de permitir el filtro [S], y pide
  un segundo factor al crear o cambiar filtros y al añadir una dirección de reenvío [S]. El FMS reconoce ese correo (DKIM de
  `google.com`) y muestra **solo el código** en la pantalla de la conexión. No hace clic en el enlace por el usuario: así el usuario
  sigue en control y el FMS no actúa en su cuenta. Outlook.com no pide confirmación [?].
* **DKIM tras el reenvío:** el reenvío de un filtro de Gmail conserva el mensaje y la firma del banco, y añade ARC [?]. Se acepta
  `dkim=pass` del dominio del banco; si la firma se rompió, solo un ARC sellado por el proveedor que el usuario declaró (`google.com`,
  `outlook.com`...) con `dkim=pass` para el banco. Cualquier otro correo se rechaza.
* **«Ir al correo»:** se guarda el `Message-ID` (cifrado). En Gmail el enlace es una búsqueda `rfc822msgid:` en la web de Gmail [?].
  En Outlook no hay un enlace equivalente confirmado [?]: si S2 no lo encuentra, «Ir al correo» abre el buzón con la búsqueda por
  remitente y fecha. Con la opción B, Graph da el `webLink` del mensaje.

### 4.2 Recibir correo en el VPS

* **Subdominios de ingesta** dedicados (decisión del propietario): `ingest.<dominio>` y, para los usuarios en español, **`recibir.<dominio>`**, cada uno con su
  MX, servidos por el correo de Virtualmin que ya existe. Son una lista configurable (`FMS_SYNC_INGEST_DOMAINS`, uno por defecto por idioma) y todos se
  enrutan al mismo buzón.
  No mezcla nada con el correo del propietario. Tiene una dirección comodín hacia **un buzón de servicio** y límites de tamaño
  (256 KB por mensaje y 10 MB con adjuntos de extracto).
* El *worker* de Celery lo lee por **IMAP sobre TLS al host** (sin abrir puertos nuevos al exterior; el MX ya escucha en el 25). La
  credencial de esa cuenta de servicio va en `/srv/cv/.env` (`make-env.sh`), no en la base.
* **Sin rutas HTTP nuevas**, así que no cambian nginx ni `COMMON_ATTACK_TERMS`. Si en la fase 2 entra Graph, la ruta de *callback* de
  OAuth va bajo `/api/fms/v1/sync/oauth/microsoft/callback`, con `check_attack_terms`, `cv-locations.conf.template` y `test_nginx.py`.
* Los agentes no tocan el VPS: el registro MX, el subdominio en Virtualmin y la cuenta de servicio los aplica el propietario con un
  procedimiento nuevo en `DEPLOYMENT.md` (ticket T15). Si el VPS no pudiera recibir correo (bloqueo del puerto 25 entrante, reputación),
  el plan B es un servicio de correo entrante gestionado que entregue por webhook firmado. Ese servicio se cotiza dentro de los 20 USD.

### 4.3 Agregadores dentro del presupuesto

| Agregador | Cobertura en Colombia | *Widget* propio | Precio | Seguridad | Veredicto |
|---|---|---|---|---|---|
| Belvo | Bancolombia, AV Villas, Nequi y otros (prensa 2023) [S] | Sí (Connect Widget) [P] | **1.000 USD/mes** (Launch) [P] | ISO 27001 [P] | Fuera del presupuesto |
| Floid | Bancolombia y Davivienda en su documentación [S] | Sí, según su documentación [S]; la API también acepta usuario y contraseña en el cuerpo [P] | Sin precio público; modelo SaaS más un cobro por llamada [S] | Sin certificación pública encontrada [?] | Pedir cotización (S4), solo con *widget* |
| Prometeo | 83 % de cuentas [S] | No consta; `POST /login/` recibe usuario y contraseña [P] | A consultar [S] | [?] | **No** (credenciales por nuestro servidor) |
| Fintoc, Pluggy | No operan en Colombia [S] | — | — | — | No |

Condiciones del propietario para aceptar uno: (1) credenciales solo en la pantalla del agregador, nunca vistas ni guardadas por el FMS;
(2) **segundo factor** como mínimo; (3) certificaciones mínimas (ISO 27001 o SOC 2 y, si toca tarjetas, PCI-DSS); (4) dentro de los
**20 USD/mes**. Hoy ninguno cumple (4) de forma publicada.

### 4.4 Descartados y por qué

* **Lector de notificaciones de Android:** el propietario no quiere permisos adicionales. Además, ese permiso da acceso a todas las
  notificaciones del teléfono.
* **SMS:** mismo motivo; además, leer SMS expone los códigos OTP.
* **API de Gmail (A) e IMAP con contraseña (C):** costo y exceso de privilegios (§4.1).
* **Prometeo y toda API que reciba la contraseña del banco:** viola la regla de no ver credenciales.
* **Finanzas abiertas reguladas:** no disponibles en un plazo útil (§2); se reevalúan con cada circular.

## 5. Diseño

### 5.1 Reglas que no se negocian

1. **Solo lectura por construcción**: ningún conector tiene operaciones que muevan dinero, y una prueba de arquitectura lo verifica.
2. **El FMS nunca ve ni guarda credenciales** del banco ni del correo del usuario (en D no existe ninguna).
3. **La plataforma nunca muestra el correo completo.** La API no tiene ningún endpoint que devuelva el original. Solo se muestran los
   campos extraídos (fecha, monto, tipo, comercio o contraparte, últimos 4) y el enlace «Ir al correo».
4. **Original cifrado solo para depurar**: AES-256-GCM con la DEK del ámbito, datos asociados `sync-original|fuente|evento`; **30 días**
   y se borra. Lo lee únicamente una orden de depuración del servicio (`manage.py fms_sync_debug <evento>`, clasificada en
   `apps/ops/registry.py` como restringida), que muestra el resultado del analizador y las líneas que no encajaron, **sin montos**.
   Los eventos descartados también se borran a los 30 días.
5. **Nada de montos ni descripciones** en registros, métricas, URLs, asuntos de aviso por correo o push (salvo que el usuario active
   `show_amounts_outside_app`).
6. **Nada se confirma solo** sin una regla de autoconfirmación aceptada por el usuario (§5.5). El extracto concilia.
7. **Revocable**: pausar, borrar y **rotar la dirección** de una conexión. Una dirección rotada o borrada rechaza todo lo que le llegue.
8. **MFA y reautenticación** para crear, rotar o borrar una conexión y para crear una regla de autoconfirmación.

### 5.2 Modelo de amenazas

| Amenaza | Mitigación |
|---|---|
| **Suplantación**: alguien que conoce la dirección envía un correo con `From:` del banco | **DKIM** con `d=` alineado a la lista de dominios del banco (datos con vigencia), o ARC del reenviador declarado; si no, `rejected_auth`. La dirección lleva 128 bits al azar y se rota. Propuestas, no confirmaciones, salvo regla. Conciliación con el extracto |
| Una regla de autoconfirmación abusada con un correo falso | Las reglas solo se evalúan sobre eventos con DKIM o ARC válidos **y** de la institución de la conexión. El rango de monto es **opcional** en toda regla (decisión del propietario, Q4): el texto y el tipo bastan |
| Contenido hostil (HTML, adjuntos, bombas) | Tope de tamaño; texto extraído con un lector HTML sin red (no se sigue ningún enlace, no se carga nada remoto); adjuntos aceptados solo PDF, CSV, XLSX u OFX hacia el importador (archivo hostil); todo lo demás se ignora |
| Repetición o reenvíos duplicados | HMAC del `Message-ID` más HMAC del contenido normalizado; huella ciega por fila del importador |
| Lectura del buzón de servicio | Cada mensaje se borra del servidor al procesarlo; el *worker* es el único cliente; la credencial va en `.env`; alerta si el buzón acumula más de N mensajes |
| Fuga entre usuarios u Hogares | El token resuelve **una** conexión, la conexión resuelve **un** ámbito; las celdas se cifran con la DEK de ese ámbito; la prueba de aislamiento con dos usuarios y dos Hogares cubre `sync` |
| Patrones de usuario peligrosos (ReDoS, plantillas) | Las reglas **no aceptan expresiones regulares**: solo «contiene», «empieza por» o «es igual», sobre texto normalizado y con tope de longitud; sin `eval` (como `finance_automation`) |
| Root del VPS con la KEK | Límite honesto ya documentado: descifra; pero no hay credenciales que robar |

### 5.3 Arquitectura

```
domain/finance/sync/               (Python puro, sin Django)
  events.py     Observation (fecha, monto Decimal, tipo, contraparte, últimos4, institución, ref)
  parsers/      un analizador por banco y versión de plantilla (bancolombia.py, avvillas.py, nu.py)
  patterns.py   detección de patrones para sugerir reglas (nómina, suscripciones)
  normalize.py  Observation -> domain.finance.importing.Row
apps/finance_sync/
  models.py     SyncConnection, SyncEvent, SyncOriginal, SyncRun
  mail.py       MIME seguro, DKIM/ARC (dkimpy), confirmación de reenvío
  ingest.py     token -> conexión -> verificar -> analizar -> evento -> propuesta
  tasks.py      poll_ingest (cada 2 min), purge (diaria), health (diaria)
  fms_views.py  connections, events (aprobar, modificar, descartar), deep links
```

* **`SyncConnection`**: dueño, **ámbito** (personal u Hogar), institución, cuenta destino (o «últimos 4 → cuenta», con un HMAC ciego),
  token de dirección (HMAC; el token en claro se muestra solo al crearla o rotarla), proveedor de correo declarado (para ARC y el enlace),
  estado, si incluye extractos, `last_event_at`.
* **`SyncEvent`**: campos cifrados, HMAC de idempotencia, estado (`proposed`, `auto_confirmed`, `approved`, `modified`, `discarded`,
  `rejected_auth`, `parse_error`), enlace al movimiento y al `ImportBatch`, `Message-ID` cifrado.
* **`SyncOriginal`**: el original cifrado, con `expires_at` a 30 días.
* **Importador reutilizado**: `finance_import.commit_rows(owner, account, rows, origin="sync")` comparte el núcleo de `commit` (candado,
  todo o nada, huellas, `ImportBatch kind="sync"`). `classify` decide `new`, `matches_pending` (p. ej. una recurrencia, que así se
  paga), `matches_confirmed` (un movimiento manual: se enlaza sin cambiarlo) o duplicado. Deshacer, conciliar y la inmutabilidad de lo
  conciliado vienen del importador.
* **Extractos adjuntos**: van a `finance_import.analyze` como si se subieran (mismo tratamiento hostil) y producen una **propuesta de
  importación** que el usuario confirma. Si el PDF tiene contraseña, **se pide cada vez**; en Seguridad el usuario puede activar «guardar mi cédula»
  (cifrada con su DEK, reautenticación para verla o cambiarla) y el lector la prueba solo (decisión del propietario, Q3). El lector de PDF es nuevo
  (dependencia con ≥ 2 semanas publicada) y depende de S3.
* **Cruce entre canales**: la fila del extracto cruza con la propuesta o el movimiento creado desde el correo (`matches_pending` o
  `matches_confirmed`): **no duplica**.

### 5.4 Flujo para el usuario

1. **Conectar** (web o app): elige institución, cuenta y ámbito → el FMS da la dirección única y los pasos para **su** proveedor (crear el
   filtro por remitente del banco, reenviar a la dirección, y el código de confirmación que el FMS muestra) → explica el monto mínimo
   (§3.1) → «Probar»: el usuario reenvía un correo del banco y ve que llegó.
2. **Aviso**: «Nuevo movimiento propuesto en <cuenta>», sin monto fuera de la app salvo preferencia.
3. **Movimiento propuesto**: los campos extraídos y la categoría sugerida (por historial) → **Aprobar** | **Modificar** (**todos los campos**, el monto
   incluido: tipo, monto, fecha, cuenta, categoría, contraparte, descripción y nota; queda auditado antes y después; Q5) | **«Ir al correo»** | descartar.
4. **Reglas**: tras aprobar 3 o más veces algo con el mismo patrón, el FMS sugiere «¿Confirmar siempre así?».

### 5.5 Reglas de autoconfirmación (sobre `finance_automation`)

`finance_automation` ya tiene reglas propias como datos: catálogo de disparadores, de 1 a 5 condiciones, cifrado, validación sin
`eval` y «Probar ahora». **Encaja**. Hay que añadirle un disparador y una acción:

* **Disparador `sync_event`** con campos `institution` (opción), `kind` (ingreso, gasto, transferencia), `text` (operadores nuevos
  `contains`, `starts_with`, `eq` sobre la descripción o contraparte normalizada; 3 a 60 caracteres; sin regex), `amount` (`gte`/`lte`)
  y `day_of_month` (`gte`/`lte`). Todo es opcional salvo que haya al menos una condición: una regla de gasto sin rango de monto vale (Q4).
* **Acción `auto_confirm`** con categoría y contraparte opcionales. Hoy las reglas solo avisan; esta es la primera que **escribe**, y por
  eso: solo sobre eventos autenticados (§5.2), con aviso «Confirmado por la regla X» y deshacer con un toque (reverso), y auditada.
* **Sugerencias** (`domain/finance/sync/patterns.py`): 3 o más eventos aprobados con texto similar, el mismo tipo, montos a ±10 % y día
  del mes a ±3 → propone la regla ya llena (p. ej. nómina: ingreso, contiene «NOMINA <EMPRESA>», entre X y Y, días 13 a 17). El usuario
  la acepta, la edita o la descarta (no se vuelve a sugerir).
* **Pantalla «Reglas de autoconfirmación»** (web y app): tabla con nombre, condición legible, veces aplicada y última vez, activa o
  pausada; crear la propia; «Probar» contra los eventos de los últimos 90 días, sin efectos.

### 5.6 Nequi y Nu desde la app móvil

Confirmado por el propietario (Q1): estas dos instituciones **no aparecen en la web** hasta que el usuario las **activa en la app** (Más → Conexiones →
Nequi / Nu). Activarlas crea la conexión del **mismo canal de correo**: alertas de Nu si llegan por correo y extractos en PDF de Nequi
enviados con «Enviar al correo». **No** lee nada del teléfono (salvo que llegara a ser estrictamente necesario) ni pide permisos nuevos. El backend ya
lo exige: crear una de estas conexiones fuera de la app da `403 activate_from_app`.

### 5.7 Hogar

Cada conexión pertenece a **un** ámbito. Una conexión hacia una cuenta del Hogar cifra con la DEK del Hogar y la crea un miembro con
permiso de escritura. Los demás miembros ven las propuestas de esa cuenta y pueden aprobarlas según su rol, pero no ven la dirección de
la conexión ni su configuración. Si el miembro sale del Hogar, sus conexiones hacia él se pausan. Las reglas de autoconfirmación son por
ámbito.

## 6. Hoja de ruta

### Fase 0: *spikes* (sin código de producción)

| # | Spike | Sale con |
|---|---|---|
| S1 | Correos de Bancolombia, AV Villas y Nu, y extractos de Nequi: remitentes, dominios DKIM, plantillas, qué genera correo, dónde se configura el monto mínimo | Por banco: lista de dominios, 3 o más ejemplos **sintéticos** y la ruta del monto mínimo |
| S2 | Reenvío desde Gmail y Outlook.com a un subdominio de prueba: confirmación, conservación de DKIM o ARC, enlace «Ir al correo» | Qué verifica `mail.py` y cómo se arma el enlace por proveedor |
| S3 | Formatos de extracto (PDF con contraseña o no, texto o imagen) | Si hace falta lector de PDF y cuál |
| S4 | Cotización de Floid (y Belvo por si hay un plan menor) con *widget*, 2FA y certificaciones, dentro de 20 USD/mes | Sí o no a la fase 4 |
| S5 | Texto de privacidad del FMS para el canal de correo | Borrador para F9-13 |
| S6 | El VPS recibe correo en un subdominio nuevo (puerto 25 entrante, reputación) | Sí, o el plan B gestionado (§4.2) |

### Fase 1: canal de correo para cualquier usuario y Hogar (tickets en §7)

Hecho cuando:

* un correo de alerta de Bancolombia (y de AV Villas y Nu si S1 los confirma) reenviado por un filtro de Gmail produce **una** propuesta
  en menos de 5 minutos;
* el mismo correo dos veces produce 0 propuestas;
* un correo falsificado se rechaza;
* un extracto adjunto produce una propuesta de importación que, al confirmarse, cruza sin duplicar;
* una regla de nómina autoconfirma y se puede deshacer;
* «Ir al correo» abre el mensaje en Gmail;
* el original desaparece a los 30 días;
* ningún endpoint devuelve el original;
* otro usuario y otro Hogar reciben 404.

### Fase 2: Microsoft Graph (opcional)

Para quien no pueda reenviar. `Mail.Read` delegado, cuentas personales primero; *refresh token* cifrado con la DEK; filtro por remitente
en el servidor de Microsoft (`$filter` por `from`) para leer solo los del banco; `webLink` para «Ir al correo»; revocar borra el token.
Ruta de *callback* con su prueba de nginx. Solo si alguien la necesita.

### Fase 3: más formatos de extracto y créditos

PDF de ICETEX y del crédito de AV Villas para conciliar saldo y cuota con `finance_credit`.

### Fase 4: agregador (condicionada)

Solo si S4 encuentra uno que cumpla las cuatro condiciones de §4.3. Conector de lectura, *widget* del agregador, webhook en ruta propia
con firma HMAC, marca de tiempo y anti-repetición (`check_attack_terms`, `cv-locations.conf.template`, `test_nginx.py`), y tokens
cifrados y revocables.

### Fase 5: finanzas abiertas reguladas

Cuando la SFC expida el estándar de historial transaccional y exista una vía para un receptor como el FMS.

## 7. Tickets de la fase 1

Cada ticket es un PR pequeño, con sus pruebas. **B** = backend del CV (`master`), **W** = web y **M** = app (repo del FMS, `main`). Las
dependencias van entre paréntesis.

| # | Ticket | Criterios de aceptación |
|---|---|---|
| **B1** | `domain/finance/sync`: `Observation`, `normalize` a `Row` e interfaz y registro de analizadores | Sin Django (`lint-imports`); `Decimal` y nunca `float` (Hypothesis); un analizador desconocido da un error con código estable |
| **B2** | Modelos `SyncConnection`, `SyncEvent`, `SyncOriginal` y `SyncRun` con ámbito, cifrado y migraciones (B1) | Celdas atadas a fila y ámbito (no abren en otro usuario ni en otro Hogar); el admin muestra solo conteos; la prueba de aislamiento recorre los endpoints nuevos con dos usuarios y dos Hogares |
| **B3** | `mail.py`: MIME seguro, DKIM y ARC (dependencia `dkimpy`), extracción de texto sin red y de adjuntos permitidos | Con claves de prueba: DKIM válido pasa; inválido, no alineado o sin firma se rechaza; ARC solo del reenviador declarado; tamaño excedido rechazado; HTML con enlaces y recursos remotos no hace ninguna petición |
| **B4** | API de conexiones: crear (dirección única de 128 bits), listar, pausar, rotar y borrar, con reautenticación (B2) | La dirección en claro sale solo en crear y rotar; rotar invalida la anterior; sin reautenticación da `403 reauthentication_required`; `Idempotency-Key` |
| **B5** | `tasks.poll_ingest`: IMAP de la cuenta de servicio → token → conexión → B3 → analizador → evento; borra el mensaje (B3, B4) | Idempotente (mismo `Message-ID`: 0 eventos); token desconocido o rotado: descartado y contado; el buzón queda vacío tras el *run*; candado: dos *runs* a la vez no duplican; registros sin contenido (`caplog`) |
| **B6** | Confirmación de reenvío: reconocer el correo de verificación del proveedor y exponer **solo el código** en la conexión (B5) | Un correo de confirmación de `google.com` con DKIM válido muestra el código; uno falso no; el código caduca a las 24 h |
| **B7** | Propuestas: `finance_import.commit_rows(origin="sync")`; aprobar, modificar y descartar; deshacer por lote (B5) | Crea un pendiente con origen «sync»; cruza con una recurrencia o un manual sin duplicar ni cambiar el manual; modificar audita antes y después; deshacer anula con reverso; lo conciliado es inmutable |
| **B8** | **TODO, bloqueado por S1**: analizador **Bancolombia** con *fixtures* sintéticos de S1 (B1). Hoy el registro tiene solo el analizador **sintético** de referencia (`domain/finance/sync/parsers/synthetic.py`), que sirve de plantilla | Golden tests por plantilla (compra, retiro, transferencia recibida y enviada, pago); una plantilla desconocida da `parse_error` y guarda el original para depurar |
| **B9** | **TODO, bloqueado por S1**: analizadores **AV Villas** y **Nu** (según S1) (B1) | Igual que B8 |
| **B10** | **TODO, bloqueado por S1 y S3**: extractos adjuntos → `finance_import.analyze` → propuesta de importación (B5, B7). `mail.py` ya extrae los adjuntos permitidos y la cédula guardada está en `finance_sync.document.pdf_passwords` | CSV, XLSX y OFX adjuntos producen una propuesta que el usuario confirma; las filas cruzan con las propuestas del correo sin duplicar; un adjunto de otro tipo se ignora; un PDF con contraseña la pide o prueba la cédula guardada |
| **B11** | Retención y salud: `purge` (originales y descartados a 30 días) y `health` (conexión sin eventos en N días: aviso) (B2) | Con el reloj adelantado se borra lo vencido y nada más; el aviso de salud sale una vez por ventana |
| **B12** | Orden `fms_sync_debug` (clasificada en `apps/ops/registry.py`) que muestra el resultado del analizador sin montos (B2) | Solo el servicio la ejecuta; la salida no contiene ningún monto ni descripción (prueba); queda auditada |
| **B13** | Reglas de autoconfirmación: disparador `sync_event`, operadores de texto, acción `auto_confirm`, y sugerencias por patrón en `finance_automation` y `domain/finance/sync/patterns.py` (B7) | Sin regex ni `eval` (las pruebas con `{{7*7}}` y `.*` salen literales); solo sobre eventos autenticados de la institución de la conexión; «Probar» sin efectos; 3 nóminas aprobadas sugieren una regla; deshacer una autoconfirmación anula con reverso |
| **B14** | Avisos «movimiento propuesto» y «confirmado por regla» en `finance_planning` y enlace «Ir al correo» por proveedor (B7) | Sin montos fuera de la app salvo preferencia; el enlace de Gmail usa el `Message-ID`; el original nunca sale por la API (prueba que recorre el esquema) |
| **B15** | OpenAPI (`openapi-fms.yaml`) y procedimiento en `DEPLOYMENT.md`: subdominio de ingesta, MX, comodín de Virtualmin, cuenta de servicio y variables `FMS_SYNC_IMAP_*` en `make-env.sh` | `uv run pytest tests/deploy` pasa; `make-env.sh` genera las variables; sin valores reales en el repo |
| **W1** | **Hecho (rama `feat/bank-email-sync-ui`).** Web: «Conexiones» (Configuración): asistente por proveedor con la dirección, el filtro paso a paso, el código de confirmación, el monto mínimo (§3.1) y «Probar» (B4, B6) | La dirección se puede copiar y no queda en la URL ni en `localStorage`; rotar y borrar piden reautenticación; Nequi y Nu no aparecen hasta activarlos en la app; axe sin errores |
| **W2** | **Hecho (rama `feat/bank-email-sync-ui`).** Web: bandeja «Por revisar» con Aprobar, Modificar, Ir al correo y descartar; contador en el Resumen (B7, B14) | Montos como cadenas decimales (`core/money.ts`); sin monto en rutas; el enlace abre en una pestaña nueva con `noopener` |
| **W3** | **Hecho (rama `feat/bank-email-sync-ui`).** Web: «Reglas de autoconfirmación»: tabla, sugerencias, crear la propia y probar (B13) | La condición se muestra legible; «Probar» lista los casos sin efectos; pausar y borrar |
| **M1** | **Hecho (rama `feat/bank-email-sync-ui`).** App: Conexiones con el interruptor por institución para **Nequi y Nu** (crea la conexión de correo) y el mismo asistente que W1 (B4) | Sin permisos nuevos de Android (prueba del *manifest*); nada en disco (`guards.test.ts`) |
| **M2** | **Hecho (rama `feat/bank-email-sync-ui`).** App: «Por revisar» y reglas, aviso FCM «movimiento propuesto», e «Ir al correo» que abre la app o la web del proveedor (B7, B13, B14) | Mismas reglas que W2 y W3; el enlace pasa por la lista blanca de `src/nav/deeplink.ts` |
| **E1** | E2E: correo simulado (firmado con una clave de prueba) → propuesta → aprobar → extracto que cruza → deshacer (todo lo anterior) | Pasa en CI con un servidor de correo de prueba |

Orden sugerido: S1 a S6 → B1, B2, B3 → B4, B5, B6 → B7, B8 → W1, W2, M1 → B10, B11, B12, B14, B15 → B9, B13, W3, M2 → E1.

## 8. Preguntas abiertas para el propietario

Respondidas el 2026-11-14 (ver [owner-rules](owner-rules.md#2026-11-14-integración-con-los-bancos-segundas-respuestas)): Q1 (solo se activan en la app; se leen por
correo), Q2 (sí al canal D), Q3 (se pide cada vez; «guardar mi cédula» opcional), Q4 (el rango de monto es opcional), Q5 (todo se puede modificar, el monto
incluido) y Q7 (sí: `ingest.<dominio>` y `recibir.<dominio>`).

| # | Pregunta | Por qué |
|---|---|---|
| Q6 | ¿Autorizas pedir cotizaciones a Floid y Belvo (S4) en nombre del proyecto, sin datos personales? | Fase 4 |
| Q8 | ¿Te sirve `recibir.<dominio>` como subdominio en español, o prefieres otro (`correo-banco.`, `ingesta.`)? Es solo configuración (`FMS_SYNC_INGEST_DOMAINS`) | §4.2 |
| Q9 | Las reglas de autoconfirmación de un **Hogar**: hoy la API de reglas es personal y un correo del Hogar siempre queda propuesto. ¿Las quieres por Hogar en la fase 1? | §5.7 |

## 9. Fuentes (consultadas el 2026-11-14)

Regulación:

* SFC, Proyecto de carta circular, 31-ago-2026, cronograma de estándares [P]:
  https://www.superfinanciera.gov.co/publicaciones/10116237/proyecto-de-carta-circular-agosto-31-de-2026/
* URF, «Ajustes en los plazos de implementación del sistema de finanzas abiertas obligatorio», sep-2026 [P]:
  https://www.urf.gov.co/documents/283253/3555757/003_Documento_Tecnico.pdf
* Presidencia, Decreto 0368 de 2026 (no se pudo descargar) [P no leído]:
  https://dapre.presidencia.gov.co/normativa/normativa/DECRETO%20No.%200368%20DEL%2007%20DE%20ABRIL%20DE%202026.pdf
* Holland & Knight, proyecto de CE 010 de 2026 [S]:
  https://www.hklaw.com/en/insights/publications/2026/07/sfc-propone-nuevas-reglas-para-implementar-el-sistema-de-finanzas
* Pérez-Llorca, Decreto 0368 de 2026 [S]:
  https://www.perezllorca.com/en-co/news/legal-guide/colombia-open-finance-decree-0368-2026-narrowed-scope/
* Yarumo, participantes y datos del Decreto 0368 [S]: https://www.yarumo.ai/en/blog/open-finance-who-is-required-and-what-data-to-expose
* Fiskil, Colombia [S]: https://www.fiskil.com/open-finance-tracker/colombia

Bancos:

* Bancolombia, centro de ayuda para desarrolladores [P]: https://soportedeveloper-portal.bancolombia.com/hc/es-419
* Bancolombia, alcance de la API de cuentas (solo titularidad) [P, vía resultado de búsqueda]:
  https://soportedevs.bancolombia.com/hc/es-419/articles/14564107863060--Esta-API-me-permite-consultar-informaci%C3%B3n-de-una-cuenta
* Bancolombia, alertas por correo o SMS, topes mínimos y Clave Dinámica [P]: https://bancolombia.com/centro-de-ayuda/canales/sucursal-telefonica
* Bancolombia, remitentes oficiales [P]: https://www.bancolombia.com/centro-de-ayuda/preguntas-frecuentes/correos-reales-nueva-imagen
* La República, Aval API Market, jul-2026 [S]:
  https://www.larepublica.co/finanzas/grupo-aval-lanzo-aval-api-market-para-integrar-soluciones-financieras-y-tecnologicas-4442163
* Infobae, extractos de Nequi («Enviar al correo»), 15-jul-2026 [S]:
  https://www.infobae.com/tecno/2026/07/15/como-descargar-extractos-de-nequi-y-ver-los-movimientos-de-la-cuenta/
* El Tiempo, SMS de Nequi desde el 85954 [S]:
  https://www.eltiempo.com/economia/finanzas-personales/nequi-como-los-estafadores-roban-dinero-de-las-cuentas-de-los-usuarios-759125
* Nu Colombia, política de tratamiento de datos [P]: https://contracts.nu.com.co/legal-documents/nu-SA-data-policy-version-1.pdf
* Colombia Tramita, estado de cuenta de ICETEX [S]: https://colombiatramita.co/educacion/consultar-saldo-icetex/

Correo:

* Google, alcances de la API de Gmail (`gmail.readonly` y `gmail.metadata` restringidos) [P]:
  https://developers.google.com/workspace/gmail/api/auth/scopes
* Google, verificación de alcances restringidos (excepciones y evaluación cada 12 meses) [P]:
  https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
* Secusy y DeepStrike, precios de la evaluación CASA (indicativos y contradictorios) [S]: https://www.secusy.ai/blog/google-casa-assessment-cost ·
  https://deepstrike.io/blog/google-casa-security-assessment-2025
* Microsoft, referencia de permisos de Graph (`Mail.Read` en cuentas personales) [P]: https://learn.microsoft.com/en-us/graph/permissions-reference
* Microsoft, reenvío externo y directivas de correo no deseado saliente (Microsoft 365) [P]:
  https://learn.microsoft.com/en-us/defender-office-365/outbound-spam-policies-external-email-forwarding
* Google Workspace Updates, verificación de direcciones de reenvío [S]:
  https://workspaceupdates.googleblog.com/2010/05/gmail-now-requires-verification-of.html

Agregadores:

* Belvo, planes y precios [P]: https://belvo.com/plans-and-pricing/
* Belvo, ISO 27001 [P]: https://belvo.com/blog/belvo-doubles-down-commitment-security-achieves-iso-27001/
* Floid, referencia «Bancolombia Personas: Products» (usuario y contraseña en el cuerpo) [P]:
  https://readme.floid.io/reference/bancolombia-personas-products
* Floid, introducción a la API (*widget* o API) [S]: https://readme.floid.io/docs/somos-floid
* Prometeo, `POST /login/` [P]: https://docs.prometeoapi.com/reference/login
* LatamFintech, Belvo y bancos colombianos, 2023 [S]:
  https://www.latamfintech.co/articles/fintechs-monet-y-belvo-revolucionan-el-acceso-al-credito-en-colombia-a-traves-del-open-finance

---

## Apéndice A: ADR-020 propuesto: sincronización de solo lectura con entidades financieras

*(Texto propuesto para `docs/adr/` del repo del CV. Número a confirmar por quien dirige; lo aprueba el propietario.)*

**Estado:** propuesto (versión 2, con las decisiones del propietario del 2026-11-14).

**Contexto.** El FMS (ADR-019) importa extractos con huella ciega, cruce y deshacer. El propietario pide leer movimientos de sus bancos,
**sin** iniciar pagos ni transferencias, para cualquier usuario y para el Hogar, con un presupuesto de 20 USD/mes. No hay vía regulada en
un plazo útil ni API de banco para personas. Los agregadores publicados exceden el presupuesto o reciben las contraseñas por API. Leer el
buzón con la API de Gmail exige una evaluación de seguridad anual de pago, y con IMAP, guardar una credencial de todo el buzón.

**Decisión.**

1. Se crea `apps/finance_sync` con conectores de **solo lectura**; todo evento entra por el flujo del importador (`classify` y
   `commit_rows`, `ImportBatch kind=sync`).
2. **Canal principal: reenvío filtrado desde el correo del usuario a una dirección única por conexión** en un subdominio de ingesta del
   FMS. Se exige DKIM del banco (o ARC del reenviador declarado). Cada mensaje se procesa y se borra del servidor de correo; el original se
   guarda **cifrado con la DEK del ámbito durante 30 días, solo para depurar**, y nunca se muestra en la plataforma.
3. El FMS **nunca ve ni guarda credenciales** del banco ni del correo. Un agregador solo se admite con *widget* propio, segundo factor,
   certificación (ISO 27001 o SOC 2; PCI-DSS si toca tarjetas) y dentro del presupuesto, en un ADR o enmienda aparte.
4. Los eventos son **propuestas** (Aprobar | Modificar | Ir al correo). Solo una **regla de autoconfirmación** aceptada por el usuario
   (disparador `sync_event` y acción `auto_confirm` de `finance_automation`, sin expresiones regulares) confirma sola, y solo sobre eventos
   autenticados. Todo es deshacible y auditado.
5. **Descartados:** lector de notificaciones de Android, SMS, API de Gmail con `gmail.readonly` (por ahora) e IMAP con contraseña de
   aplicación. Microsoft Graph `Mail.Read` queda como opción posterior para quien no pueda reenviar.
6. Sin rutas HTTP nuevas en la fase 1. Toda ruta posterior (OAuth, webhooks) pasa por `check_attack_terms`, `cv-locations.conf.template`
   y `test_nginx.py`, y un webhook exige firma HMAC con marca de tiempo y anti-repetición.

**Consecuencias.** Costo marginal 0. La cobertura depende de que el banco mande correo, del monto mínimo configurado y de que su
plantilla no cambie: se vigila con la tarea `health` y con *fixtures* versionados. El extracto concilia. Riesgos nuevos: suplantación de
correo (mitigada con DKIM o ARC, propuestas y conciliación) y una dirección filtrada (rotación). Dependencias nuevas: `dkimpy` y, si S3
lo confirma, un lector de PDF, con ≥ 2 semanas de publicadas. El VPS recibe correo en un subdominio (lo configura el propietario). Se
reevalúa cuando la SFC expida el estándar de historial transaccional o un agregador cotice dentro del presupuesto.
