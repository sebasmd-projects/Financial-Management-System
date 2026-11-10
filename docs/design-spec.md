# FMS — Especificación de diseño (producto y UX)

Sistema personal de gestión financiera. Español primero (es-CO), inglés después. Moneda base COP, fechas DD/MM/YYYY, zona
horaria `America/Bogota`, semana que empieza el lunes. Este documento es una especificación de diseño: no contiene código.

- **Plataforma**: React Native + Expo + Expo Router (Android, iOS y web con un solo código). Móvil primero: 360–430 dp.
- **Backend**: Django + PostgreSQL (montos `Decimal` exactos), notificaciones push por Expo.
- **Usuario**: uno solo con 2FA; el modelo queda listo para «hogar» (todo registro cuelga de un `Household`).
- **Referencias visuales del propietario** («Paier», tableros de patrimonio, pronóstico y «Prognose»): solo referencia. De ellas se
  toman tres patrones, no su aspecto: tabla de pronóstico con real frente a proyectado, corte necesario frente a discrecional y selector de
  escenario. La identidad visual de este documento («Añil y Guayaba», §4) es propia.

Índice: 0 Criterio rector · 1 Arquitectura de información · 2 Resumen sin scroll · 3 Pantallas y flujos · 4 Tokens · 5 Componentes ·
6 Accesibilidad · 7 Glosario y reglas de negocio · 8 Modelo de dominio · 9 Cortes de entrega (v1, v2, v3) · 10 Preguntas abiertas.

---

## 0. Criterio rector

**El corazón de la aplicación son las cuentas, los movimientos y el Ledger (libro de partida doble).** Tarjetas, suscripciones, cuotas,
préstamos, presupuestos y metas no son módulos aislados: son vistas y operaciones construidas sobre ese núcleo.

| Concepto | Qué es en el núcleo | Consecuencia en la interfaz |
|---|---|---|
| Tarjeta de crédito | Una **cuenta de pasivo** | Una compra es un movimiento con asientos; un pago es una transferencia; un extracto es una vista filtrada de sus asientos |
| Suscripción o recurrencia | Un generador de **movimientos pendientes** | Nada cuenta como cobrado hasta que el movimiento pasa a confirmado |
| Préstamo | Una **cuenta de pasivo** | Cada cuota es un movimiento que reparte capital, interés y cargos en asientos |
| Presupuesto | Una **lectura** de asientos de gasto | No guarda montos ejecutados; solo el límite |
| Meta de ahorro | Una **cuenta o fondo de ahorro** | El progreso es el saldo de esa cuenta |
| Cualquier saldo | Suma de asientos | **Fuente única**: ningún saldo de la interfaz se guarda aparte ni se digita |

Principios de experiencia que salen de ahí:

1. **El usuario nunca ve débitos ni créditos en el flujo normal.** Elige «Compré con Visa Bancolombia» y el sistema escribe los asientos.
   Debajo del monto, una frase en lenguaje llano dice el efecto: «Se suma a la deuda de tu tarjeta. No sale plata de tu cuenta.»
2. **Todo módulo enlaza a los movimientos que lo componen.** Cada tarjeta, préstamo, presupuesto, meta, recurrencia, informe y KPI tiene
   una acción «Ver movimientos» que abre el Historial ya filtrado (`/movimientos?cuenta=…`, `?categoria=…&periodo=…`, `?recurrencia=…`).
3. **Compromiso no es hecho.** Lo esperado (pendiente) y lo ocurrido (confirmado) se distinguen siempre con forma, texto y color (§3.3).
4. **Dos toques para el caso común**, todo lo demás por revelación progresiva.
5. **Valores exactos**: los montos abreviados (`$450 mil`) solo aparecen en fichas compactas; el detalle y el lector de pantalla dan el valor completo.

---

## 1. Arquitectura de información y navegación

### 1.1 Árbol del menú principal (nombres del propietario)

El orden y los nombres son los del propietario. En cursiva, lo añadido en mensajes posteriores y dónde vive.

| # | Sección | Subelementos | Módulos del encargo que contiene |
|---|---|---|---|
| 1 | **Resumen financiero** | (pantalla única) | Dashboard, *proyección de liquidez 15/30/60/90* |
| 2 | **Movimientos** | Ingresos · Egresos · Transferencias · Historial · *Compartidos* | Ingresos y egresos, adjuntos, *compras compartidas* (saldos por persona y saldar) |
| 3 | **Cuentas y tarjetas** | Bancos · Efectivo · Débito · Crédito · *Importar extracto* | Cuentas, bolsillos, billeteras, tarjetas, conciliación, *importación bancaria* |
| 4 | **Pagos y recurrencias** | Suscripciones · Gastos fijos · Calendario | Motor de recurrencias, calendario financiero |
| 5 | **Créditos y obligaciones** | Préstamos · Cuotas · Intereses · Amortizaciones · *Deudas personales* | Préstamos, simuladores de tasas y amortización (dentro de «Amortizaciones»), *lo que presté y lo que debo* |
| 6 | **Presupuestos y metas** | Presupuestos · Ahorro · Objetivos | Presupuestos, metas, indicadores |
| 7 | **Informes y analítica** | Estadísticas · Proyecciones · Patrimonio | Los 10 informes, *gastos hormiga* (Estadísticas), *escenarios, comparador e independencia financiera* (Proyecciones), *activos: inmuebles, vehículos e inversiones* (Patrimonio › Activos) |
| 8 | **Configuración financiera** | Categorías · Etiquetas · Instituciones · Monedas · Reglas · *Parámetros Colombia* · *Auditoría* | Clasificación, catálogo de bancos, FX, motor de reglas, tablas con vigencia (usura, UVR, GMF, festivos), *auditoría financiera* |

Fuera del árbol, en la cabecera: **Notificaciones** (campana) y **Perfil y seguridad** (2FA, bloqueo biométrico, idioma, tema).

Dónde va cada función nueva y por qué:

- **Vehículos y activos** → 7 › Patrimonio › Activos. Son cuentas de activo; aportan al patrimonio. Sus costos (SOAT, técnico-mecánica,
  impuesto, seguro, mantenimiento) son recurrencias y por eso aparecen también en 4 › Gastos fijos y Calendario, con la etiqueta del vehículo.
- **Deudas personales** → 5 › Deudas personales, con dos pestañas: «Me deben» (activo) y «Debo» (pasivo).
- **Compras compartidas** → 2 › Compartidos; la división se hace dentro del formulario del movimiento («Dividir»).
- **Importación bancaria** → 3 › Importar extracto, y como paso opcional de «Conciliar» en cada cuenta.
- **Comparador de escenarios** → 7 › Proyecciones › Comparar; también se llega desde cada préstamo y suscripción («¿Y si…?»).
- **Auditoría** → 8 › Auditoría (global) y «Historial de cambios» en el detalle de cada movimiento.

### 1.2 Teléfono (ancho < 600 dp): barra inferior de 5 posiciones

| Posición | Etiqueta | Icono | Destino |
|---|---|---|---|
| 1 | Resumen | casa | `/` (sección 1) |
| 2 | Movimientos | lista | `/movimientos` (Historial con segmentos Todos · Ingresos · Egresos · Transferencias) |
| 3 | **+** (central, círculo de 52 dp) | más | Hoja «Nuevo movimiento» |
| 4 | Pagos | calendario con visto | `/pagos` (segmentos Gastos fijos · Suscripciones · Calendario) |
| 5 | Más | cuadrícula | Hoja «Más» |

- Cada posición mide 78 × 64 dp a 390 dp de ancho (72 × 56 a 360): área táctil mayor que 44 × 44. Etiqueta de 11/14 sp, icono de 24 dp.
- Insignias: punto de 8 dp en «Pagos» si hay vencidos; número en la campana de la cabecera.
- Mantener pulsado «+» abre un menú de 4 atajos: Egreso, Ingreso, Transferencia, Pago de tarjeta.
- **Hoja «Más»**: hoja inferior al 92 % de alto, lista agrupada con las 8 secciones en el mismo orden y con sus subelementos (la 1, 2 y 4
  aparecen también, para que el árbol sea completo). Cada fila mide 52 dp. Arriba, buscador de pantallas («tarjetas», «usura»…). Abajo, «Perfil y seguridad».

```
┌ Más ───────────────────────────── ✕ ┐
│ [ Buscar pantalla…                 ] │
│ 1 RESUMEN FINANCIERO              ›  │
│ 2 MOVIMIENTOS                        │
│   Ingresos · Egresos · Transferencias│
│   Historial · Compartidos            │
│ 3 CUENTAS Y TARJETAS                 │
│   Bancos · Efectivo · Débito ·       │
│   Crédito · Importar extracto        │
│ 4 PAGOS Y RECURRENCIAS               │
│   Suscripciones · Gastos fijos ·     │
│   Calendario                         │
│ 5 CRÉDITOS Y OBLIGACIONES …          │
│ 6 PRESUPUESTOS Y METAS …             │
│ 7 INFORMES Y ANALÍTICA …             │
│ 8 CONFIGURACIÓN FINANCIERA …         │
│ ──────────────────────────────────── │
│ Perfil y seguridad                 › │
└──────────────────────────────────────┘
```

### 1.3 Tableta y escritorio

| Punto de corte | Ancho | Navegación | Rejilla |
|---|---|---|---|
| Compacto | < 600 dp | Barra inferior de 5 | 4 columnas, margen 16, separación 8 |
| Medio | 600–1023 dp | Riel lateral de 80 dp con los 8 iconos de sección; al tocar, panel de subelementos de 240 dp | 8 columnas, margen 24, separación 16 |
| Expandido | ≥ 1024 dp | Barra lateral de 248 dp con las 8 secciones y sus subelementos, cada sección plegable; plegada entera queda en 64 dp | 12 columnas, margen 24, separación 16 |
| Amplio | ≥ 1440 dp | Igual; contenido con ancho máximo de 1320 dp centrado | 12 columnas |

En medio y expandido no hay botón flotante: «+ Movimiento» va en la barra superior (56 dp) y responde a la tecla `N`. `Ctrl/⌘+K` abre el buscador de pantallas. La campana abre un panel lateral derecho de 360 dp.

### 1.4 Esquema de enlaces profundos

Esquema nativo `fms://` y universal `https://<host>/` con las mismas rutas (Expo Router, rutas en español). Las notificaciones push
llevan siempre una de estas rutas. Una ruta protegida sin sesión pasa por `/ingresar` y vuelve al destino.

| Ruta | Pantalla |
|---|---|
| `/` | Resumen financiero (`?periodo=2026-11`) |
| `/movimientos` | Historial (`?tipo=egreso&estado=pendiente&cuenta=ID&categoria=ID&etiqueta=x&periodo=2026-11&recurrencia=ID`) |
| `/movimientos/nuevo` | Hoja de alta (`?tipo=egreso&plantilla=ID&medio=ID&monto=180000`) |
| `/movimientos/[id]` · `/movimientos/[id]/asientos` · `/movimientos/[id]/historial` | Detalle · Ver asientos · Historial de cambios |
| `/movimientos/compartidos` · `/movimientos/compartidos/[persona]` | Saldos por persona · Saldar |
| `/cuentas` · `/cuentas/[id]` · `/cuentas/[id]/conciliar` · `/cuentas/importar` | Cuentas · Detalle · Conciliación · Importar extracto |
| `/tarjetas/[id]` · `/tarjetas/[id]/extractos/[periodo]` · `/tarjetas/[id]/pagar` · `/tarjetas/[id]/simular` | Tarjeta de crédito |
| `/pagos` · `/pagos/fijos` · `/pagos/fijos/[id]/pagar?periodo=2026-11` | Gastos fijos y hoja «Marcar pago» |
| `/pagos/suscripciones` · `/pagos/recurrencias/[id]` · `/pagos/recurrencias/nueva` | Recurrencias |
| `/pagos/calendario` | Calendario (`?vista=mes&fecha=2026-11-15` o `?rango=7`) |
| `/creditos` · `/creditos/[id]` · `/creditos/[id]/tabla` · `/creditos/deudas-personales` | Créditos y obligaciones |
| `/creditos/simuladores/[amortizacion\|tasas\|abono-extra\|comparar\|compra-tarjeta]` | Simuladores |
| `/plan/presupuestos` · `/plan/presupuestos/[id]` · `/plan/metas` · `/plan/metas/[id]` · `/plan/indicadores` | Presupuestos y metas |
| `/informes` · `/informes/[informe]` | Informes (`?periodo=…&cuenta=…&escenario=base`) |
| `/informes/proyecciones` · `/informes/proyecciones/comparar` · `/informes/proyecciones/independencia` | Proyecciones |
| `/informes/patrimonio` · `/informes/patrimonio/activos/[id]` | Patrimonio y activos (vehículos, inmuebles, inversiones) |
| `/notificaciones` | Centro de notificaciones |
| `/config/[categorias\|etiquetas\|instituciones\|monedas\|reglas\|parametros\|auditoria]` | Configuración financiera |
| `/perfil` · `/ingresar` · `/ingresar/2fa` · `/bienvenida/[paso]` | Perfil, acceso y primer uso |

---

## 2. Resumen financiero: primera pantalla sin scroll

### 2.1 Qué se ve sin desplazarse (y con qué bloque)

| Requisito del propietario | Bloque | Interacción |
|---|---|---|
| Gastos fijos: cuánto va pagado de cada uno y cuándo; marcar pago total o parcial; se reinician cada mes | **Fichas de gastos fijos** (rejilla 2 × 4) | Tocar: hoja «Marcar pago». Mantener pulsado: pago total con «Deshacer» 5 s |
| Agregar rápido un gasto fluctuante | **Botón «+»** central y **fila de atajos** | 2 toques con atajo (§3.2) |
| Cuánto me queda y cuánto he gastado este mes | **Franja de KPI** | Tocar cada cifra abre su desglose |
| Próximos pagos de préstamos y tarjetas | **Riel «Próximos pagos»** (horizontal) | Tocar: detalle con «Pagar» |
| Notificaciones | **Campana con contador** y **franja de alerta** (la más urgente) | Tocar: destino de la alerta |
| Liquidez a 15/30/60/90 días (añadido) | Última línea de la franja de KPI | Tocar: hoja con los cuatro horizontes |

«Sin scroll» significa sin desplazamiento **vertical**. El riel y la fila de atajos se desplazan en horizontal, que es revelación
progresiva y no oculta ningún requisito: lo primero de cada uno siempre está a la vista.

### 2.2 Distribución exacta a 390 × 844 (disposición A)

Zonas seguras: 47 dp arriba y 34 dp abajo. **Alto útil: 844 − 47 − 34 = 763 dp.** Margen lateral 16 dp; ancho de contenido 358 dp.

| # | Bloque | Alto (dp) | Y inicial | Contenido |
|---|---|---|---|---|
| 1 | Cabecera | 48 | 0 | Selector de periodo «Noviembre 2026 ▾» (izquierda) · ojo «ocultar montos» · campana con contador (derecha), cada uno 44 × 44 |
| – | separación | 8 | 48 | |
| 2 | Franja de KPI | 104 | 56 | Tarjeta única: «Te queda» + «Gastado» + barra de 6 dp + línea de liquidez |
| – | separación | 12 | 160 | |
| 3 | Riel «Próximos pagos» | 108 | 172 | Título 28 + tarjetas de 148 × 80 (separación 8): se ven 2 completas y 62 dp de la tercera |
| – | separación | 12 | 280 | |
| 4 | Gastos fijos | 276 | 292 | Título 28 + 4 filas de 56 con separación 8 (28 + 224 + 24); 2 columnas de 175 dp |
| – | separación | 12 | 568 | |
| 5 | Fila de atajos «+ gasto» | 48 | 580 | Fichas de 36 dp de alto (área táctil 44 con `hitSlop` 4), desplazamiento horizontal |
| – | separación | 12 | 628 | |
| 6 | Franja de alerta | 48 | 640 | La notificación más urgente, 1 línea |
| – | separación | 8 (+3 sobrantes = 11) | 688 | |
| 7 | Barra inferior | 64 | 699 | 5 posiciones; «+» de 52 dp centrado dentro de la barra, sin sobresalir |
| | **Total** | **760 + 3 = 763** | | |

