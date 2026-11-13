/** Ayudas «(?)» de los formularios financieros y nombres legibles de las convenciones de tasa. `fin-help-en.ts` cumple el mismo tipo. */
export const finHelpEs = {
  helpFor: "Ayuda sobre: {label}",
  /** Un nombre por cada valor de `RateConventionEnum` (la API). */
  conventions: {
    EA: "Efectiva anual (EA)",
    EM: "Efectiva mensual (EM)",
    ET: "Efectiva trimestral (ET)",
    ED: "Efectiva diaria (ED)",
    NMV: "Nominal mensual vencida (NMV)",
    NTV: "Nominal trimestral vencida (NTV)",
    NAV: "Nominal anual vencida (NAV)",
  } as Record<string, string>,
  texts: {
    cutDay: "Día del mes en que el banco cierra el extracto. Las compras hasta ese día entran en el extracto actual; las siguientes, en el próximo.",
    payDay: "Día del mes en que vence el pago del extracto. Si cae en festivo o fin de semana, el banco suele correrlo al siguiente día hábil.",
    limit: "Cupo: lo máximo que el banco te deja deber en la tarjeta, sumando compras, avances e intereses. Lo disponible es el cupo menos lo que debes.",
    rate: "Lo que cobra la entidad por financiarte. Escríbela en porcentaje tal como figura en tu extracto o contrato y elige abajo en qué convención está expresada.",
    convention: "Convención: la forma en que viene expresada la tasa. «E.A.» es efectiva anual (la que sirve para comparar entre entidades); «M.V.» es nominal mes vencido (la tasa mensual por 12). Las efectivas (EA, EM, ET, ED) ya incluyen el efecto de capitalizar; las nominales (NMV, NTV, NAV) se dividen entre los periodos del año para hallar la tasa de cada periodo.",
    handlingFee: "Cuota de manejo: lo que el banco cobra por tener la tarjeta o la cuenta, suele ser mensual y a veces se exonera por uso. No es interés. Aquí cuentan las comisiones y otros cobros que se suman a la cuota.",
    insurance: "Seguro: prima mensual (de vida o de deudores, y a veces del bien) que la entidad suma a cada cuota. No es interés ni baja el capital.",
    term: "Plazo: número de cuotas mensuales en que pagarás el crédito. 12 cuotas son un año.",
    system: "Sistema de amortización: cómo se reparte cada cuota entre capital e interés. Cuota fija: pagas lo mismo cada mes (al inicio casi todo es interés). Capital constante: el capital baja parejo y la cuota empieza alta y va bajando. Solo interés: pagas intereses y el capital al final. Personalizado: tú indicas el capital de cada cuota.",
    uvr: "UVR (Unidad de Valor Real): unidad que el Banco de la República ajusta a diario según la inflación. En un crédito en UVR el saldo se mide en unidades y su valor en pesos cambia cada día.",
    indexMargin: "Tasa variable: el banco toma un índice (DTF, IBR o IPC) y le suma un margen fijo que pactaste. El margen se suma al índice, sin componer. Ejemplo: índice 10 % y margen 5 % dan 15 % E.A.",
    gmfExempt: "GMF (4x1000): impuesto de 4 por cada 1.000 pesos que salen de una cuenta. Cada persona puede tener exenta una sola cuenta de ahorros, hasta 350 UVT al mes. En una cuenta exenta no se cobra GMF por lo que sale de ella.",
    antThreshold: "Gasto hormiga: gasto pequeño y frecuente (café, domicilios, apps) que por separado pasa desapercibido. El umbral es el monto máximo de un gasto para contarlo como hormiga.",
    quietHours: "Horas de silencio: el rango del día en que no queremos avisarte. Lo que llegue en ese rango se entrega al terminar. Lo vencido sigue viéndose en la aplicación.",
  },
};
