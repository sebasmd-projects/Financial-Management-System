import type { finHelpEs } from "./fin-help-es";

/** English help «(?)» texts for the finance forms and readable rate-convention names. */
export const finHelpEn: typeof finHelpEs = {
  helpFor: "Help about: {label}",
  conventions: {
    EA: "Effective annual (EA)",
    EM: "Effective monthly (EM)",
    ET: "Effective quarterly (ET)",
    ED: "Effective daily (ED)",
    NMV: "Nominal monthly, paid in arrears (NMV)",
    NTV: "Nominal quarterly, paid in arrears (NTV)",
    NAV: "Nominal annual, paid in arrears (NAV)",
  },
  texts: {
    cutDay: "Day of the month the bank closes the statement. Purchases up to that day go on the current statement; later ones go on the next.",
    payDay: "Day of the month the statement payment is due. If it falls on a holiday or weekend, the bank usually moves it to the next business day.",
    limit: "Limit: the most the bank lets you owe on the card, counting purchases, cash advances and interest. What is available is the limit minus what you owe.",
    rate: "What the lender charges to finance you. Type it as a percentage as shown on your statement or contract, and pick below which convention it is expressed in.",
    convention: "Convention: how the rate is expressed. \"E.A.\" is effective annual (the one to compare across lenders); \"M.V.\" is nominal monthly in arrears (the monthly rate times 12). Effective rates (EA, EM, ET, ED) already include compounding; nominal rates (NMV, NTV, NAV) are divided by the periods in a year to get each period's rate.",
    handlingFee: "Handling fee (cuota de manejo): what the bank charges for holding the card or account, usually monthly and sometimes waived with use. It is not interest. Fees and other charges added to the installment go here.",
    insurance: "Insurance: a monthly premium (life or debtor insurance, sometimes on the asset) the lender adds to every installment. It is not interest and does not reduce principal.",
    term: "Term: the number of monthly installments you will pay the loan over. 12 installments is one year.",
    system: "Amortization system: how each installment splits between principal and interest. Fixed installment: you pay the same every month (early on, most of it is interest). Constant principal: principal falls evenly and the installment starts high and drops. Interest only: you pay interest and the principal at the end. Custom: you set the principal of each installment.",
    uvr: "UVR (Unidad de Valor Real): a unit the Banco de la República adjusts daily with inflation. In a UVR loan the balance is measured in units and its peso value changes every day.",
    indexMargin: "Variable rate: the lender takes an index (DTF, IBR or CPI) and adds a fixed margin you agreed to. The margin is added to the index, not compounded. Example: index 10% plus margin 5% gives 15% E.A.",
    gmfExempt: "GMF (4x1000): a tax of 4 per 1,000 pesos leaving an account. Each person can have one savings account exempt, up to 350 UVT per month. No GMF is charged on what leaves an exempt account.",
    antThreshold: "Ant expense (gasto hormiga): a small, frequent expense (coffee, deliveries, apps) that goes unnoticed on its own. The threshold is the largest amount an expense can have to count as one.",
    quietHours: "Quiet hours: the part of the day we should not notify you. What arrives in that range is delivered when it ends. Overdue items still show in the app.",
  },
};