```
390 dp
┌──────────────────────────────────────┐ 0
│ Noviembre 2026 ▾            (ojo)(3) │ cabecera 48
├──────────────────────────────────────┤ 56
│ Te queda este mes          Gastado   │
│ $1.840.000              $2.310.000   │ KPI 104
│ ████████████▓▓▓▓▓░░░░░░░░░░          │
│ Disponible hoy $3.420.000 · 30 d $1.250.000 › │
├──────────────────────────────────────┤ 172
│ Próximos pagos            Calendario›│
│ ┌───────────┐┌───────────┐┌───       │ riel 108
│ │▣ Visa Banc││▤ Libre inv││▣ Ma      │
│ │ $850.000  ││ $723.048  ││ $3       │
│ │Vence 16/11││Vence 20/11││Ve        │
│ └───────────┘└───────────┘└───       │
├──────────────────────────────────────┤ 292
│ Gastos fijos · 3 de 9 pagados  Todos›│
│ ┌────────────────┐┌────────────────┐ │
│ │Arriendo      ! ││Internet      ◔ │ │ 4 filas × 56
│ │Vencido 05/11…  ││Falta $40 mil…  │ │ = 276 con título
│ │▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁││████████▁▁▁▁▁▁▁▁│ │
│ └────────────────┘└────────────────┘ │
│ ┌ Energía ──────┐┌ Celular ───────┐ │
│ ┌ Administración┐┌ Gimnasio ──────┐ │
│ ┌ Agua ✓ ───────┐┌ Ver todos (9) ›┐ │
├──────────────────────────────────────┤ 580
│ (Gasolina $180.000)(Mercado)(Domic…  │ atajos 48
├──────────────────────────────────────┤ 640
│ ! Arriendo venció hace 5 días   1/3 ›│ alerta 48
├──────────────────────────────────────┤ 699
│ Resumen  Movim.  ( + )  Pagos   Más  │ barra 64
└──────────────────────────────────────┘ 763
```

### 2.3 Distribución exacta a 360 × 740 (disposición B)

Android con barra de estado de 24 dp y navegación por gestos de 24 dp. **Alto útil: 740 − 24 − 24 = 692 dp.** Ancho de contenido 328 dp.

| # | Bloque | Alto (dp) | Cambios frente a A |
|---|---|---|---|
| 1 | Cabecera | 48 | Igual |
| – | separación | 8 | |
| 2 | Franja de KPI | 96 | Cifra principal a 26 sp (en A, 28 sp); la línea de liquidez usa montos abreviados |
| – | separación | 8 | |
| 3 | Riel «Próximos pagos» | 96 | Título 24 + tarjetas de 140 × 72: 2 completas y 48 dp de la tercera |
| – | separación | 8 | |
| 4 | Gastos fijos | 250 | Título 24 + 4 filas de 52 con separación 6 (24 + 208 + 18); columnas de 164 dp |
| – | separación | 8 | |
| 5 | Fila de atajos | 44 | Fichas de 36 dp, área táctil 44 |
| – | separación | 8 | |
| 6 | Franja de alerta | 44 | |
| – | separación | 8 | |
| 7 | Barra inferior | 56 | «+» de 48 dp |
| | **Total** | **682** | Sobran 10 dp: van al bloque 4 (filas de 54,5 dp) |

### 2.4 Escalera de degradación (otros tamaños)

Sea `H` el alto útil (alto de ventana menos zonas seguras). La disposición se decide con `H`, no con el modelo del dispositivo.

| Condición | Qué se muestra |
|---|---|
| `H ≥ 824` | Disposición A con una 5.ª fila de fichas (cada fila adicional cuesta 64 dp; máximo 6 filas) |
| `760 ≤ H < 824` | Disposición A; el sobrante va a la separación sobre la barra inferior |
| `682 ≤ H < 760` | Disposición B; el sobrante engorda las filas de fichas hasta 56 dp |
| `624 ≤ H < 682` (p. ej. 360 × 740 con 3 botones, 375 × 667) | B con **3 filas** de fichas: 5 gastos + «Ver todos» (ahorra 58 dp) |
| `572 ≤ H < 624` | Además se oculta la fila de atajos (ahorra 52 dp); el «+» central sigue |
| `H < 572`, teléfono apaisado o escala de fuente > 1,3 | Se permite desplazamiento vertical con el mismo orden. Aquí la garantía «sin scroll» no aplica y se documenta como límite |

Entre escala de fuente 1,0 y 1,3 los textos crecen dentro de su caja y truncan antes (las alturas de bloque no cambian).

### 2.5 Contenido, truncado y enlaces de cada bloque

**Cabecera (48).** Selector de periodo: abre una hoja con los últimos 12 periodos y «Hoy». Con un periodo pasado, la cabecera muestra
la ficha «Viendo octubre 2026 · Volver a hoy» y los bloques 3, 5 y 6 se atenúan (son del presente). Ojo: sustituye todos los montos por
`•••••` (se recuerda por dispositivo). Campana: contador de no leídas (máximo «9+») → `/notificaciones`.

**Franja de KPI (104).** Una sola tarjeta con relleno 12.

- Línea 1 (16 dp): rótulos «Te queda este mes» (izquierda) y «Gastado» (derecha), 12 sp.
- Línea 2 (34 dp): `$1.840.000` a 28/34 sp peso 600 (izquierda); `$2.310.000` a 20/28 sp (derecha). Si «Te queda» es negativo: `−$120.000` en `negative` con icono de alerta.
- Línea 3 (6 dp): barra de tres tramos sobre ingresos confirmados: gastado (`primary`), comprometido pendiente (`primary` al 40 % con trama diagonal), libre (`track`).
- Línea 4 (16 dp): «Disponible hoy $3.420.000 · en 30 días $1.250.000 ›», 12 sp. Si no cabe: `$3,4 M` y `$1,25 M`.
- Truncado: la cifra principal nunca se trunca; a partir de 10 cifras baja a 24 sp y luego abrevia (`$1.250,4 M`).
- Enlaces: «Te queda» → hoja de desglose (ingresos, gastado, fijos pendientes, abonos a capital); «Gastado» → `/movimientos?tipo=egreso&periodo=actual` agrupado por categoría; línea 4 → hoja «Liquidez» con 15, 30, 60 y 90 días y el primer día en que el saldo proyectado baja de cero.

Fórmulas (todas leen el Ledger; §7.2):

- **Gastado** = débitos netos a cuentas de gasto del periodo, en movimientos confirmados o conciliados. Incluye compras con tarjeta de crédito el día de la compra, intereses y comisiones. Excluye transferencias, pagos de tarjeta y abonos a capital.
- **Te queda** = ingresos confirmados del periodo − Gastado − abonos a capital de préstamos confirmados en el periodo − compromisos pendientes del periodo (movimientos pendientes de gastos fijos y cuotas de préstamo). Ejemplo: 5.200.000 − 2.310.000 − 0 − 1.050.000 = **1.840.000**.
- **Disponible hoy** = saldo confirmado de las cuentas de activo líquidas (bancos, efectivo, billeteras; los bolsillos y fondos de meta se excluyen salvo que el usuario los marque «disponible»).
- **Liquidez a N días** = Disponible hoy + ingresos pendientes con fecha ≤ hoy + N − egresos de caja pendientes con fecha ≤ hoy + N (fijos, suscripciones, cuotas, pago de tarjeta del extracto vigente). Ejemplo a 30 días: 3.420.000 + 5.200.000 − 7.370.000 = **1.250.000**. En v1 no estima gasto variable; en v2 suma el promedio de los últimos 3 periodos y lo dice en la hoja.

**Riel «Próximos pagos» (108).** Solo obligaciones de **tarjetas de crédito y préstamos**, ordenadas por fecha, hasta 30 días (máximo 8 tarjetas más «Ver calendario»).

- Tarjeta de 148 × 80, relleno 10: línea 1 icono de 16 + nombre a 13/16 sp (1 línea, corta con «…» a ~14 caracteres); línea 2 monto a 16/22 sp peso 600; línea 3 «Vence 16/11 · 6 días» a 12/16 sp.
- Tarjeta de crédito: el monto es el pago del extracto vigente (mínimo o total según la preferencia de la tarjeta); si aún no ha cortado, «Corta 30/11 · va en $1.320.000».
- Estados: normal; pronto (≤ 3 días, borde `warning` y texto «en 2 días»); hoy («Vence hoy»); vencido (fondo `negative-container`, «Venció hace 2 días», siempre primero); pagado (visto, se retira a las 24 h).
- Enlaces: tarjeta → `/tarjetas/[id]` o `/creditos/[id]` con el botón «Pagar» enfocado; «Calendario ›» en el título → `/pagos/calendario?rango=30`.

**Gastos fijos (276).** Título: «Gastos fijos · 3 de 9 pagados» (izquierda) y «Todos ›» (derecha) → `/pagos/fijos`.

- Rejilla de 2 columnas × 4 filas = 8 posiciones. Con 8 o menos gastos se muestran todos; con más, 7 + «Ver todos (N)».
- Orden: vencidos, luego parciales y pendientes por fecha, y pagados al final. Un gasto que no toca en este periodo (p. ej. bimestral) no aparece.
- Ficha de 175 × 56, relleno 8 (inferior 4): línea 1 nombre a 14/18 sp peso 600 (1 línea, «…») + icono de estado de 16 dp a la derecha; línea 2 detalle a 12/16 sp; barra de progreso de 4 dp pegada al borde inferior.

| Estado | Línea 2 | Icono | Barra | Fondo |
|---|---|---|---|---|
| Pendiente | `$450 mil · 15/11` | círculo vacío | 0 % | `surface` |
| Pronto (≤ 3 días) | `$450 mil · en 2 días` | reloj | 0 % | `surface`, borde `warning` |
| Parcial | `Falta $250 mil · 15/11` | círculo a medias | % pagado, `primary` | `surface` |
| Pagado | `Pagado $450 mil · 05/11` | visto | 100 %, `positive` | `surface-2` (se atenúa) |
| Vencido | `Vencido 05/11 · $450 mil` | exclamación | % pagado, `negative` | `negative-container` |
| Omitido este mes | `Omitido en noviembre` | guion | sin barra | `surface-2` |

- Tocar → hoja «Marcar pago» (§3.5). Mantener pulsado 500 ms → pago total con cuenta y fecha por defecto, vibración ligera y aviso «Arriendo pagado · Deshacer» durante 5 s. La misma acción existe como botón dentro de la hoja (no depende del gesto).

**Fila de atajos (48).** Hasta 6 fichas: las plantillas más usadas en los últimos 30 días para ese día de la semana, con icono de categoría y
último monto («Gasolina $180.000», «Mercado», «Domicilio»). Última ficha fija: «Otro…». Tocar → hoja de alta precargada (§3.2). Sin
historial todavía: «Gasolina», «Mercado», «Transporte», «Comida» sin monto.

**Franja de alerta (48).** Una línea: icono de severidad de 20 dp + texto a 14 sp (corta con «…») + «1/3 ›». Prioridad: vencidos →
vence hoy → saldo insuficiente para compromisos → confirmaciones pendientes («¿Te cobraron Netflix $44.900?») → presupuesto ≥ 80 %. Deslizar
en horizontal pasa a la siguiente. Tocar → destino de la alerta. Sin alertas: «Todo al día · próximo pago en 6 días» con icono `positive`
(el bloque no desaparece: la distribución es constante).

### 2.6 Estados de la pantalla

- **Cargando**: esqueletos con la misma geometría (sin saltos de distribución); los KPI aparecen en ≤ 300 ms desde caché local.
- **Vacío (primer uso sin datos)**: los bloques 3 y 4 muestran una tarjeta de una acción: «Agrega tu primer gasto fijo» y «Agrega una tarjeta o préstamo». Los KPI muestran `$0` con «Registra un ingreso para empezar».
- **Sin conexión**: segunda línea de 12 sp dentro de la cabecera, bajo el periodo: «Sin conexión · datos de las 14:32» (la cabecera no crece y la distribución no cambia); los pagos y gastos se encolan y muestran la marca «Por sincronizar».
- **Error de servidor**: el bloque afectado muestra «No pudimos cargar · Reintentar» dentro de su caja; los demás siguen funcionando.

### 2.7 Tableta y escritorio

**Tableta vertical (768 × 1024, riel de 80 dp).** Dos columnas: izquierda (KPI de 120 dp + gastos fijos en lista de filas de 56 dp),
derecha (próximos pagos en lista vertical de 64 dp por fila + notificaciones). Atajos en la barra superior.

**Escritorio.** Referencia: ventana de 1280 × 640 dp de área visible (portátil de 1366 × 768 con el navegador). Barra lateral 248, barra superior 56, relleno 16.

| Zona | Posición | Alto | Contenido |
|---|---|---|---|
| Barra superior | todo el ancho | 56 | Periodo, buscador, «+ Movimiento (N)», ojo, campana |
| Fila de KPI | 12 columnas, 4 tarjetas | 88 | Te queda · Gastado · Disponible hoy · Liquidez 30 d (con selector 15/30/60/90) |
| Gastos fijos | columnas 1–7 | 448 | Tabla: cabecera 40 + 10 filas de 40 (nombre, fecha, pagado/total, barra, botón «Pagar»); más de 10: «Ver todos» |
| Próximos pagos | columnas 8–12 | 260 | Cabecera 40 + 5 filas de 44 |
| Notificaciones | columnas 8–12 | 172 | Cabecera 40 + 3 filas de 44 |

Suma vertical: 56 + 16 + 88 + 16 + 448 + 16 = 640 (columna derecha: 260 + 16 + 172 = 448). Con más alto, bajo la fila principal aparecen
«Gasto por categoría» (barras horizontales) y «Flujo de caja mensual»; nunca empujan lo anterior fuera de la primera pantalla.

Los demás contenidos del módulo «dashboard financiero» (patrimonio, ingresos frente a egresos, flujo mensual, gasto por categoría, deudas
pendientes, proyecciones) están a un toque: desglose de cada KPI en teléfono, segunda fila en escritorio, e Informes (§3.13).

---

## 3. Pantallas y flujos

Convención de los esquemas: `[ ]` botón o ficha, `( )` opción, `›` navega, `▾` despliega. Cada pantalla lista sus estados vacío y de error.

### 3.1 Primer uso (`/bienvenida/1…5`)

Cinco pasos, barra de progreso de 4 dp arriba, «Omitir» siempre visible; cada paso guarda al avanzar y se puede retomar.

| Paso | Pregunta | Qué crea en el núcleo | Mínimo para avanzar |
|---|---|---|---|
| 1 | «¿Dónde tienes tu plata?»: fichas del catálogo (Bancolombia, Davivienda, BBVA, Banco de Bogotá, Nequi, Daviplata, Efectivo…) → tipo (ahorros, corriente, billetera, efectivo), nombre, saldo de hoy, «Exenta de 4x1000» | Cuentas de activo + movimiento de **saldo inicial** (contra Patrimonio) | 1 cuenta |
| 2 | «¿Tienes tarjetas de crédito?»: emisor, nombre, cupo, saldo usado hoy, día de corte, día de pago, tasa (opcional) | Cuenta de pasivo + `CreditCard` + saldo inicial | Ninguno |
| 3 | «¿Tienes préstamos?»: tipo, saldo actual, valor de la cuota, próximo vencimiento | Cuenta de pasivo + recurrencia de la cuota | Ninguno |
| 4 | «¿Qué pagas todos los meses?»: lista sugerida con casillas (Arriendo, Administración, Energía, Agua, Gas, Internet, Celular, Gimnasio, Netflix, Spotify) → monto y día para cada uno | Recurrencias de naturaleza fija + movimientos pendientes del periodo actual | Ninguno |
| 5 | «¿Cuánto te entra y cuándo?»: salario u otros (monto, día, cuenta) y permiso de notificaciones (explicado antes del diálogo del sistema) | Recurrencia de ingreso | Ninguno |

