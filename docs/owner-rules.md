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
