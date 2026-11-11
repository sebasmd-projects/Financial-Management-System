/**
 * Lógica pura de los simuladores (sin React): de lo que la persona escribe a la petición de la API, o `null` si aún está
 * incompleto («Completa capital, tasa y plazo»). Solo cadenas decimales: nunca `Number`. Los simuladores NO escriben nada.
 */
import type { AmortizationSystem, ExtraPaymentRequest, InstallmentSimRequest, Offer, RateConvention } from "@/api/models";
import { normalizeAmountInput, parsePositiveAmount, percentToFraction } from "@/lib/amount-input";
import { isBusinessDate } from "@/lib/dates";
import { toInt } from "@/lib/ints";
import { parseCustomCapitals, type CustomProblem } from "../loans/loan-logic";

export const MAX_TERM = 600;

export type TermProblem = "invalid" | "too_long" | null;

/** El plazo en meses: de 1 a 600; más de 600 es un error propio (§3.9), no un campo en blanco. */
export function parseTerm(text: string): { value: number | null; problem: TermProblem } {
  if (text.trim() === "") return { value: null, problem: null };
  if (/^\d{1,9}$/.test(text.trim()) && +text.trim() > MAX_TERM) return { value: null, problem: "too_long" };
  const value = toInt(text, 1, MAX_TERM);
  return value === null ? { value: null, problem: "invalid" } : { value, problem: null };
}

export interface LoanInputs {
  principal: string;
  rate: string;
  convention: RateConvention;
  term: string;
  system: AmortizationSystem;
  insurance: string;
  upfrontFees: string;
  custom: string;
  firstDue: string;
}

export const EMPTY_LOAN: LoanInputs = { principal: "", rate: "", convention: "EM", term: "", system: "french", insurance: "", upfrontFees: "", custom: "", firstDue: "" };

export interface Built<T> {
  body: T | null;
  termProblem: TermProblem;
  customProblem: CustomProblem | null;
}

function optionalAmount(text: string): string | null {
  return text.trim() === "" ? "0" : normalizeAmountInput(text);
}

/** `POST simulators/installment` (y su exportación): capital, tasa, plazo, sistema, seguro, cargos de apertura y fecha de inicio. */
export function buildInstallment(input: LoanInputs): Built<InstallmentSimRequest> {
  const principal = parsePositiveAmount(input.principal);
  const rate = percentToFraction(input.rate);
  const term = parseTerm(input.term);
  const insurance = optionalAmount(input.insurance);
  const fees = optionalAmount(input.upfrontFees);
  const custom = input.system === "custom" ? parseCustomCapitals(input.custom, term.value, principal) : null;
  const firstDue = input.firstDue.trim() === "" ? null : isBusinessDate(input.firstDue) ? input.firstDue : undefined;
  const termValue = term.value;
  const ready = principal !== null && rate !== null && termValue !== null && insurance !== null && fees !== null && firstDue !== undefined && (custom === null || custom.problem === null);
  return {
    body: ready
      ? {
          principal,
          rate,
          rate_convention: input.convention,
          term: termValue,
          system: input.system,
          insurance,
          upfront_fees: fees,
          holiday_rule: firstDue ? ("next" as const) : ("none" as const),
          ...(custom?.capitals ? { custom_capitals: custom.capitals } : {}),
          ...(firstDue ? { first_due_date: firstDue } : {}),
        }
      : null,
    termProblem: term.problem,
    customProblem: custom && input.custom.trim() !== "" ? custom.problem : null,
  };
}

export interface ExtraInputs {
  principal: string;
  rate: string;
  convention: RateConvention;
  term: string;
  afterInstallment: string;
  extra: string;
}

export const EMPTY_EXTRA: ExtraInputs = { principal: "", rate: "", convention: "EM", term: "", afterInstallment: "", extra: "" };

/** `POST simulators/extra-payment`: el abono tiene que caer después de una cuota y antes de la última. */
export function buildExtra(input: ExtraInputs): { body: ExtraPaymentRequest | null; termProblem: TermProblem; afterProblem: boolean } {
  const principal = parsePositiveAmount(input.principal);
  const rate = percentToFraction(input.rate);
  const term = parseTerm(input.term);
  const after = input.afterInstallment.trim() === "" ? null : toInt(input.afterInstallment, 0, MAX_TERM);
  const extra = parsePositiveAmount(input.extra);
  const afterProblem = after !== null && term.value !== null && after >= term.value;
  return {
    body: principal !== null && rate !== null && term.value !== null && after !== null && !afterProblem && extra !== null ? { principal, rate, rate_convention: input.convention, term: term.value, after_installment: after, extra } : null,
    termProblem: term.problem,
    afterProblem,
  };
}

export interface OfferInputs {
  label: string;
  principal: string;
  rate: string;
  convention: RateConvention;
  term: string;
  system: Exclude<AmortizationSystem, "custom">;
  insurance: string;
  upfrontFees: string;
}

export const EMPTY_OFFER: OfferInputs = { label: "", principal: "", rate: "", convention: "EM", term: "", system: "french", insurance: "", upfrontFees: "" };

/** Una oferta completa para `POST simulators/compare`, o `null` si le falta algo. */
export function buildOffer(input: OfferInputs, fallbackLabel: string): Offer | null {
  const principal = parsePositiveAmount(input.principal);
  const rate = percentToFraction(input.rate);
  const term = parseTerm(input.term);
  const insurance = optionalAmount(input.insurance);
  const fees = optionalAmount(input.upfrontFees);
  if (principal === null || rate === null || term.value === null || insurance === null || fees === null) return null;
  return { label: input.label.trim() || fallbackLabel, principal, rate, rate_convention: input.convention, term: term.value, system: input.system, insurance, upfront_fees: fees };
}

/** La comparación pide hasta 3 ofertas y al menos 2 completas: con una sola no hay nada que comparar. */
export function buildCompare(inputs: readonly OfferInputs[], fallbackLabel: (index: number) => string): { offers: Offer[]; indexes: number[] } | null {
  const offers: Offer[] = [];
  const indexes: number[] = [];
  inputs.slice(0, 3).forEach((input, index) => {
    const offer = buildOffer(input, fallbackLabel(index));
    if (offer) {
      offers.push(offer);
      indexes.push(index);
    }
  });
  return offers.length >= 2 ? { offers, indexes } : null;
}