```
┌ 4 de 5 ████████████░░░  Omitir ┐
│ ¿Qué pagas todos los meses?    │
│ [✓] Arriendo   $1.200.000  día 5 ▾│
│ [✓] Internet   $   89.900  día 12▾│
│ [ ] Energía    (monto variable)   │
│ [+ Otro gasto fijo]               │
│ Total mensual: $1.289.900         │
│            [ Atrás ] [ Continuar ]│
└───────────────────────────────────┘
```

Al terminar: Resumen con una guía de 3 globos (ficha de gasto fijo, «+», campana) que se puede cerrar. Errores: saldo no numérico
(«Escribe solo números»), día fuera de 1–31, corte igual al día de pago (aviso, no bloqueo).

### 3.2 Nuevo movimiento (hoja, `/movimientos/nuevo`)

Hoja inferior al 92 % del alto. Teclado numérico propio (no el del sistema) para que nada salte.

```
┌──────────────── Nuevo movimiento ─────────── ✕ ┐
│ ( Egreso )( Ingreso )( Transferencia )         │ 44
│                 $ 180.000                      │ 64  monto 32 sp
│ Se suma a la deuda de tu Visa. No sale plata   │ 20  frase de efecto
│ de tu cuenta.                                  │
│ ¿En qué?  [Gasolina][Mercado][Domicilio][Café] │ 48  sugerencias (contraparte o categoría)
│           [Buscar o crear…]                    │
│ ¿Con qué? [Visa Bancolombia ✓][Nequi][Efectivo]│ 48  medios de pago
│ [Hoy 10/11 ▾] [1 cuota ▾] [Confirmado ▾]       │ 44  fichas de contexto
│ Transporte › Combustible · Variable · Necesario│ 20  resumen de clasificación (sugerida)
│ #vehículo #movilidad            Más detalles ▾ │
│ ┌ 1 ┬ 2 ┬ 3 ┐                                  │
│ │ 4 │ 5 │ 6 │        teclado 4 × 52            │ 208
│ │ 7 │ 8 │ 9 │                                  │
│ │000│ 0 │ ⌫ │                                  │
│ [              Guardar              ]          │ 52
└────────────────────────────────────────────────┘
```

**Rutas de rapidez**

| Caso | Pasos | Toques |
|---|---|---|
| Gasto habitual con el mismo monto | Atajo «Gasolina $180.000» en el Resumen → «Guardar» | **2** |
| Gasto habitual con otro monto | Atajo → teclear monto → «Guardar» | 2 + monto |
| Gasto nuevo | «+» → monto → una sugerencia de «¿En qué?» → «Guardar» | 3 + monto |
| Pago de un gasto fijo | Mantener pulsada la ficha | **1** |

**Valores por defecto inteligentes.** Al elegir una contraparte o plantilla se rellenan categoría, subcategoría, naturaleza, clasificación,
etiquetas, centro de costo y medio de pago con el valor **más frecuente en los últimos 5 movimientos** de esa contraparte (empate: el más
reciente). Sin contraparte, la categoría aporta naturaleza y clasificación. Sin nada, el medio de pago es el último usado. Los campos
sugeridos llevan un punto `info` de 6 dp y la leyenda «sugerido»; al editarlos desaparece.

**«Más detalles»** (acordeón; nada es obligatorio salvo tipo, monto, fecha y cuenta):

| Campo | Control | Notas |
|---|---|---|
| Tipo | Segmentos | Ingreso, Egreso, Transferencia. «Reembolso o devolución» es una casilla que invierte el signo y pide el movimiento original |
| Categoría y subcategoría | Selector jerárquico con búsqueda | Personalizable en 8 › Categorías |
| Naturaleza | Segmentos Fijo · Variable | Independiente de la categoría |
| Clasificación | Segmentos Necesario · Discrecional | Independiente de la naturaleza |
| Etiquetas | Fichas múltiples con alta en línea | |
| Centro de costo | Selector (Personal, Hogar, Vehículo, Trabajo…) | Interfaz en v2; campo en el modelo desde v1 |
| Medio de pago | Fichas | Cuenta, tarjeta débito (usa su cuenta), tarjeta de crédito, billetera, efectivo |
| Contraparte | Texto con autocompletar | |
| Estado | Pendiente · Confirmado | Fecha futura propone «Pendiente» |
| Cuotas (solo tarjeta de crédito) | Paso 1–48 + tasa | Vista previa «6 × $200.000 · 0 %»; con interés separa capital e interés |
| 4x1000 | Casilla «Aplicar GMF ($720)» | Marcada sola si la cuenta de origen no es exenta (§3.15) |
| Adjuntos | [Cámara] [Archivo] | Hasta 5 por movimiento, 10 MB cada uno; JPG, PNG, PDF |
| Dividir | Personas y reparto | Compras compartidas, v3 (§3.14) |
| Atributos personalizados | Según definición | v2 |
| Nota | Texto libre, 280 caracteres | |

Ejemplo del propietario, tal como queda: Egreso · `$180.000` · Transporte › Combustible · Variable · Necesario · #vehículo #movilidad ·
Tarjeta de crédito · 10/11/2026.

**Frases de efecto** (sustituyen a débitos y créditos):

| Selección | Frase |
|---|---|
| Egreso con cuenta o débito | «Sale de Ahorros Bancolombia. Quedan $3.240.000.» |
| Egreso con tarjeta de crédito | «Se suma a la deuda de tu Visa. No sale plata de tu cuenta.» |
| Transferencia a tarjeta de crédito | «Pagas tu Visa desde Ahorros. Baja la deuda; no es un gasto nuevo.» |
| Transferencia entre cuentas | «Pasa de Ahorros a Nequi. No cambia cuánto tienes.» |
| Ingreso | «Entra a Ahorros Bancolombia.» |
| Pendiente | «Queda como pendiente: no cambia tus saldos hasta que lo confirmes.» |

**Errores y bordes.** Monto 0: «Guardar» inactivo. Saldo insuficiente: aviso no bloqueante «Ahorros quedaría en −$20.000». Cupo de tarjeta
superado: aviso con el cupo disponible. Posible duplicado (misma cuenta, mismo monto, fecha ±1 día, misma contraparte): «Ya registraste
$180.000 en Terpel ayer. ¿Guardar de todos modos?». Sin conexión: se guarda en cola con clave de idempotencia y marca «Por sincronizar».
Fallo al subir un adjunto: el movimiento se guarda y el adjunto queda en «Reintentar».

### 3.3 Movimientos: historial, detalle, estados y asientos

**Historial (`/movimientos`).** Segmentos Todos · Ingresos · Egresos · Transferencias. Barra de filtros: periodo, cuenta, tarjeta,
categoría, etiqueta, estado, naturaleza, clasificación, contraparte, monto. Agrupado por día con subtotal. Fila de 64 dp: icono de
categoría, contraparte o descripción (1 línea), categoría · medio (1 línea, 12 sp), monto con signo, insignia de estado, clip si hay adjunto.
Deslizar a la izquierda: «Confirmar» (si pendiente) o «Anular»; a la derecha: «Duplicar». En escritorio es una tabla con selección
múltiple para confirmar, etiquetar o exportar.

**Estados y cómo se ven**

| Estado | Aspecto | Efecto en saldos |
|---|---|---|
| **Pendiente** | Insignia de contorno punteado con reloj; monto en `text-secondary` | No cuenta en saldos ni en «Gastado»; sí en proyecciones, calendario y liquidez |
| **Confirmado** | Sin insignia (estado normal) | Cuenta |
| **Conciliado** | Doble visto `info`; candado al editar | Cuenta; bloqueado contra cambios de monto, cuenta y fecha |
| **Anulado** | Monto tachado + insignia «Anulado» neutra; oculto por defecto (filtro «Mostrar anulados») | No cuenta; conserva el original y su reverso |

**Transiciones permitidas**

| De | A | Cómo | Qué pasa en el Ledger |
|---|---|---|---|
| Pendiente | Confirmado | «Confirmar» (monto, fecha y cuenta editables) | Los asientos pasan a contar |
| Pendiente | Anulado | «Descartar» u «Omitir este mes» | Nada que revertir; queda el rastro |
| Confirmado | Conciliado | Conciliación de la cuenta (§3.6) | Se marca con el identificador de la conciliación |
| Confirmado | Anulado | «Anular» con motivo obligatorio | Se escribe un **asiento de reverso**; nunca se borra |
| Conciliado | Confirmado | «Reabrir conciliación» (confirmación explícita) | Se quita la marca; queda en auditoría |
| Anulado | — | Terminal. «Duplicar» crea uno nuevo | |

Editar un confirmado: nota, etiquetas, clasificación y adjuntos se cambian en el sitio; monto, fecha, cuenta o categoría generan reverso
más asiento nuevo (el usuario solo ve «Editado», con el antes y el después en el historial de cambios).

**Detalle (`/movimientos/[id]`).** Cabecera con monto, estado y frase de efecto; bloque de clasificación; origen («Generado por la
recurrencia Netflix › », «Cuota 3 de 6 de la compra del 10/11 ›», «Parte del extracto de noviembre ›»); adjuntos; acciones Confirmar ·
Editar · Duplicar · Anular; y dos enlaces discretos al final: **«Ver asientos»** y **«Historial de cambios»**.

```
┌ Ver asientos ─ Gasolina Terpel · 10/11/2026 ───┐
│ Cuenta                      Debe        Haber   │
│ Gasto · Transporte ›     $180.000               │
│   Combustible                                   │
│ Pasivo · Visa Bancolombia            $180.000   │
│ ─────────────────────────────────────────────── │
│ Total                    $180.000    $180.000 ✓ │
│ Estado: confirmado · Asiento n.º 1.284          │
└─────────────────────────────────────────────────┘
```

Es de solo lectura, opcional y el único lugar donde aparecen «Debe» y «Haber». Un movimiento anulado muestra además su reverso.

**Historial de cambios** (auditoría por movimiento): línea de tiempo «10/11/2026 14:32 · Creado por ti (app Android)», «11/11 09:10 ·
Monto: $170.000 → $180.000», «12/11 · Conciliado (extracto de noviembre)».

Vacío: «Aún no hay movimientos en noviembre» + [Agregar movimiento]. Filtros sin resultado: «Nada coincide» + [Quitar filtros].

### 3.4 Gastos fijos y reinicio mensual (`/pagos/fijos`)

Un gasto fijo es una **recurrencia** de naturaleza fija. Lo que se ve cada mes son sus **movimientos pendientes** del periodo.

```
┌ Gastos fijos ─ Noviembre 2026 ▾ ───────── + ┐
│ Pagado $1.249.900 de $2.339.900  ████▁▁ 53 %│
│ ATRASADOS (de octubre)                       │
│ ! Administración  $210.000  venció 28/10  [Pagar]│
│ POR PAGAR                                    │
│ ◔ Internet   $49.900 de $89.900 · 12/11 [Pagar]│
│ ○ Energía    ~$130.000 (estimado) · 18/11 [Pagar]│
│ PAGADOS                                      │
│ ✓ Arriendo   $1.200.000 · 05/11  Ahorros     │
│ NO TOCAN ESTE MES                            │
│ – Predial (anual, marzo)                     │
└──────────────────────────────────────────────┘
```

**Reinicio mensual: reglas**

1. Al abrir cada `FinancialPeriod` (día 1 a las 00:00 de Bogotá, o el día de inicio configurado) el motor genera, **de forma idempotente**
   (única por recurrencia y periodo), un movimiento pendiente por cada gasto fijo que toque en ese periodo, con el monto esperado y la fecha de vencimiento ajustada por festivos.
2. «Reiniciar» no borra nada: los pagos del mes anterior son movimientos confirmados que se quedan en su periodo.
3. Lo no pagado del periodo anterior **no se pierde ni se duplica**: su pendiente sigue vivo, pasa al grupo «Atrasados» y cuenta como vencido hasta que se pague o se omita con motivo.
4. Montos variables (servicios públicos): el esperado es el promedio de los últimos 3 pagos, mostrado con `~` y «estimado». Al pagar otro valor, el usuario elige «Era todo» (cierra el mes con ese valor) o «Es un abono» (queda parcial).
5. Cambiar el monto o el día de la recurrencia afecta desde el periodo siguiente; «solo este mes» edita el pendiente.
6. Si la aplicación estuvo cerrada, el servidor genera igual; al abrir, una notificación resume: «Noviembre empezó: 9 gastos fijos por $2.339.900».
7. Día 29, 30 o 31 en un mes más corto: último día del mes.

Vacío: «Aún no tienes gastos fijos» + lista sugerida del primer uso. Error de generación: banda «No pudimos preparar noviembre · Reintentar» (nunca genera a medias).

### 3.5 Marcar un pago (hoja, `/pagos/fijos/[id]/pagar`)

```
┌ Internet · noviembre ──────────────── ✕ ┐
│ $49.900 pagado de $89.900   ████████▁▁▁▁ │
│ Vence 12/11/2026 · en 2 días            │
│ [ Pagar lo que falta  $40.000 ]         │ primario, 52 dp
│ ( ) Otro valor  [ $        ]            │
│     ( ) Es un abono  ( ) Era todo       │
│ Desde  [Ahorros Bancolombia ▾]          │
│ Fecha  [Hoy 10/11 ▾]   [Adjuntar recibo]│
│ Pagos de este mes                       │
│  03/11  $49.900  Nequi                › │
│ [Omitir este mes]   [Ver movimientos ›] │
└─────────────────────────────────────────┘
```

Qué ocurre:

- **Pago total**: el movimiento pendiente pasa a confirmado con la cuenta y fecha elegidas.
- **Pago parcial**: se crea un movimiento confirmado por el abono, ligado a la misma recurrencia y periodo, y el pendiente queda con el saldo restante. Progreso = confirmado ÷ (confirmado + pendiente).
- **Pago con tarjeta de crédito**: el gasto cuenta hoy y sube la deuda de la tarjeta (frase de efecto visible).
- **Deshacer** (5 s) o «Anular» después: reverso y el pendiente recupera su valor.
- Si el pago supera lo esperado: «Pagaste $9.000 más de lo esperado. ¿Actualizar el valor para los próximos meses?».
- Errores: sin cuenta elegida, monto 0, fecha anterior al inicio de la recurrencia.

El mismo patrón de hoja sirve para cuotas de préstamo (reparte capital, interés y cargos) y para confirmar suscripciones.

### 3.6 Cuentas y tarjetas (`/cuentas`), conciliación e importación

**Lista.** Cabecera «Disponible hoy $3.420.000 · Debes $2.170.000». Pestañas del propietario: **Bancos** (ahorros, corriente, billeteras
Nequi y Daviplata, bolsillos anidados bajo su cuenta), **Efectivo**, **Débito**, **Crédito**. Fila de 72 dp: logotipo o inicial de la
institución, nombre, tipo, saldo confirmado y, si difiere, «proyectado $…». Insignias: «Exenta 4x1000», «Sin conciliar hace 45 días».

