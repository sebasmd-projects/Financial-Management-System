/**
 * Los modelos de la API: alias de los tipos GENERADOS del contrato (`openapi-fms.yaml` → `schema.gen.ts`, `npm run api:types`).
 * Si el backend cambia el contrato, se vuelve a copiar el YAML, se regeneran los tipos y `tsc` señala lo que se rompe: aquí no se
 * reescribe a mano ningún campo. Los montos son `string` (cadenas decimales); se operan con `@/lib/money`.
 */
import type { components } from "./schema.gen";

type S = components["schemas"];

export type Account = S["Account"];
export type AccountCreate = S["AccountCreate"];
export type AccountPatch = S["PatchedAccountPatch"];
export type Card = S["Card"];
export type CardCreate = S["CardCreate"];
export type CardPay = S["CardPay"];
export type Advance = S["Advance"];
export type AdvanceResult = S["AdvanceResult"];
export type Category = S["Category"];
export type CategoryCreate = S["CategoryCreate"];
export type CategoryPatch = S["PatchedCategoryPatch"];
export type Entry = S["Entry"];
export type EditApplied = S["EditApplied"];
export type EditPreview = S["EditPreview"];
export type MovementEdit = S["MovementEdit"];
export type Institution = S["Institution"];
export type EntryLine = S["EntryLine"];
export type FixedExpenses = S["FixedExpenses"];
export type Loan = S["Loan"];
export type LoanCreate = S["LoanCreate"];
export type LoanInstallment = S["LoanInstallment"];
export type LoanPay = S["LoanPay"];
export type LoanSchedule = S["LoanSchedule"];
export type Movement = S["Movement"];
export type MovementCreate = S["MovementCreate"];
export type MovementPatch = S["PatchedMovementPatch"];
export type MovementEntries = S["MovementEntries"];
export type Named = S["Named"];
export type NamedPatch = S["PatchedNamedPatch"];
export type Occurrence = S["Occurrence"];
export type OccurrencePay = S["OccurrencePay"];
export type OccurrencePaid = S["OccurrencePaid"];
export type PaymentMethod = S["PaymentMethod"];
export type Plan = S["Plan"];
export type PlanRow = S["PlanRow"];
export type PlanSummary = S["PlanSummary"];
export type Purchase = S["Purchase"];
export type PurchaseCreate = S["PurchaseCreate"];
export type Recurrence = S["Recurrence"];
export type RecurrenceCreate = S["RecurrenceCreate"];
export type RecurrencePatch = S["PatchedRecurrencePatch"];
export type Simulation = S["Simulation"];
export type Statement = S["Statement"];
export type Statements = S["Statements"];
export type Subscriptions = S["Subscriptions"];
export type Summary = S["Summary"];
export type TransferCreate = S["TransferCreate"];
export type Warning = S["Warning"];

// FMS-1b (cortes 1.7 a 1.10)
export type AmountDue = S["AmountDue"];
export type SplitInput = S["Split"];
export type SplitResult = S["SplitResult"];
export type Dashboard = S["Dashboard"];
export type RailItem = S["RailItem"];
export type FixedGrid = S["FixedGrid"];
export type Alert = S["Alert"];
export type Calendar = S["Calendar"];
export type CalendarDay = S["CalendarDay"];
export type CalendarItem = S["CalendarItem"];
export type Notification = S["Notification"];
export type NotificationList = S["NotificationList"];
export type Prefs = S["Prefs"];
export type PrefsPatch = S["PatchedPrefsPatch"];
export type Rule = S["Rule"];
export type RulePatch = S["RulePatch"];
export type PushSubscribe = S["PushSubscribe"];
export type Parameter = S["Parameter"];
export type ParameterCatalog = S["ParameterCatalog"];
export type UserParameter = S["UserParameter"];
export type UserParameterCreate = S["UserParameterCreate"];
export type ReconcileInput = S["ReconcileInput"];
export type ReconcilePreview = S["ReconcilePreview"];
export type Reconciliation = S["Reconciliation"];
export type Adjustment = S["Adjustment"];
export type Candidate = S["Candidate"];

export type AccountKind = S["AccountKindEnum"];
export type EntryStatus = S["EntryStatusEnum"];
export type MovementType = S["MovementTypeEnum"];
export type RateConvention = S["RateConventionEnum"];
export type RecurrenceKind = S["RecurrenceKindEnum"];
export type Frequency = S["FrequencyEnum"];

/** La paginación de DRF que usan todas las listas. */
export interface Page<T> {
  count: number;
  page: number;
  page_size: number;
  results: T[];
}

// FMS-2a (cortes 2.1 a 2.4)
export type LoanRate = S["LoanRate"];
export type LoanRateCreate = S["LoanRateCreate"];
export type LoanRates = S["LoanRates"];
export type LateQuote = S["LateQuote"];
export type CreditInstallment = S["CreditInstallment"];
export type CreditInterest = S["CreditInterest"];
export type Debt = S["Debt"];
export type DebtCreate = S["DebtCreate"];
export type DebtPatch = S["PatchedDebtPatch"];
export type DebtPay = S["DebtPay"];
export type DebtPayments = S["DebtPayments"];
export type DebtReminder = S["DebtReminder"];
export type DebtSummary = S["DebtSummary"];
export type RateConvert = S["RateConvert"];
export type InstallmentSim = S["InstallmentSim"];
export type InstallmentSimRequest = S["InstallmentSimRequest"];
export type ExtraPayment = S["ExtraPayment"];
export type ExtraScenario = S["ExtraScenario"];
export type ExtraPaymentRequest = S["ExtraPaymentRequest"];
export type Compare = S["Compare"];
export type CompareRequest = S["CompareRequest"];
export type Offer = S["Offer"];
export type SimRow = S["SimRow"];
export type SimSummary = S["SimSummary"];
export type Usury = S["Usury"];
export type Budget = S["Budget"];
export type BudgetCreate = S["BudgetCreate"];
export type BudgetPatch = S["PatchedBudgetPatch"];
export type Budgets = S["Budgets"];
export type BudgetHistory = S["BudgetHistory"];
export type BudgetSuggestions = S["BudgetSuggestions"];
export type Goal = S["Goal"];
export type GoalCreate = S["GoalCreate"];
export type GoalPatch = S["PatchedGoalPatch"];
export type GoalContribute = S["GoalContribute"];
export type Goals = S["Goals"];
export type Indicators = S["Indicators"];
export type Report = S["Report"];
export type ReportCatalog = S["ReportCatalog"];
export type ReportExport = S["ReportExport"];
export type ReportQuery = S["ReportQuery"];
export type MovementSearch = S["MovementSearch"];
export type ReportLiquidity = S["ReportLiquidity"];
export type ReportTable = S["Table"];

export type AmortizationSystem = S["AmortizationSystemEnum"];
export type LoanKind = S["LoanKindEnum"];
export type BudgetDimension = S["BudgetDimensionEnum"];
export type BudgetPeriod = S["BudgetPeriodEnum"];
export type GoalKind = S["GoalKindEnum"];
export type ReportKey = S["ReportKeyEnum"];
export type ReportScenario = S["ReportScenarioEnum"];
export type ReportHorizon = S["ReportHorizonEnum"];
export type ExportFormat = S["ExportFormatEnum"];
