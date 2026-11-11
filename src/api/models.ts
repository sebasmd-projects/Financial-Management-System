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