**Detalle de cuenta.** Saldo confirmado y proyectado; mini gráfica de 30 días; acciones [Transferir] [Conciliar] [Ver movimientos];
bolsillos y fondos (cada uno con su saldo; «Mover plata» es una transferencia interna); tarjetas débito asociadas; próximos compromisos que
salen de esta cuenta con «¿Alcanza?» (saldo proyectado tras cada uno).

**Tarjeta débito.** No es una cuenta: es un medio de pago de su cuenta. Muestra cuenta asociada, saldo disponible (el de la cuenta),
compras y retiros, comisiones (cuota de manejo como recurrencia), transferencias, retenciones y 4x1000 del periodo, e historial filtrado por ese medio.

**Conciliación (`/cuentas/[id]/conciliar`)**

```
Paso 1  Fecha de corte del extracto [31/10/2026]   Saldo final del extracto [$ 3.512.400]
        [Importar extracto (CSV, Excel, OFX)]  opcional, v2
Paso 2  ┌ Saldo del extracto    $3.512.400 ┐
        │ Marcado en FMS        $3.467.400 │   fijo arriba
        │ Diferencia              −$45.000 │   negative si ≠ 0
        └──────────────────────────────────┘
        [✓] 28/10  Éxito            −$182.300
        [✓] 29/10  Nómina         +$5.200.000
        [ ] 30/10  Retiro cajero    −$200.000   (no aparece en el extracto)
Paso 3  Diferencia $0 → [Conciliar 23 movimientos]
        Diferencia ≠ 0 → [Agregar movimiento faltante] [Crear ajuste de $45.000] [Guardar y seguir luego]
```

- Solo se listan movimientos confirmados y no conciliados con fecha ≤ corte. Al conciliar pasan a **conciliado** y se guarda el registro de la conciliación (fecha, saldo, usuario).
- «Crear ajuste» genera un movimiento en la categoría «Ajustes de conciliación», visible y auditable; nunca se retoca el saldo a mano.
- El saldo conciliado siguiente parte del anterior; una conciliación se puede reabrir (queda en auditoría).

**Importar extracto (`/cuentas/importar`, v2)**. Cuatro pasos: (1) archivo CSV, XLSX u OFX y cuenta; (2) mapeo de columnas (fecha,
descripción, valor o débito/crédito, saldo) con vista previa de 5 filas y formato de fecha y decimales; el mapeo **se guarda por banco** y se
propone solo la próxima vez; (3) revisión fila por fila; (4) resumen.

| Resultado por fila | Regla de cruce | Acción por defecto |
|---|---|---|
| Coincide con pendiente | Misma cuenta, mismo valor, fecha ±3 días | Confirmar el pendiente con la fecha del banco |
| Coincide con confirmado | Mismo valor, fecha ±3 días | Marcar para conciliar |
| Posible duplicado | Mismo valor y fecha ±1 día, descripción parecida, ya importado | No importar (el usuario decide) |
| Nuevo | Sin cruce | Crear como confirmado con categoría sugerida por la descripción |

Errores: archivo ilegible («No reconocemos el formato; prueba con CSV»), columnas obligatorias sin mapear, fechas ambiguas (pide el
formato), más de 5.000 filas (pide dividir). La importación es una operación reversible completa («Deshacer importación» anula todo su lote).

Vacío de cuentas: «Agrega tu primera cuenta» con el catálogo de instituciones.

### 3.7 Tarjeta de crédito (`/tarjetas/[id]`)

```
┌ Visa Bancolombia · Activa ▾ ───────────────────┐
│ Usado $1.320.000 de $5.000.000   ████▁▁▁▁ 26 % │
│ Disponible $3.680.000                          │
│ Corte: 30/11 (en 20 días)   Pago: 16/12        │
│ ┌ Extracto de octubre ────────────────────────┐│
│ │ Pago total $850.000 · Mínimo $212.000       ││
│ │ Vence 16/11 · en 6 días      [ Pagar ]      ││
│ └─────────────────────────────────────────────┘│
│ [Compra] [Avance] [Simular compra] [Ver movimientos]│
│ Cuotas pendientes (3)                          │
│  Portátil       4 de 12 · $150.000/mes · 2,1 % EM ›│
│  Tiquetes       2 de 6  · $200.000/mes · 0 %      ›│
│ Extractos ›   Uso del cupo (12 meses) ›   Datos ›  │
└────────────────────────────────────────────────┘
```

- **Datos**: emisor, nombre, franquicia, últimos 4 dígitos, cupo total, cupo disponible (calculado), saldo usado (calculado), tasa y convención (EA, EM, NMV…), día de corte, día de pago, cuota de manejo (monto y periodicidad: es una recurrencia), estado (activa, bloqueada, cancelada), «compras a 1 cuota sin interés» (sí/no), sistema de cuotas (capital constante por defecto, configurable), pago que se muestra en el Resumen (mínimo o total).
- **Compra a cuotas**: en el alta, «Cuotas» de 1 a 48 y tasa (la de la tarjeta o 0 %). Se crea el plan de cuotas ligado al movimiento.
- **Avance**: transferencia de la tarjeta a una cuenta o a efectivo (sube la deuda, no es gasto) más la comisión como gasto; genera interés desde el día 1.
- **Diferir**: desde una compra de 1 cuota, «Diferir a N cuotas» recalcula el plan desde el siguiente extracto.
- **Pagar** (`/tarjetas/[id]/pagar`): opciones Total del extracto · Mínimo · Otro valor; cuenta de origen; frase «Baja tu deuda; no es un gasto nuevo». Un pago por encima del mínimo se aplica primero a intereses y cargos, luego a capital facturado y el resto a capital diferido (orden configurable por tarjeta).
- **Extracto** (`/tarjetas/[id]/extractos/2026-10`): es una **vista** de los asientos de la cuenta de pasivo entre dos cortes: saldo anterior, compras, cuotas facturadas (capital), intereses corrientes, intereses de mora, cuota de manejo, pagos, saldo nuevo, pago mínimo y total. Botón «Ajustar al extracto del banco» para registrar el interés real (el banco manda; la aplicación estima y lo marca «estimado»).
- **Uso del cupo**: barras por mes (usado ÷ cupo) con línea de referencia en 30 %; alimenta el indicador «utilización de tarjetas».
- **Mora**: si pasa la fecha de pago sin cubrir el mínimo, estado «En mora», interés de mora estimado y notificación.

**Simular compra (`/tarjetas/[id]/simular`)**

```
Valor [$ 1.200.000]   Cuotas [ 6 ]   Tasa [ 0 % ▾ ]
→ 6 cuotas de $200.000 · Interés total $0 · Pagas $1.200.000

Tasa [ 24 % EA = 1,8088 % EM ]   Sistema: capital constante
 N.º  Saldo        Capital    Interés   Cuota
 1    $1.200.000   $200.000   $21.705   $221.705
 2    $1.000.000   $200.000   $18.088   $218.088
 3      $800.000   $200.000   $14.470   $214.470
 4      $600.000   $200.000   $10.853   $210.853
 5      $400.000   $200.000    $7.235   $207.235
 6      $200.000   $200.000    $3.618   $203.618
 Total             $1.200.000 $75.969   $1.275.969
[Registrar esta compra]   Cupo tras la compra: $2.480.000
```

Capital e interés siempre en columnas separadas. Vacío: «Sin compras este periodo». Tarjeta bloqueada o cancelada: no acepta compras nuevas, sí pagos.

### 3.8 Créditos y obligaciones (`/creditos`)

Pestañas del propietario: **Préstamos** (lista), **Cuotas** (todas las cuotas próximas y vencidas de préstamos y compras diferidas, por
fecha), **Intereses** (interés corriente y de mora pagado por mes y por obligación; tasa vigente y comparación con la tasa de usura
vigente), **Amortizaciones** (tablas y simuladores, §3.9), **Deudas personales**.

Tipos: personal, libre inversión, hipotecario, educativo, vehículo, compra a cuotas, deuda personal, préstamo a terceros (este último es un activo).

```
┌ Libre inversión Davivienda ────────────────────┐
│ Saldo $17.364.601 de $20.000.000  ███▁▁▁▁ 13 % pagado│
│ Cuota $723.048 · próxima 20/11 (en 10 días) [Pagar cuota]│
│ Cuota 7 de 36 · termina 20/04/2029             │
│ Tasa 1,5 % EM (19,56 % EA) · fija · cuota fija │
│ Seguro $12.000/mes · Otros cargos $0           │
│ [Tabla de amortización] [Abono extra] [¿Y si…?] [Ver movimientos]│
│ Pagado a la fecha: capital $2.635.399 · interés $1.702.888│
└────────────────────────────────────────────────┘
```

Campos por obligación: capital inicial, saldo actual (calculado del Ledger), tasa y tipo (fija o variable con índice y margen), convención
de tasa, **sistema de amortización elegido por el usuario** (cuota fija, capital constante, solo interés con pago final, personalizado; nunca
se presume), plazo, cuotas restantes, fecha de desembolso, próximo vencimiento, fecha final, seguro, otros cargos, tasa de mora, cuenta de pago por defecto, unidad (COP o UVR, v3).

**Pagar cuota**: la hoja de §3.5 con el reparto precalculado y editable: «Capital $462.579 · Interés $260.469 · Seguro $12.000» (cuota $723.048 + seguro). El
movimiento escribe tres asientos de destino; solo interés y seguro cuentan como gasto. Si el banco cobró distinto, se edita y la tabla se recalcula desde ahí.

**Deudas personales**. «Me deben» y «Debo». Ficha por persona: saldo, fecha acordada, abonos (cada abono es un movimiento), [Registrar
abono] [Recordar] (comparte un texto: «Hola, Camilo: te recuerdo los $300.000 del 02/10»), recordatorio propio configurable.

Vacío: «No tienes créditos registrados» + [Agregar préstamo] [Simular uno]. Error de tabla: «Con estos datos la cuota no cubre el interés; revisa tasa o plazo».

### 3.9 Tasas y simuladores (`/creditos/simuladores/…`)

**Conversor de tasas.** Un campo de entrada con convención (EA, EM, NMV, NTV, diaria) y todas las equivalentes debajo. Fórmulas:
`i_m = (1 + i_a)^(1/12) − 1`; nominal = periódica × número de periodos. Con 4 decimales.

```
Tasa [ 24,00 ] [ EA ▾ ]
 Efectiva mensual (EM)        1,8088 %
 Nominal mes vencido (NMV)   21,7051 %
 Efectiva trimestral          5,5250 %
 Nominal trim. vencido (NTV) 22,1001 %
 Diaria (365)                 0,0590 %
 Tasa de usura vigente (consumo) al 10/11/2026: tomada de Parámetros ›
```

**Tabla de amortización y cuota fija.** Entradas: capital, tasa, plazo, sistema, seguro, fecha de inicio. Salida: cuota, interés total,
costo total del crédito, tabla (N.º, fecha, saldo, capital, interés, seguro, cuota) con exportación.

```
Capital $20.000.000 · 36 meses · 1,5 % EM · cuota fija
Cuota $723.048 · Interés total $6.029.725 · Costo total $26.029.725
 N.º  Interés    Capital    Saldo
 1    $300.000   $423.048   $19.576.952
 2    $293.654   $429.394   $19.147.558
 3    $287.213   $435.835   $18.711.724
```

**Abono extra a capital** (dos columnas lado a lado; ejemplo: abono de $2.000.000 tras la cuota 6, saldo $17.364.601):

| | Sin abono | Reducir plazo | Reducir cuota |
|---|---|---|---|
| Cuota | $723.048 | $723.048 | $639.770 |
| Cuotas restantes | 30 | 26 (la última, menor) | 30 |
| Interés restante | $4.326.836 | $3.276.130 | $3.828.485 |
| **Ahorro en interés** | — | **$1.050.706** | **$498.351** |

**Comparar alternativas**: hasta 3 ofertas (tasa, plazo, seguro, cargos) con cuota, interés total, costo total y la más barata resaltada con texto («Menor costo total»), no solo con color.

Estados: entradas incompletas (resultado en blanco con «Completa capital, tasa y plazo»); tasa superior a la de usura vigente (aviso `warning`, no bloqueo); plazo > 600 meses (error).

### 3.10 Suscripciones y recurrencias (`/pagos/suscripciones`, `/pagos/recurrencias/[id]`)

Motor independiente: gastos fijos, suscripciones, cuotas, ingresos, cuota de manejo y costos de vehículos son recurrencias con distinto subtipo.

```
┌ Suscripciones ─ $170.200 al mes · $2.042.400 al año ─ + ┐
│ ACTIVAS                                                  │
│ Netflix    $44.900 · mensual · Visa · próximo 14/11  ›   │
│   ↑ subió $6.000 desde octubre                           │
│ Spotify    $17.900 · mensual · Nequi · próximo 22/11 ›   │
│ iCloud     US$2,99 (≈ $12.400) · mensual · Visa · próximo 03/12  ›   │
│ POR CONFIRMAR                                            │
│ ? Gimnasio $95.000 · esperado 08/11  [Sí, me cobraron][No]│
│ PAUSADAS (1)   CANCELADAS (2)                            │
└──────────────────────────────────────────────────────────┘
```

**Formulario de recurrencia**: nombre y descripción; tipo (ingreso o egreso); monto esperado (fijo o estimado); categoría y etiquetas;
cuenta o tarjeta; fecha de inicio y de fin opcional; frecuencia; día de generación; próxima ejecución (calculada, con vista previa de las
3 siguientes fechas); estado (activa, pausada, cancelada); renovación automática y fecha de renovación; avisos (antes del cobro, al
cancelar, si sube el precio).

| Frecuencia | Parámetro |
|---|---|
| Diaria, semanal, quincenal | Día de la semana o días 15 y último |
| Mensual, bimestral, trimestral, semestral, anual | Día del mes (o «último día») y mes de anclaje |
| Cada N días | N entre 1 y 365 |
| Personalizada | Lista de días del mes, o «n.º día hábil», o «último viernes» |

**Festivos y fines de semana** (calendario colombiano de Parámetros): por recurrencia, «Mismo día» (por defecto en cobros con tarjeta),
«Día hábil anterior» (por defecto en ingresos) o «Día hábil siguiente» (por defecto en débitos bancarios y servicios). El sábado cuenta como no hábil salvo que se cambie.

**Generación**

| Modo | Qué hace el motor el día de generación | Qué hace el usuario |
|---|---|---|
| Confirmación manual (por defecto) | Crea el movimiento **pendiente** y notifica «¿Te cobraron Netflix $44.900?» | [Sí] confirma · [Otro valor] · [Aún no] pospone 1 día |
| Automática | Igual, y además lo deja listo con cuenta y fecha | Lo mismo: **ningún modo confirma solo** |

**Regla clave**: la suscripción es el compromiso esperado; el movimiento confirmado es lo que pasó. Netflix no cuenta en «Gastado» ni baja
ningún saldo hasta que el usuario (o un extracto importado que cruce) lo confirme. Un pendiente con más de 3 días de vencido aparece como
«Sin confirmar» en la franja de alerta.

Pausar: no genera mientras dure. Cancelar: deja de generar, conserva el historial y ofrece anotar la fecha hasta la que el servicio sigue
activo. Precio distinto al confirmar: «¿Actualizar el valor esperado a $50.900?» y registro del alza.

Vacío: «Sin suscripciones» + sugerencias. Error: frecuencia sin fechas futuras («Esta regla no genera ninguna fecha»).

### 3.11 Calendario financiero (`/pagos/calendario`)

Vistas Día · Semana · Mes y rangos «Próximos 7 · 15 · 30» y «Vencidos». Muestra: pago y corte de tarjetas, suscripciones, servicios,
arriendo, cuotas de préstamos, ingresos esperados, pendientes, impuestos, renovaciones y costos de vehículos (SOAT, técnico-mecánica).

