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