```
┌ Noviembre 2026 ▾   (Mes)(Semana)(Día)   [7][15][30][Vencidos 1] ┐
│  L   M   X   J   V   S   D                                      │
│                          1                                       │
│  2F  3   4   5•  6   7   8        • egreso  ◦ ingreso  ▫ corte   │
│  9  10  11  12• 13  14• 15•••     F festivo                      │
│ 16F 17  18• 19  20• 21  22        número en negative: saldo < 0  │
│ ...                                                              │
│ ─ Domingo 15/11/2026 ─────────────────────────────────────────── │
│ Necesitas $550.000 disponibles                                   │
│ Saldo proyectado: $1.900.000 → $1.350.000                        │
│  Administración        $250.000   Ahorros   [Pagar]              │
│  Celular               $120.000   Nequi     [Pagar]              │
│  Seguro del carro      $180.000   Ahorros   [Pagar]              │
└──────────────────────────────────────────────────────────────────┘
```

- Cada día muestra hasta 3 puntos y «+2». La lista del día dice **«Necesitas $550.000 disponibles»** (250.000 + 120.000 + 180.000) y el saldo proyectado antes y después.
- En vista de lista (rangos), cada compromiso lleva a la derecha el **saldo proyectado tras ese compromiso**; el primero que deja una cuenta en negativo se marca «No alcanza: faltan $80.000 en Nequi» con [Transferir].
- Los festivos colombianos se marcan con «F» y nombre; una fecha movida por festivo dice «Movido del 16/11 (festivo)».
- Tocar un compromiso: hoja «Marcar pago». Mantener pulsado un día vacío: nuevo movimiento pendiente o recordatorio.

Vacío: «Sin compromisos en este rango». Vencidos: lista aparte ordenada por antigüedad con el total adeudado.

### 3.12 Presupuestos y metas (`/plan/…`)

**Presupuestos.** Un presupuesto guarda **dimensión + límite + periodo**; lo ejecutado se **lee** de los asientos de gasto. Dimensiones:
categoría, subcategoría, cuenta, centro de costo, etiqueta; periodo mensual, quincenal, anual o personalizado.

```
┌ Presupuestos ─ Noviembre ▾ ──────────────────── + ┐
│ Total $1.370.000 de $1.550.000  ████████▁ 88 %     │
│ Mercado       $640.000 / $800.000  ████████▁ 80 % !│
│   Te quedan $160.000 · $8.000 por día (20 días)    │
│ Transporte    $310.000 / $400.000  ███████▁▁ 78 %  │
│ Restaurantes  $420.000 / $350.000  ██████████ 120 % (excedido $70.000)│
└────────────────────────────────────────────────────┘
```

Detalle: presupuestado frente a real por mes (barras pareadas), ritmo («a este paso terminas en $960.000»), subcategorías y **«Ver
movimientos»**. Estados de la barra: normal < 80 %, atención 80–99 % (`warning` + icono), excedido ≥ 100 % (`negative` + texto «excedido»).

**Metas** (pestañas del propietario «Ahorro» y «Objetivos»). Tipos: comprar vehículo, vacaciones, fondo de emergencia, comprar vivienda,
pagar una deuda, ahorrar un monto. Crear una meta **crea o enlaza una cuenta o fondo de ahorro**; el progreso es su saldo. Una meta «pagar
una deuda» enlaza la cuenta de pasivo y su progreso es lo abonado a capital. Ficha: `$3.200.000 de $12.000.000 · 27 %`, fecha objetivo,
aporte mensual necesario («$733.000 al mes para llegar el 30/11/2027»), [Aportar] (una transferencia) y **«Ver movimientos»**.

**Planeación e indicadores (`/plan/indicadores`).** Tarjetas con valor, fórmula visible al tocar y tendencia de 6 meses:

| Indicador | Fórmula |
|---|---|
| % de ingresos comprometidos | (gastos fijos + cuotas de deuda del mes) ÷ ingresos del mes |
| Capacidad de ahorro | (ingresos − gastos − abonos a capital) ÷ ingresos |
| Endeudamiento | pasivos totales ÷ activos totales; y cuotas de deuda ÷ ingresos |
| Gastos fijos frente a ingresos | gastos de naturaleza fija ÷ ingresos |
| Variación mensual del gasto | (gasto del mes − gasto del mes anterior) ÷ gasto del mes anterior |
| Utilización de tarjetas | saldo usado ÷ cupo total, global y por tarjeta |

Vacíos: «Crea tu primer presupuesto a partir de lo que gastaste en octubre» (propone límites = promedio de 3 meses); «Define una meta».

### 3.13 Informes y analítica (`/informes`)

**Patrón común.** Barra de filtros fija: **periodo, categoría, cuenta, tarjeta, etiqueta y tipo de movimiento** (más escenario en los
informes proyectados). Botón **Exportar**: Excel (.xlsx), CSV y PDF; exporta lo filtrado, con los filtros y la fecha de generación en la
cabecera. En teléfono cada informe es: cifra principal → gráfica → tabla. En escritorio, gráfica y tabla lado a lado. Toda cifra de tabla
abre **«Ver movimientos»** con el filtro exacto. Toda gráfica tiene vista de tabla equivalente.

| Informe | Qué analiza | Vista principal |
|---|---|---|
| Estado de resultados personal | Ingresos frente a gastos | Tabla por categoría con % y resultado neto; barra apilada **necesario frente a discrecional** y tabla categoría · monto · % |
| Flujo de caja | Entradas y salidas de dinero | Tabla mensual saldo inicial · entradas · salidas · saldo final; barras de entradas y salidas con línea de saldo |
| Patrimonio neto | Activos menos pasivos | Cifra grande, composición de activos y barras de pasivos |
| Endeudamiento | Obligaciones totales | Saldo por obligación, tasa, cuota, fecha final; razón deuda/ingreso |
| Gastos recurrentes | Compromisos mensuales | Lista por recurrencia con costo mensual y anual |
| Tarjetas | Utilización y deuda | Uso del cupo por mes, intereses y cuota de manejo pagados |
| Suscripciones | Costos recurrentes | Costo mensual y anual, alzas de precio detectadas |
| Presupuestos | Planeado frente a real | Barras pareadas y desviación por categoría |
| Evolución patrimonial | Crecimiento o caída | Línea de patrimonio, activos y pasivos en el tiempo |
| Proyección financiera | Escenarios futuros | Tabla de pronóstico (abajo) |

**Estadísticas** agrupa: ranking de gasto por categoría (barras horizontales), gasto por naturaleza y por clasificación, línea diaria, y
**Gastos hormiga**: egresos discrecionales de monto ≤ umbral (por defecto $20.000, configurable) que se repiten ≥ 4 veces al mes en la misma
categoría o contraparte. Muestra «Café: 14 veces · $98.000 al mes · $1.176.000 al año» y el total mensual y anual.

**Proyecciones (`/informes/proyecciones`)**

```
Escenario: (Base)(Optimista)(Pesimista)[+ Crear]        Horizonte: [15][30][60][90 d][12 m]
                    Sep      Oct      Nov ▸     Dic       Ene
                    real     real     en curso  proyect.  proyect.
Saldo inicial    2.900.000 3.150.000 3.420.000 ┆1.250.000┆ 1.610.000┆
Entradas         5.200.000 5.200.000 5.200.000 ┆5.200.000┆ 5.200.000┆
Salidas          4.950.000 4.930.000 7.370.000 ┆4.840.000┆ 4.900.000┆
Saldo final      3.150.000 3.420.000 1.250.000 ┆1.610.000┆ 1.910.000┆
```

- **Real y proyectado se distinguen por forma, no solo por color**: columnas reales con fondo `surface` y texto normal; proyectadas con fondo `surface-2`, borde izquierdo punteado y rótulo «proyect.»; en la gráfica, barras sólidas frente a barras con trama y línea de saldo discontinua.
- **Escenarios**: Base (recurrencias + promedio de gasto variable de 3 meses), Optimista (ingresos +5 %, gasto variable −10 %) y Pesimista (ingresos −10 %, gasto variable +15 %); los porcentajes son editables. **Escenarios propios**: copia de uno existente con ajustes (cambiar un ingreso, quitar una suscripción, añadir un gasto único, variar una tasa).
- **Liquidez**: dinero disponible en 15, 30, 60 y 90 días con el primer día de saldo negativo.
- **Comparar (`/informes/proyecciones/comparar`)**: hasta 3 columnas lado a lado para «¿y si…?»: anticipar una cuota, cancelar una suscripción, abonar a capital. Filas: saldo a 12 meses, interés total pagado, fecha de fin de la deuda, patrimonio a 12 meses; la diferencia frente a «Hoy» va con signo y texto.
- **Independencia financiera (`/informes/proyecciones/independencia`)**: entradas gasto mensual objetivo, ahorro mensual, rentabilidad real esperada, tasa de retiro (4 % por defecto, editable), obligaciones vigentes. Salida: capital necesario, **fecha estimada de independencia** y curva de patrimonio; todo rotulado «estimación, no asesoría».

**Patrimonio (`/informes/patrimonio`)**: cifra de patrimonio neto, línea de tendencia, composición de activos (líquidos, ahorro e inversión,
inmuebles, vehículos, cuentas por cobrar) y pasivos (tarjetas, préstamos, deudas personales).

**Activos (`/informes/patrimonio/activos/[id]`)**: inmuebles, vehículos, inversiones y otros. Valor actual con fecha de avalúo (una
actualización de valor es un movimiento contra Patrimonio › Valorización), crédito asociado y documentos. **Vehículo**: placa, modelo,
odómetro actual (se actualiza al registrar combustible o a mano); costos fijos anuales (SOAT, técnico-mecánica, impuesto vehicular, seguro)
como recurrencias anuales con aviso 30 y 7 días antes; mantenimiento (aceite, filtros, revisión) programado **por fecha, por kilometraje o
lo que ocurra primero** («cada 6 meses o 5.000 km»); costo total por mes y por kilómetro. Todo alimenta el Calendario y Gastos fijos.

Vacío: «Necesitas al menos un mes de movimientos para este informe». Error de exportación: «No pudimos generar el PDF · Reintentar».

### 3.14 Compras compartidas (`/movimientos/compartidos`, v3)

En el alta, «Dividir»: personas (contactos propios de la aplicación), reparto **por partes iguales, por porcentaje o por monto** (la suma
debe dar el total; el resto se asigna al usuario). Efecto: mi parte es gasto; la de los demás es una cuenta por cobrar a cada persona.
Pantalla de saldos: «Laura te debe $85.000», «Le debes a Andrés $40.000», detalle por persona y [Saldar] (transferencia que cierra la cuenta por cobrar o por pagar), con abonos parciales.

### 3.15 Configuración financiera (`/config/…`)

- **Categorías**: árbol de 2 niveles (categoría y subcategoría), arrastrar para ordenar, icono y color, valores por defecto de naturaleza y clasificación, fusionar, archivar (no borrar si tiene movimientos).
- **Etiquetas**: lista con conteo de uso, renombrar, fusionar. **Centros de costo** y **atributos personalizados** (texto, número, fecha, lista; a qué tipo de movimiento aplican) viven aquí en v2.
- **Instituciones**: catálogo de bancos y billeteras de Colombia precargado (editable; se pueden añadir entidades), con mapeos de importación guardados.
- **Monedas** (v2): COP como base; USD, EUR y otras con **tasas de cambio fechadas** (manuales o de una fuente configurada). Un movimiento en otra moneda guarda monto original, moneda, tasa y fecha de la tasa; los informes consolidan en COP.
- **Reglas**: §3.16.
- **Parámetros Colombia (`/config/parametros`)**: tablas de datos **con vigencia desde–hasta, nunca en el código**.

```
┌ Parámetros › Tasa de usura · consumo y ordinario ──────── + ┐
│ Vigente hoy: (valor) % EA · desde 01/11/2026 hasta 30/11/2026│
│ Valor (EA)   Desde        Hasta        Fuente        Nota    │
│ …            01/11/2026   30/11/2026   Resolución …          │
│ …            01/10/2026   31/10/2026   Resolución …          │
│ [Agregar vigencia]  [Importar CSV]                           │
└──────────────────────────────────────────────────────────────┘
```

| Tabla | Clave | Uso |
|---|---|---|
| Tasa de usura | modalidad + rango de fechas | Aviso si una tasa registrada la supera en su fecha |
| UVR | fecha | Préstamos indexados (v3) |
| Tasas de referencia (IBR, DTF, IPC) | índice + fecha | Tasas variables: índice + margen |
| GMF (4x1000) | tasa + rango de fechas, y tope exento | Cálculo automático del gravamen |
| UVT | año | Topes expresados en UVT |
| Festivos | año | Motor de recurrencias y calendario (generados por regla y editables) |
| Tasas de cambio | par + fecha | Conversión (v2) |
| Condiciones de crédito por producto | producto + rango de fechas | Tasa, cuota de manejo y cargos vigentes de cada tarjeta o préstamo |

Validaciones: los rangos de una misma clave no se solapan; un hueco de vigencia avisa «Sin valor vigente desde 01/12/2026»; cambiar un
valor pasado pide confirmación porque recalcula estimaciones (nunca movimientos confirmados). Todo cambio queda en auditoría.

- **GMF 4x1000**: cada cuenta tiene «Exenta de 4x1000» y «Calcular GMF automáticamente». En un egreso o transferencia desde una cuenta no exenta se añade al mismo movimiento la línea de gasto «Impuestos › GMF» (transferir $1.000.000 → GMF $4.000). No se aplica por defecto entre cuentas propias de la misma institución; la casilla del formulario permite corregir cada caso. **Retenciones y comisiones** se registran igual, como líneas adicionales del movimiento (categorías «Retenciones» y «Comisiones»).
- **Auditoría (`/config/auditoria`)**: tabla de solo lectura con fecha y hora, usuario, dispositivo, acción (creó, modificó, confirmó, concilió, anuló), entidad y **valores antes y después**; filtros por fecha, usuario, acción y entidad; exportable. No se puede editar ni borrar.

### 3.16 Notificaciones y reglas (`/notificaciones`, `/config/reglas`)

**Centro de notificaciones**: grupos «Hoy», «Esta semana», «Anteriores»; fila de 72 dp con icono de severidad, título, detalle, hora y
acciones en línea ([Marcar pagado] [Posponer]); punto de no leída; deslizar para archivar; filtro por tipo.

**Reglas = disparador + condición + acción + canal.** v1 trae las predefinidas con interruptor y un parámetro; el constructor libre llega en v3.

```
┌ Regla: Aviso de pago de tarjeta ─────────── (activa ●) ┐
│ CUANDO   [Se acerca un vencimiento ▾]                  │
│ SI       [Tipo = tarjeta de crédito] [Faltan = 5 días] [+ condición]│
│ ENTONCES [Notificar ▾] «{tarjeta}: paga {monto} antes del {fecha}»│
│ POR      [✓ Push] [✓ En la app] [ ] Correo             │
│ Hora de envío [08:00]   Respeta horas de silencio [✓]  │
│ [Probar ahora]  Última vez: 11/10/2026 08:00           │
└────────────────────────────────────────────────────────┘
```

| Regla predefinida | Disparador | Condición por defecto | Acción | Activa |
|---|---|---|---|---|
| Pago de tarjeta | Vencimiento próximo | 5 días y 1 día antes, 08:00 | Notificar con [Pagar] | Sí |
| Fecha de corte | Corte próximo | 2 días antes | Notificar | Sí |
| Gasto fijo por vencer | Vencimiento próximo | 3 días antes y el mismo día | Notificar con [Marcar pagado] | Sí |
| Cuota vencida | Vencimiento superado | 1 día después, luego cada 3 días | Notificar | Sí |
| Cuota de préstamo | Vencimiento próximo | 3 días y 1 día antes | Notificar | Sí |
| Confirmar suscripción | Día de cobro | 18:00 del día | Preguntar «¿Te cobraron…?» | Sí |
| Generar movimientos recurrentes | Fecha de generación | Recurrencia activa | Crear movimiento pendiente | Sí (no desactivable; se pausa la recurrencia) |
| Saldo insuficiente | Proyección diaria | Saldo proyectado de una cuenta < 0 en 7 días | Notificar con [Transferir] | Sí |
| Movimiento duplicado | Alta de movimiento | Misma cuenta y monto, fecha ±1 día | Avisar en el formulario | Sí |
| Presupuesto | Asiento de gasto | Categoría ≥ 80 % y ≥ 100 % | Notificar | Sí (v2) |
| Suscripción más cara | Confirmación | Monto > esperado | Notificar y proponer actualizar | Sí (v2) |
| Utilización alta de tarjeta | Asiento en tarjeta | Usado ÷ cupo ≥ 70 % | Notificar | No (v2) |
| Renovación anual | Renovación próxima | 30 y 7 días antes | Notificar | Sí |
| Resumen semanal | Lunes 08:00 | — | Resumen de la semana | No |
| Inicio de periodo | Apertura del periodo | — | «Noviembre empezó: 9 gastos fijos por $2.339.900» | Sí |

**Horas de silencio**: 21:00–07:00 por defecto; lo que cae dentro se entrega a las 07:00 agrupado. Excepción: seguridad (inicio de sesión
nuevo, 2FA). Tope de 3 push al día fuera de vencimientos de hoy y seguridad; el resto se agrupa en un resumen.

**Aspecto**

| Canal | Formato |
|---|---|
| Push | Título ≤ 40 caracteres: «Visa Bancolombia vence en 5 días». Cuerpo ≤ 90: «Paga $850.000 antes del 16/11. Toca para pagar.» Acciones: [Marcar pagado] [Recordar mañana]. Con «ocultar montos en notificaciones», el cuerpo no lleva cifras |
| En la aplicación | Campana con contador, franja de alerta del Resumen, punto en la pestaña «Pagos», aviso temporal inferior de 5 s para confirmaciones y «Deshacer» |
| Correo (v3) | Resumen diario o semanal en texto y tabla; nunca datos de acceso |

Canales de Android: Vencimientos (alta), Confirmaciones (media), Alertas y presupuesto (media), Resúmenes (baja), Seguridad (alta).
Permiso denegado: banda en Notificaciones «Los avisos push están apagados · Activar en Ajustes»; todo sigue llegando dentro de la aplicación.

### 3.17 Acceso y seguridad

`/ingresar` (correo y contraseña) → `/ingresar/2fa` (código TOTP de 6 dígitos con pegado automático; códigos de respaldo). En el
dispositivo: bloqueo biométrico o PIN al volver tras 1 minuto en segundo plano (configurable), pantalla oculta en el selector de
aplicaciones, «ocultar montos». Errores: código inválido («Código incorrecto. Te quedan 4 intentos»), bloqueo temporal tras 5 fallos,
sesión vencida (vuelve al destino tras ingresar).

---

## 4. Tokens de diseño — identidad «Añil y Guayaba»

Concepto: papel cálido y tinta añil para lo estructural, guayaba solo para la acción de crear («+»), y semánticos reservados para estados
financieros. Sin tarjeta-héroe oscura ni degradados: la jerarquía la dan el tamaño de la cifra y el espacio. Los contrastes de la última
columna están calculados (WCAG 2.1) sobre el fondo indicado.

### 4.1 Color

| Token | Claro | Oscuro | Uso | Contraste claro / oscuro |
|---|---|---|---|---|
| `canvas` | `#F6F5F1` | `#111318` | Fondo de pantalla | — |
| `surface` | `#FFFFFF` | `#1A1D24` | Tarjetas, hojas | — |
| `surface-2` | `#EDEBE4` | `#242833` | Hundidos, pagados, columnas proyectadas | — |
| `border` | `#D9D6CC` | `#343947` | Divisores decorativos | — |
| `border-strong` | `#8A867A` | `#7C8496` | Contorno de campos y fichas | 3,64 / 4,50 sobre `surface` |
| `track` | `#C9C5B8` | `#4A5062` | Fondo de barras de progreso (siempre acompañado de cifra) | decorativo |
| `text-primary` | `#1B1A17` | `#F1F1EE` | Texto y cifras | 17,40 / 14,90 sobre `surface` |
| `text-secondary` | `#55524A` | `#B9BCC6` | Rótulos, detalle | 7,15 sobre `canvas` / 8,89 |
| `text-tertiary` | `#6B675D` | `#9A9FAD` | Ayudas, pendientes | 5,64 (4,73 sobre `surface-2`) / 6,37 |
| `primary` (añil) | `#2F3EB8` | `#A5AEFF` | Acciones, enlaces, progreso | 8,39 / 8,11 |
| `on-primary` | `#FFFFFF` | `#121A66` | Texto sobre `primary` | 8,39 / 7,40 |
| `primary-container` / `on-…` | `#E3E6FB` / `#1C2580` | `#2A3170` / `#DDE0FF` | Selección, ficha activa | 10,44 / 9,13 |
| `accent` (guayaba) | `#B8324F` | `#FF8FA3` | Solo el «+» y la marca | — |
| `on-accent` | `#FFFFFF` | `#4A0A1A` | Icono sobre `accent` | 5,82 / 7,20 |
| `positive` | `#12704A` | `#5FD39A` | Ingreso, pagado, al día | 6,10 / 9,05 |
| `positive-container` / `on-…` | `#DDF3E7` / `#0C5236` | `#0F3D29` / `#A6EBC8` | Fondos de éxito | 7,93 / 8,92 |
| `negative` | `#B3261E` | `#FF8A80` | Vencido, saldo negativo, error | 6,54 / 7,39 |
| `negative-container` / `on-…` | `#FBE4E1` / `#8C1D18` | `#4A1512` / `#FFC9C4` | Fondos de vencido | 7,50 / 10,24 |
| `warning` | `#8A5A00` | `#F2C14E` | Pronto a vencer, 80 % | 5,93 / 10,05 |
| `warning-container` / `on-…` | `#FBEFD0` / `#6B4600` | `#453300` / `#FBE3A6` | Fondos de atención | 7,34 / 9,64 |
| `info` | `#1F5FA8` | `#8CBFF5` | Conciliado, sugerido | 6,44 / 8,74 |
| `info-container` / `on-…` | `#E0ECFA` / `#17497F` | `#12335A` / `#CFE4FB` | Fondos informativos | 7,64 / 9,80 |

Paleta categórica para gráficas (8 series; a partir de la novena, «Otras»). Todas ≥ 4,5:1 sobre `surface`; además cada serie lleva
rótulo directo o trama, nunca solo color:

| Serie | Claro | Oscuro |
|---|---|---|
| 1 añil | `#2F3EB8` | `#A5AEFF` |
| 2 guayaba | `#B8324F` | `#FF8FA3` |
| 3 turquesa | `#0E7C86` | `#5FD0DA` |
| 4 ocre | `#8A5A00` | `#F2C14E` |
| 5 violeta | `#6D3FB5` | `#C9A6FF` |
| 6 selva | `#12704A` | `#5FD39A` |
| 7 teja | `#A1440B` | `#FFA873` |
| 8 piedra | `#55524A` | `#B9BCC6` |

Reglas: los egresos **no** se pintan de rojo por defecto (`text-primary` con signo «−»); `negative` se reserva para vencido, saldo bajo
cero y error. Los ingresos llevan «+» y `positive`. El tema sigue al sistema y se puede forzar en Perfil.

### 4.2 Tipografía

Familias: **Sora** (600) para cifras destacadas y títulos; **Inter** (400, 500, 600) para todo lo demás, con cifras tabulares
(`fontVariant: ['tabular-nums']`) en tablas, listas y montos alineados a la derecha. Cargadas con `expo-font`; respaldo del sistema.

| Token | Familia y peso | Tamaño / interlínea (sp) | Uso |
|---|---|---|---|
| `display` | Sora 600 | 32 / 38 | Monto del formulario, patrimonio |
| `kpi` | Sora 600 | 28 / 34 (26 / 32 en disposición B) | «Te queda» |
| `title-l` | Sora 600 | 22 / 28 | Título de pantalla |
| `title-m` | Inter 600 | 18 / 24 | Título de sección, KPI secundario (20 / 28) |
| `title-s` | Inter 600 | 16 / 22 | Título de tarjeta, monto del riel |
| `body` | Inter 400 | 16 / 24 | Texto general, campos |
| `body-s` | Inter 400 (600 en nombres) | 14 / 20 (14 / 18 en fichas) | Filas, nombre de ficha |
| `label` | Inter 500 | 13 / 16 | Botones compactos, fichas |
| `caption` | Inter 400 | 12 / 16 | Detalle de ficha, rótulos de KPI |
| `micro` | Inter 500 | 11 / 14 | Solo etiquetas de la barra inferior y contadores |

Ningún texto de contenido baja de 12 sp. Los textos escalan con la preferencia del sistema hasta 2,0 (§2.4 para el Resumen).

### 4.3 Espaciado, radios, elevación y movimiento

- **Espaciado** (dp): `0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48`. Margen de pantalla 16 (compacto) o 24. Relleno de tarjeta 12; de hoja 16.
- **Radios** (dp): `xs` 6 (insignias), `sm` 10 (fichas, campos), `md` 14 (tarjetas), `lg` 20 (hojas, esquinas superiores), `full` 999 (píldoras, «+»).
- **Elevación**:

| Nivel | Uso | Claro (sombra) | Oscuro |
|---|---|---|---|
| 0 | Tarjetas sobre `canvas` | Sin sombra, borde `border` de 1 dp | Sin sombra, borde `border` |
| 1 | Fichas pulsables, barra inferior | `0 1 2 rgba(27,26,23,0.08)` | `surface` + 4 % de blanco |
| 2 | «+», menús | `0 4 12 rgba(27,26,23,0.14)` | `surface` + 8 % de blanco |
| 3 | Hojas y diálogos | `0 8 24 rgba(27,26,23,0.20)` + velo `rgba(17,19,24,0.48)` | `surface` + 11 % de blanco + velo al 60 % |

- **Movimiento**:

| Token | Valor | Uso |
|---|---|---|
| `duration-instant` | 100 ms | Presión (escala 0,97), cambio de estado de icono |
| `duration-fast` | 180 ms | Fichas, avisos temporales, conmutadores |
| `duration-base` | 240 ms | Hojas, transición entre pantallas |
| `duration-slow` | 320 ms | Barra de progreso al pagar, reordenar fichas |
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Entradas y cambios |
| `ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Salidas (duran 0,75 × la entrada) |
| `spring-sheet` | amortiguación 26, rigidez 260, masa 1 | Hojas arrastrables |

  Vibración: ligera al confirmar un pago; de aviso en error. Las cifras no hacen conteo animado (cambian con fundido de 180 ms).
  Con «reducir movimiento»: sin traslaciones ni escalas, solo fundidos de 120 ms; las barras saltan a su valor.

### 4.4 Formato de números, moneda y fechas

Una sola función de formato para toda la aplicación (no se usa la salida cruda de `Intl`, que varía entre motores).

| Caso | Regla | Ejemplo |
|---|---|---|
| COP | Símbolo `$` pegado, punto de miles, **sin decimales** | `$1.200.000` |
| COP con centavos (solo si la parte decimal ≠ 0, p. ej. interés exacto en «Ver asientos») | Coma decimal, 2 cifras | `$21.704,98` |
| Negativo | Signo menos tipográfico (U+2212) antes del símbolo; nunca paréntesis ni solo color | `−$180.000` |
| Con signo en listas | Egreso `−`, ingreso `+`, transferencia sin signo y con icono ⇄ | `+$5.200.000` |
| Cero | `$0` | |
| Abreviado (solo fichas, riel y KPI estrechos) | ≥ 1.000.000: 1 decimal y «M»; ≥ 10.000: «mil»; menor: completo | `$1,2 M` · `$450 mil` · `$8.500` |
| Estimado | Prefijo `~` y rótulo «estimado» | `~$130.000` |
| Otras monedas | Código antes del símbolo, 2 decimales, y equivalente en COP debajo | `US$2,99` · `≈ $12.400` |
| Porcentajes y tasas | Coma decimal, espacio antes de `%`, convención siempre al lado; tasas con 2 a 4 decimales | `1,8088 % EM` · `24,00 % EA` |
| Captura de montos | Separadores de miles mientras se escribe; tecla `000`; máximo 13 cifras enteras | |
| Almacenamiento | `Decimal(18,2)` para montos, `Decimal(12,8)` para tasas, redondeo mitad-al-par al centavo y visualización al peso | |
| Fecha | `DD/MM/YYYY`; corta `DD/MM` solo dentro del periodo visible; con mes `10 nov` en gráficas | `10/11/2026` |
| Relativa | «hoy», «mañana», «en 6 días», «hace 2 días» hasta ±30 días, siempre junto a la fecha absoluta en detalle | `Vence 16/11 · en 6 días` |
| Hora | 24 h | `14:32` |
| Periodo | Mes y año con mayúscula inicial | `Noviembre 2026` |
| Alineación | Montos a la derecha con cifras tabulares; en tablas, misma cantidad de decimales por columna | |

---

## 5. Componentes y estados

Estados base de todo componente interactivo: reposo, presionado (escala 0,97 + `primary-container`), foco (anillo `primary` de 2 dp
separado 2 dp; visible con teclado en web), deshabilitado (opacidad 0,38, sin sombra), cargando.

| Componente | Variantes | Estados propios |
|---|---|---|
| `AppBar` | Resumen (periodo, ojo, campana), interior (atrás, título, acciones) | Con banda «sin conexión»; con periodo pasado |
| `TabBar` | 5 posiciones con «+» central | Activa (icono relleno + etiqueta `primary`), insignia de punto, oculta con teclado |
| `NavRail` / `Sidebar` | 80 dp · 248 dp · plegada 64 dp | Sección desplegada o plegada, elemento activo |
| `MoreSheet` | Lista agrupada de 8 secciones | Con búsqueda, sin resultados |
| `KpiStrip` | Teléfono (tarjeta única) · escritorio (4 tarjetas) | Normal, negativo, montos ocultos, esqueleto, sin ingresos |
| `SegmentedBar` | 2 o 3 tramos | Tramo sólido, tramado, vacío |
| `DueCard` (riel) | Tarjeta de crédito · préstamo | Normal, pronto, hoy, vencido, pagado, sin extracto aún |
| `FixedChip` | 175 × 56 · 164 × 52 · fila de tabla | Pendiente, pronto, parcial, pagado, vencido, omitido, «Ver todos», estimado |
| `QuickChip` | Con y sin monto | Reposo, presionado, «Otro…» |
| `AlertStrip` | Crítica, atención, información, todo al día | Con paginación n/N |
| `Fab` («+») | 52 dp · 48 dp | Reposo, presionado, menú de pulsación larga |
| `Sheet` | Parcial 60 % · alta 92 % · diálogo en escritorio (560 dp) | Arrastrable, con teclado, con cambios sin guardar («¿Descartar?») |
| `AmountField` + `Keypad` | COP · otra moneda | Vacío, con valor, error, estimado |
| `EffectSentence` | Egreso, crédito, transferencia, ingreso, pendiente | Aviso (saldo insuficiente, cupo superado) |
| `ChipSelect` | Simple · múltiple · con alta en línea | Sugerido (punto `info`), seleccionado, desbordado («+3») |
| `Segmented` | 2 a 4 opciones | Seleccionado, deshabilitado |
| `TextField` / `Select` / `DateField` | Con rótulo fijo arriba | Reposo, foco, relleno, error (texto + icono), ayuda |
| `Stepper` | Cuotas 1–48 | Mínimo y máximo alcanzados |
| `TransactionRow` | 64 dp · fila de tabla 40 dp | Pendiente, confirmado, conciliado, anulado, por sincronizar, con adjunto, seleccionada |
| `StatusBadge` | Pendiente, conciliado, anulado, estimado, proyectado, en mora, exenta 4x1000 | — |
| `ProgressBar` | 4 dp (ficha) · 6 dp (KPI) · 8 dp (presupuesto, cupo) | Normal, atención ≥ 80 %, excedido ≥ 100 %, completado |
| `AccountRow` / `CardSummary` / `LoanSummary` | — | Sin conciliar, en mora, bloqueada, cancelada |
| `EntriesTable` («Ver asientos») | — | Cuadrado (visto), con reverso |
| `ReconcileHeader` | — | Diferencia cero (`positive`), distinta de cero (`negative`) |
| `ImportMapper` / `ImportReviewRow` | — | Coincide con pendiente, con confirmado, duplicado, nuevo, error de fila |
| `CalendarGrid` / `AgendaList` | Mes, semana, día, rango | Hoy, seleccionado, festivo, con vencidos, saldo negativo |
| `AmortizationTable` | Compacta · completa | Fila pagada, actual, futura, con abono extra |
| `CompareColumns` | 2 o 3 columnas | Mejor opción rotulada |
| `ForecastTable` / `Chart` | Barras, línea, anillo, barras horizontales | Real, en curso, proyectado; vacío; vista de tabla |
| `ScenarioSelector` | Base, Optimista, Pesimista, propios | Seleccionado, editar, crear |
| `FilterBar` + `ExportMenu` | Fichas de filtro · xlsx, csv, pdf | Filtro activo (contador), generando, error |
| `RuleEditor` | Predefinida (interruptor + parámetro) · constructor | Activa, pausada, inválida, probada |
| `ParamTable` | Con vigencias | Vigente hoy, futura, vencida, hueco, solapada (error) |
| `AuditTimeline` | Por movimiento · global | Antes y después |
| `NotificationRow` | Con acciones | No leída, leída, archivada |
| `Snackbar` | Con «Deshacer» (5 s) | Información, error (permanece hasta cerrar) |
| `EmptyState` / `ErrorState` / `Skeleton` | Ilustración lineal de 96 dp + 1 frase + 1 acción | — |
| `AttachmentTile` | Imagen, PDF | Subiendo (porcentaje), listo, error con reintento |

---

## 6. Accesibilidad (WCAG 2.1 AA)

- **Contraste**: texto ≥ 4,5:1 y componentes y gráficos ≥ 3:1 (tabla de §4.1, calculada). El par más justo es `text-tertiary` sobre `surface-2` en claro: 4,73:1, que cumple.
- **Nunca solo color**: cada estado lleva icono y texto (pendiente = reloj + contorno punteado; vencido = exclamación + «Vencido»; proyectado = trama + rótulo). Los signos «+» y «−» son texto.
- **Objetivos táctiles**: mínimo 44 × 44 dp con 8 dp de separación. Las fichas de 36 dp amplían su área con `hitSlop` 4. Las fichas de gasto fijo miden 52–56 dp de alto.
- **Gestos con alternativa**: pulsación larga (pago total), deslizar (confirmar, anular, pasar alerta) y arrastrar (ordenar) tienen siempre un botón equivalente.
- **Lector de pantalla** (`accessibilityLabel` en español):
  - Montos: valor sin separadores + unidad, con sentido: `−$180.000` → «egreso de 180000 pesos»; `$1,2 M` → «1200000 pesos» (nunca la abreviatura); oculto → «monto oculto».
  - Fechas: «10 de noviembre de 2026»; relativas: «vence en 6 días, el 16 de noviembre».
  - Ficha de gasto fijo: «Internet. Pagado 49900 de 89900 pesos, 56 por ciento. Vence el 12 de noviembre. Botón. Toca dos veces para marcar un pago. Acción disponible: pagar todo.» (acciones personalizadas para «Pagar todo» y «Omitir»).
  - Barras de progreso: `accessibilityRole="progressbar"` con valor mínimo, máximo y actual.
  - Gráficas: resumen textual («Gasto de noviembre: Mercado 28 por ciento, Transporte 13 por ciento…») y tabla alternativa.
  - Tasas: «1,8088 por ciento efectivo mensual».
- **Orden de foco** en el Resumen: cabecera → KPI → alerta → próximos pagos → gastos fijos → atajos → barra inferior. Los avisos temporales y cambios de saldo se anuncian con región viva «polite»; los errores, «assertive».
- **Teclado (web)**: todo alcanzable con Tab; atajos `N` (nuevo), `/` (buscar), `G` luego `R/M/P` (ir a Resumen, Movimientos, Pagos); `Esc` cierra hojas; el foco queda atrapado en diálogos y vuelve al origen al cerrar.
- **Movimiento reducido**: respeta la preferencia del sistema (§4.3). Sin parpadeos ni desplazamientos automáticos.
- **Texto**: escala hasta 2,0 sin pérdida de función; idioma declarado `es-CO`; ningún texto en imágenes; formularios con rótulo visible (no solo marcador) y errores asociados al campo.
- **Tiempo**: «Deshacer» de 5 s tiene equivalente permanente («Anular» en el detalle); la sesión avisa 60 s antes de cerrarse.

---

## 7. Glosario y reglas de negocio

### 7.1 Glosario

| Término | Definición |
|---|---|
| **Ledger (libro)** | Registro de partida doble: cada movimiento tiene líneas de débito y crédito que suman lo mismo. Es la única fuente de saldos |
| **Cuenta** | Nodo del plan de cuentas: activo, pasivo, ingreso, gasto o patrimonio. Una cuenta bancaria es activo; una tarjeta de crédito y un préstamo son pasivo; una categoría es una cuenta de ingreso o de gasto |
| **Movimiento** (`Transaction`) | Hecho o compromiso económico con fecha, estado y asientos. Tipos: ingreso, egreso, transferencia |
| **Asiento** (`Entry`) | Línea de un movimiento: cuenta, débito o crédito, monto |
| **Estado** | Pendiente (esperado), confirmado (ocurrió), conciliado (ocurrió y coincide con el banco), anulado (revertido) |
| **Transferencia** | Movimiento entre dos cuentas propias de activo o pasivo; no es ingreso ni gasto. Pagar una tarjeta o abonar a capital es una transferencia |
| **Gasto (devengado)** | Débito a una cuenta de gasto. Ocurre al comprar, sea con efectivo o con tarjeta de crédito |
| **Salida de caja** | Crédito a una cuenta de activo líquida. Ocurre al pagar con débito o efectivo, y al pagar la tarjeta o la cuota |
| **Naturaleza** | Fijo o variable. No depende de la categoría |
| **Clasificación** | Necesario o discrecional. No depende de la naturaleza |
| **Recurrencia** | Regla que genera movimientos pendientes con una frecuencia. Subtipos: gasto fijo, suscripción, ingreso, cuota |
| **Gasto fijo** | Recurrencia de egreso de naturaleza fija que se muestra por periodo con su avance de pago |
| **Suscripción** | Recurrencia de un servicio con renovación; compromiso esperado, no cobro |
| **Periodo** (`FinancialPeriod`) | Mes financiero (por defecto, mes calendario) en el que se agrupan presupuestos y gastos fijos |
| **Obligación** | Deuda representada por una cuenta de pasivo: tarjeta, préstamo, compra a cuotas, deuda personal |
| **Cupo total, usado, disponible** | Límite de la tarjeta; saldo de su cuenta de pasivo; diferencia entre ambos |
| **Fecha de corte / fecha de pago** | Cierre del extracto / límite para pagarlo sin mora |
| **Extracto** | Vista de los asientos de una tarjeta entre dos cortes, con pago mínimo y total |
| **Pago mínimo / pago total** | Lo exigible del extracto para no entrar en mora / todo lo facturado |
| **Interés corriente / de mora** | Costo del dinero dentro del plazo / recargo por pagar tarde. Ambos son gasto |
| **EA, EM, NMV, NTV** | Efectiva anual, efectiva mensual, nominal mes vencido, nominal trimestre vencido |
| **Tasa de usura** | Tope legal de interés; dato con vigencia en Parámetros |
| **UVR / UVT** | Unidad de valor real (créditos indexados) / unidad de valor tributario (topes) |
| **GMF (4x1000)** | Gravamen a los movimientos financieros: 4 pesos por cada 1.000 que salen de una cuenta no exenta |
| **Bolsillo / fondo** | Subcuenta de activo que aparta plata dentro de una cuenta; base de las metas |
| **Conciliación** | Cotejo de los movimientos confirmados de una cuenta contra el extracto del banco |
| **Saldo confirmado / proyectado** | Suma de asientos confirmados y conciliados / lo anterior más los pendientes hasta una fecha |
| **Te queda** | Lo que aún se puede gastar en el periodo (fórmula en §2.5) |
| **Escenario** | Conjunto de supuestos para proyectar (base, optimista, pesimista, propios) |
| **Gasto hormiga** | Egreso discrecional pequeño y frecuente (umbral y frecuencia configurables) |

### 7.2 Reglas que el desarrollo no puede equivocar

**R1. Fuente única.** Todo saldo, total, progreso o indicador se calcula del Ledger. No existe un campo de saldo editable. Las cachés se
pueden reconstruir desde los asientos y deben coincidir al centavo.

**R2. Todo movimiento cuadra.** Suma de débitos = suma de créditos, en la misma transacción de base de datos; si no cuadra, no se guarda.

**R3. Compra con tarjeta de crédito ≠ salida de caja.**

| Hecho | Débito | Crédito | «Gastado» | Caja |
|---|---|---|---|---|
| Compra de $200.000 con tarjeta | Gasto · Alimentación 200.000 | Pasivo · Tarjeta 200.000 | +200.000 | 0 |
| Pago de la tarjeta | Pasivo · Tarjeta 200.000 | Activo · Cuenta bancaria 200.000 | 0 | −200.000 |
| Interés del extracto $21.705 | Gasto · Intereses 21.705 | Pasivo · Tarjeta 21.705 | +21.705 | 0 |
| Avance de $300.000 | Activo · Efectivo 300.000 | Pasivo · Tarjeta 300.000 | 0 | +300.000 |
| Cuota de préstamo $735.048 | Pasivo · Préstamo 462.579 · Gasto · Intereses 260.469 · Gasto · Seguros 12.000 | Activo · Cuenta 735.048 | +272.469 | −735.048 |
| Transferencia de $1.000.000 con GMF | Activo · Nequi 1.000.000 · Gasto · GMF 4.000 | Activo · Ahorros 1.004.000 | +4.000 | −4.000 neto |
| Reembolso de $50.000 | Activo · Cuenta 50.000 | Gasto · (categoría original) 50.000 | −50.000 | +50.000 |

El gasto se cuenta **una vez, el día de la compra**. El pago de la tarjeta nunca es gasto. Una compra a cuotas reconoce el gasto completo
el día de la compra; las cuotas son el calendario de pago del pasivo (pregunta abierta 2).

**R4. Suscripción ≠ movimiento confirmado.** Una recurrencia solo genera movimientos **pendientes**. Un pendiente no altera saldos
confirmados, «Gastado», presupuestos ni informes de lo real; sí alimenta calendario, liquidez y proyecciones. Solo una acción del usuario
(o el cruce aceptado de un extracto importado) lo confirma. No existe la confirmación automática por paso del tiempo.

**R5. Reinicio mensual.** Generación idempotente por (recurrencia, periodo); nada se borra; lo no pagado sigue pendiente y pasa a
«Atrasados»; un pago parcial es un movimiento confirmado más un pendiente por el resto; el progreso de una ficha es confirmado ÷
(confirmado + pendiente) de esa recurrencia en ese periodo. El «reinicio» es solo la aparición de los pendientes del nuevo periodo.

**R6. Anular no es borrar.** Anular un confirmado escribe el reverso con usuario, fecha y motivo. Un conciliado no se anula sin reabrir
la conciliación. Ningún movimiento confirmado se elimina físicamente.

**R7. Proyecciones.** Saldo proyectado a una fecha = saldo confirmado + pendientes con fecha ≤ esa fecha. Todo valor proyectado o
estimado se rotula y se distingue por forma. Una proyección jamás escribe asientos confirmados. Los vencidos sin pagar se proyectan a hoy.

**R8. Presupuestos y metas no guardan ejecución.** El presupuesto guarda límite y dimensión; la meta, objetivo y cuenta enlazada.

**R9. Tasas.** Toda tasa se guarda con su convención y se convierte con la fórmula efectiva (`i_m = (1 + i_a)^(1/12) − 1`; 24 % EA =
1,8088 % EM), nunca dividiendo una efectiva entre 12. El sistema de amortización es un dato de la obligación, no una suposición. Los
intereses calculados por la aplicación son **estimados** hasta que el usuario los ajusta al extracto del banco.

**R10. Parámetros con vigencia.** Usura, UVR, GMF, UVT, festivos, tasas de referencia y de cambio se leen de tablas por fecha de
vigencia. Ningún valor regulatorio vive en el código.

**R11. Dinero exacto.** `Decimal` de extremo a extremo (nunca coma flotante, tampoco en el cliente: se transporta como texto). Zona
horaria `America/Bogota` para decidir a qué día y periodo pertenece un movimiento.

**R12. Festivos y días hábiles.** La fecha de un compromiso se ajusta según la regla de su recurrencia y se conserva la fecha original.

**R13. Clasificación independiente.** Tipo, categoría, naturaleza, clasificación, etiquetas, centro de costo, medio de pago y
contraparte son campos separados; ninguno se deduce de otro al guardar (solo se sugieren).

**R14. Auditoría desde el día uno.** Toda creación, modificación, confirmación, conciliación y anulación deja registro con antes y después.

---

## 8. Modelo de dominio (para desarrollo)

Todas las entidades llevan `id` (UUID), `household_id`, `created_by`, `created_at`, `updated_at`. Hoy hay un `Household` con un `User`.

### 8.1 Núcleo: plan de cuentas y Ledger

| Tipo de cuenta | Saldo normal | Qué contiene |
|---|---|---|
| **Activo** | Débito | Bancos, efectivo, billeteras, ahorros, bolsillos y fondos, cuentas por cobrar (préstamos a terceros, compras compartidas), inmuebles, vehículos, inversiones |
| **Pasivo** | Crédito | Tarjetas de crédito, préstamos, compras a cuotas, deudas personales |
| **Ingreso** | Crédito | Una cuenta por categoría de ingreso |
| **Gasto** | Débito | Una cuenta por categoría y subcategoría de gasto (incluye Intereses, Comisiones, GMF, Seguros, Ajustes de conciliación) |
| **Patrimonio** | Crédito | Saldos iniciales, valorización de activos |

Reglas del Ledger: (1) cada `Transaction` tiene ≥ 2 `Entry` y cuadra; (2) los asientos heredan el estado del movimiento; saldo confirmado =
asientos en confirmado o conciliado; (3) los asientos son inmutables: corregir es reverso más asiento nuevo; (4) moneda de registro COP; un
asiento en otra moneda guarda además monto original, moneda y tasa; (5) el saldo a cualquier fecha se reconstruye sumando asientos hasta esa fecha.

### 8.2 Entidades

| Entidad | Campos clave | Relaciones |
|---|---|---|
| `User` | correo, nombre, 2FA, idioma, zona horaria | N–N `Household` (rol) |
| `FinancialInstitution` | nombre, tipo (banco, billetera, cooperativa), país, mapeos de importación | 1–N `FinancialAccount` |
| `FinancialAccount` | nombre, tipo de plan (activo, pasivo, ingreso, gasto, patrimonio), subtipo (ahorros, corriente, efectivo, billetera, bolsillo, tarjeta de crédito, préstamo, por cobrar, vehículo…), moneda, cuenta padre, exenta de GMF, líquida, estado | 1–N `Entry`; N–1 institución; padre–hijas |
| `PaymentMethod` | nombre, clase (efectivo, débito, crédito, billetera, transferencia), últimos 4 dígitos, estado | N–1 `FinancialAccount` (la cuenta que afecta) |
| `CreditCard` | emisor, cupo total, día de corte, día de pago, sistema de cuotas, cuota de manejo, estado | 1–1 `FinancialAccount` (pasivo); 1–N `InterestRate` |
| `TransactionType` | ingreso, egreso, transferencia | catálogo |
| `TransactionCategory` | nombre, padre, icono, color, naturaleza y clasificación por defecto, archivada | 1–1 `FinancialAccount` (ingreso o gasto) |
| `TransactionTag` | nombre | N–N `Transaction` |
| `Transaction` | tipo, fecha, monto, moneda, estado (pendiente, confirmado, anulado, conciliado), naturaleza, clasificación, contraparte, centro de costo, descripción, atributos personalizados (JSON validado), clave de idempotencia, `reverses_id`, `refund_of_id` | 1–N `Entry`; N–1 `PaymentMethod`, `TransactionCategory`, `FinancialPeriod`, `Recurrence`, `Installment`; 1–N `Attachment` |
| `Entry` (línea del Ledger) | débito o crédito, monto, monto original y tasa de cambio | N–1 `Transaction`, `FinancialAccount` |
| `Transfer` | cuenta origen, cuenta destino, comisión, GMF aplicado | 1–1 `Transaction` (tipo transferencia) |
| `Attachment` | archivo, tipo, tamaño, huella | N–1 `Transaction` (o activo, obligación) |
| `FinancialPeriod` | año, mes, fecha de inicio y fin, estado (abierto, cerrado) | 1–N `Transaction`, `Budget` |
| `Recurrence` | nombre, tipo, monto esperado, estimado (sí/no), frecuencia y parámetros, día de generación, regla de festivos, inicio, fin, próxima ejecución, modo de generación, estado (activa, pausada, cancelada), plantilla de clasificación | 1–N `Transaction` (única por periodo u ocurrencia); N–1 cuenta o medio de pago |
| `Subscription` | proveedor, renovación automática, fecha de renovación, historial de precio, avisos | 1–1 `Recurrence` |
| `FinancialObligation` | tipo, capital inicial, tipo de tasa, sistema de amortización, plazo, desembolso, fecha final, seguro, otros cargos, unidad (COP, UVR), sentido (debo, me deben) | 1–1 `FinancialAccount` (pasivo, o activo si es por cobrar); 1–N `InterestRate`, `AmortizationSchedule` |
| `InterestRate` | valor, convención (EA, EM, NMV, NTV, diaria), clase (corriente, mora), índice y margen si es variable, vigente desde–hasta | N–1 `CreditCard` u obligación |
| `AmortizationSchedule` | versión, parámetros con que se generó, vigente | 1–N `Installment` |
| `Installment` | número, vencimiento, capital, interés, seguro, cargos, estado | N–1 plan (de préstamo o de compra a cuotas); 1–N `Transaction` que la pagan |
| `Budget` | dimensión (categoría, subcategoría, cuenta, centro de costo, etiqueta), límite, periodicidad, umbrales | N–1 `FinancialPeriod`; **sin montos ejecutados** |
| `SavingsGoal` | nombre, tipo, monto objetivo, fecha objetivo | 1–1 `FinancialAccount` (fondo o pasivo a pagar) |
| `FinancialAlert` | regla, severidad, entidad de destino, enlace profundo, canales, leída, programada para | N–1 regla; N–1 `User` |

Entidades de apoyo que el diseño necesita además de la lista del propietario: `Household`, `Entry`, `AlertRule` (disparador, condición,
acción, canales), `Reconciliation` (cuenta, corte, saldo, movimientos), `ImportBatch`, `Counterparty`, `CostCenter`,
`CustomAttributeDefinition`, `Scenario`, `Asset` (vehículo, inmueble, inversión; 1–1 cuenta de activo; odómetro), `SharedSplit` (persona,
parte), `ParameterValue` (tabla, clave, valor, desde, hasta, fuente), `Holiday`, `ExchangeRate`, `AuditLog` (entidad, acción, antes, después, usuario, dispositivo).

### 8.3 Cómo se proyecta cada módulo sobre el núcleo

| Módulo | Lee | Escribe | Enlace «Ver movimientos» |
|---|---|---|---|
| Resumen | Asientos del periodo, pendientes | Nada (delegado en hojas) | Cada KPI |
| Gastos fijos | Pendientes y confirmados por (recurrencia, periodo) | Confirma o divide pendientes | `?recurrencia=ID&periodo=…` |
| Tarjeta de crédito | Asientos de su cuenta de pasivo | Compras (egreso), pagos (transferencia), intereses | `?cuenta=ID` y por extracto |
| Préstamo | Asientos de su pasivo, plan de cuotas | Cuota con reparto en asientos | `?cuenta=ID` |
| Presupuesto | Débitos a cuentas de gasto de su dimensión | Solo el límite | `?categoria=ID&periodo=…` |
| Meta | Saldo de su cuenta | Aportes (transferencias) | `?cuenta=ID` |
| Calendario y proyecciones | Pendientes + reglas de recurrencia a futuro | Nada | Por día |
| Informes | Asientos con filtros | Nada | Cada celda |
| Conciliación e importación | Confirmados no conciliados | Estado conciliado, ajustes | Lote o conciliación |

---

## 9. Cortes de entrega

Se respeta el corte del propietario con **cinco ajustes justificados**:

1. **El Ledger de partida doble y el registro de auditoría entran en v1** (la pantalla de auditoría, en v2). No se pueden añadir después sin migrar todos los saldos ni recuperar historia que no se guardó.
2. **Préstamo básico en v1** (cuenta de pasivo, cuota, próximo vencimiento, pago con reparto manual de capital e interés). El requisito principal del Resumen exige mostrar vencimientos de préstamos; la tabla de amortización y los simuladores quedan en v2.
3. **Liquidez a 15/30/60/90 días en v1**, solo con compromisos conocidos (sale gratis del motor de pendientes). La estimación de gasto variable y los escenarios, en v2 y v3.
4. **Importación bancaria en v2** junto a los informes: es lo que hace sostenible la conciliación. La conciliación manual está en v1.
5. **Escenarios base, optimista y pesimista en v2** (los necesita el informe «Proyección financiera»); los escenarios propios, el comparador y la independencia financiera, en v3.

### v1 — «Sé qué debo pagar y cuánto me queda»

| Corte | Alcance | Criterios de aceptación |
|---|---|---|
| 1.1 Núcleo | Acceso con 2FA, hogar único, plan de cuentas, Ledger, estados, auditoría (registro), formato COP y fechas | Todo movimiento cuadra o se rechaza; reconstruir saldos desde asientos da el mismo resultado al centavo; anular crea reverso y no borra; `$1.200.000` y `10/11/2026` en toda la interfaz |
| 1.2 Cuentas y medios | Bancos, efectivo, ahorros, bolsillos, billeteras, débito; catálogo de instituciones; saldo inicial; transferencias; GMF con cuenta exenta | Crear una cuenta con saldo inicial genera su asiento contra Patrimonio; transferir $1.000.000 desde una cuenta no exenta registra $4.000 de GMF con la tasa leída de Parámetros; entre cuentas no cambia «Disponible hoy» salvo el GMF |
| 1.3 Movimientos | Alta rápida, clasificación completa (tipo, categoría, naturaleza, clasificación, etiquetas, medio, contraparte), valores por defecto, pendientes y confirmados, reembolsos, adjuntos, historial con filtros, «Ver asientos», aviso de duplicado | Un gasto habitual se registra en 2 toques desde el Resumen; el ejemplo de la gasolina queda con sus 8 campos; la tercera compra en la misma contraparte llega con clasificación sugerida; un pendiente no cambia ningún saldo |
| 1.4 Tarjetas de crédito | Cuenta de pasivo, cupo, corte y pago, compra a 1 o N cuotas (plan simple), pago total, mínimo o parcial, avance, extracto como vista, cuota de manejo, simulador de compra | Comprar $200.000 sube «Gastado» en $200.000 y no cambia «Disponible hoy»; pagar la tarjeta baja «Disponible hoy» y no cambia «Gastado»; $1.200.000 en 6 cuotas al 0 % muestra 6 × $200.000; al 24 % EA muestra capital e interés separados (interés total $75.969) |
| 1.5 Recurrencias y gastos fijos | Motor con todas las frecuencias, festivos colombianos, generación de pendientes, suscripciones, reinicio mensual, marcar pago total y parcial, omitir, atrasados | Al cambiar de periodo aparecen los pendientes una sola vez aunque el proceso corra dos veces; un pago parcial de $49.900 sobre $89.900 muestra 56 % y «Falta $40.000»; Netflix no aparece en «Gastado» hasta confirmarlo; una fecha en festivo se mueve según su regla y muestra la original |
| 1.6 Préstamo básico | Pasivo, cuota, vencimiento, pago con reparto | Pagar una cuota de $735.048 baja el pasivo solo en el capital y suma a «Gastado» solo interés y seguro |
| 1.7 Resumen | Disposiciones A y B, escalera de degradación, KPI, riel, fichas, atajos, alerta, liquidez, escritorio | A 390 × 844 y a 360 × 740 se ven los cinco requisitos sin desplazamiento vertical (prueba automatizada de alturas con 9 gastos fijos y 3 obligaciones); «Te queda» cumple su fórmula con los datos de prueba (1.840.000); en 1280 × 640 no hay barra de desplazamiento |
| 1.8 Calendario | Mes, semana, día, rangos 7/15/30, vencidos, saldo proyectado | El día 15 con 250.000 + 120.000 + 180.000 dice «Necesitas $550.000 disponibles» y muestra el saldo antes y después; el primer compromiso que deja una cuenta en negativo se marca |
| 1.9 Notificaciones | Reglas predefinidas con interruptor y parámetro, push y en la aplicación, horas de silencio, acciones | El aviso de tarjeta llega 5 días antes a las 08:00 y abre la pantalla de pago; nada no crítico suena entre 21:00 y 07:00; «Marcar pagado» desde el push confirma el movimiento |
| 1.10 Conciliación manual y Colombia base | Conciliar contra saldo de extracto; Parámetros (GMF, festivos) con vigencia | Con diferencia $0 los movimientos pasan a conciliado y quedan bloqueados; cambiar la tasa del GMF con vigencia futura no altera movimientos pasados |
| Transversal | Accesibilidad AA, claro y oscuro, sin conexión (lectura y cola de altas), primer uso | Auditoría de contraste sin fallos; todos los objetivos ≥ 44 dp; primer uso completo en menos de 5 minutos con 2 cuentas, 1 tarjeta y 5 gastos fijos |

### v2 — «Entiendo y planeo»

| Corte | Alcance | Criterios de aceptación |
|---|---|---|
| 2.1 Créditos completos | Todos los tipos, tasas con vigencia, sistemas de amortización, tabla, mora, pestañas Cuotas e Intereses, deudas personales con abonos y recordatorios | La tabla de $20.000.000 a 36 meses y 1,5 % EM da cuota $723.048 e interés total $6.029.725; un abono de un tercero baja «Me deben» |
| 2.2 Simuladores | Conversor de tasas, cuota fija, abono extra (plazo o cuota), costo total, comparar alternativas | 24 % EA = 1,8088 % EM; el abono de $2.000.000 tras la cuota 6 ahorra $1.050.706 reduciendo plazo y $498.351 reduciendo cuota |
| 2.3 Presupuestos y metas | Presupuestos por las 5 dimensiones, metas sobre fondos, indicadores, reglas de 80 % y 100 % | El ejecutado coincide con el Historial filtrado; anular un movimiento baja el ejecutado sin tocar el presupuesto; el progreso de la meta es el saldo de su cuenta |
| 2.4 Informes y exportación | Los 10 informes, filtros comunes, xlsx, csv y pdf, estadísticas, gastos hormiga, escenarios base, optimista y pesimista, liquidez con gasto variable | Cada cifra abre sus movimientos y suma lo mismo; la exportación incluye filtros y fecha; real y proyectado se distinguen sin color |
| 2.5 Monedas | Otras monedas, tasas fechadas, consolidación en COP | Un cobro de US$2,99 guarda monto original y tasa; cambiar la tasa de hoy no altera el histórico |
| 2.6 Importación y conciliación asistida | CSV, Excel, OFX; mapeo por banco; duplicados; cruce con pendientes | El segundo archivo del mismo banco no pide mapeo; reimportar el mismo archivo crea 0 movimientos; un cargo que cruza con un pendiente lo confirma |
| 2.7 Patrimonio y vehículos | Activos, valorización, costos anuales del vehículo como recurrencias, mantenimiento por fecha | El SOAT aparece en el Calendario y avisa 30 y 7 días antes; el patrimonio neto = activos − pasivos del Ledger |
| 2.8 Clasificación extendida y auditoría | Centros de costo, atributos personalizados, pantalla de auditoría, tasa de usura y tasas de referencia en Parámetros | La auditoría muestra antes y después de cada cambio; una tasa por encima de la usura vigente a su fecha avisa |

### v3 — «Automatizo y exploro»

| Corte | Alcance | Criterios de aceptación |
|---|---|---|
| 3.1 Motor de reglas avanzado | Constructor disparador + condición + acción + canal, correo, «Probar ahora» | Una regla nueva «si utilización ≥ 70 % → push» se crea sin código y se dispara en la prueba |
| 3.2 Escenarios y comparador | Escenarios propios, comparador lado a lado, independencia financiera | «Cancelar Netflix» frente a «Hoy» muestra la diferencia a 12 meses; ningún escenario escribe en el Ledger |
| 3.3 UVR y tasas variables | Préstamos en UVR, índice + margen | El saldo en pesos de un crédito en UVR cambia con la UVR de la fecha consultada |
| 3.4 Compras compartidas | División igual, porcentaje o monto; saldos; saldar | Mi parte es gasto y el resto cuenta por cobrar; saldar deja el saldo de la persona en $0 |
| 3.5 Hogar e inglés | Varios miembros con roles; traducción `en` | Cada movimiento muestra quién lo creó; cambiar el idioma no cambia el formato COP salvo que se pida |
| 3.6 Mantenimiento por kilometraje | Odómetro, «lo que ocurra primero» | Al registrar 5.000 km desde el último cambio de aceite se genera el pendiente aunque no haya llegado la fecha |

---

## 10. Preguntas abiertas para el propietario

1. **Inicio del periodo**: ¿el mes financiero es el mes calendario (del 1 al último día) o va de día de pago a día de pago (p. ej. del 30 al 29)? Define cuándo se reinician los gastos fijos y qué cubre «Te queda».
2. **Compras a cuotas en «Gastado»**: ¿se cuenta el valor completo el día de la compra (propuesta, la más simple y coherente con el Ledger) o solo la cuota de cada mes (se parece más a la sensación de caja)?
3. **«Te queda» y el ahorro**: ¿se restan los aportes planeados a metas (ahorro primero) o solo los gastos y compromisos?
4. **Pago de tarjeta que se muestra por defecto en el Resumen**: ¿pago total del extracto (propuesta) o pago mínimo?
5. **Confirmación de cobros**: ¿aceptas que ninguna recurrencia se confirme sola, o quieres permitir confirmación automática en casos elegidos (p. ej. el salario) con aviso posterior?
