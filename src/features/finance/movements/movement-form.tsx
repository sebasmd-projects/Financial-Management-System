"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/api";
import type { Account, Category, Movement, MovementType, Named, Page, PaymentMethod, Warning } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { parsePositiveAmount } from "@/lib/amount-input";
import { todayBogota } from "@/lib/dates";
import { absAmount, addAmounts, formatCop, negateAmount } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { clearDraft, peekDraft, type MovementDraft } from "../draft-store";
import { effectPhrase, fill, movementAccounts, topByFrequency, wouldOverdraw } from "../helpers";
import { useAll, useHref, useResource, useSubmit } from "../hooks";
import { AmountField, Banner, Checkbox, Empty, ErrorState, FormActions, Loading, Money, ScreenHeader, Segmented, SelectField, TextArea, TextField } from "../kit";

type Nature = "" | "fixed" | "variable";
type Classification = "" | "necessary" | "discretionary";

interface FormState {
  type: MovementType;
  amount: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  date: string;
  /** `""` = automático: pendiente si la fecha es futura. */
  status: "" | "confirmed" | "pending";
  description: string;
  counterparty: string;
  notes: string;
  nature: Nature;
  classification: Classification;
  tags: string;
  paymentMethodId: string;
  /** `null` = lo decide el servidor según la cuenta (exenta o no). */
  gmf: boolean | null;
}

const TYPE_FROM_PARAM: Record<string, MovementType> = { egreso: "expense", ingreso: "income", transferencia: "transfer", expense: "expense", income: "income", transfer: "transfer" };

/** El texto de un monto de la API para un campo: sin ceros de más (`"180000.00"` → `"180000"`). */
export function amountToInput(value: string): string {
  const abs = absAmount(value);
  return abs.includes(".") ? abs.replace(/\.?0+$/, "") : abs;
}

function initialState(params: URLSearchParams, draft: MovementDraft | null): FormState {
  const base: FormState = { type: "expense", amount: "", accountId: "", toAccountId: "", categoryId: "", date: todayBogota(), status: "", description: "", counterparty: "", notes: "", nature: "", classification: "", tags: "", paymentMethodId: "", gmf: null };
  if (draft) {
    return { ...base, type: draft.type, amount: amountToInput(draft.amount), accountId: draft.accountId ?? "", toAccountId: draft.toAccountId ?? "", categoryId: draft.categoryId ?? "", description: draft.description, counterparty: draft.counterparty, nature: draft.nature, classification: draft.classification, tags: draft.tags.join(", "), paymentMethodId: draft.paymentMethodId ?? "" };
  }
  return { ...base, type: TYPE_FROM_PARAM[params.get("tipo") ?? ""] ?? "expense", accountId: params.get("desde") ?? "", toAccountId: params.get("hasta") ?? "" };
}

/**
 * Nuevo movimiento (diseño §3.2). Meta de «2 toques»: abajo de «¿Qué registras?» están los RECIENTES (tus últimos movimientos
 * reales): tocar uno rellena todo —tipo, monto, cuenta, categoría— y el segundo toque es «Guardar». Nada se inventa: sin
 * historial no hay sugerencias. Todo lo demás está en «Más detalles»; solo tipo, monto, fecha y cuenta son obligatorios.
 */
export function MovementForm() {
  const { dict, locale } = useI18n();
  const t = dict.fin.form;
  const href = useHref();
  const params = useSearchParams();
  const submit = useSubmit();
  const [state, setState] = useState<FormState>(() => initialState(params, peekDraft()));
  const [moreOpen, setMoreOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState<{ movement: Movement; warnings: Warning[] } | null>(null);

  const accounts = useAll<Account>(paths.accounts());
  const categories = useAll<Category>(paths.categories({ archived: false }));
  const methods = useResource<PaymentMethod[]>(paths.paymentMethods());
  const tagList = useAll<Named>(paths.tags());
  const recents = useResource<Page<Movement>>(paths.movements({ page_size: 30 }));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setState((current) => ({ ...current, [key]: value }));

  const usable = movementAccounts(accounts.items);
  const recentItems = (recents.data?.results ?? []).filter((m) => !m.voided && m.type !== "transfer");
  const lastAccountId = recentItems[0]?.account.id ?? "";
  const accountId = state.accountId || (usable.some((a) => a.id === lastAccountId) ? lastAccountId : (usable[0]?.id ?? ""));
  const account = usable.find((a) => a.id === accountId) ?? null;
  const toAccount = usable.find((a) => a.id === state.toAccountId) ?? null;

  const amount = parsePositiveAmount(state.amount);
  const effectiveStatus = state.status || (state.date > todayBogota() ? "pending" : "confirmed");
  const isTransfer = state.type === "transfer";
  const categoryKind = state.type === "income" ? "income" : "expense";
  const categoryOptions = categories.items.filter((c) => c.kind === categoryKind).sort((a, b) => a.path.join("/").localeCompare(b.path.join("/")));
  const frequentCategoryIds = topByFrequency(
    recentItems.filter((m) => m.type === state.type),
    (m) => m.category?.id ?? null,
    5,
  );
  const frequentCategories = frequentCategoryIds.map((id) => categoryOptions.find((c) => c.id === id)).filter((c): c is Category => c !== undefined);

  const phrase = effectPhrase({ type: state.type, pending: effectiveStatus === "pending", account, toAccount, amount }, t.effect, formatCop);
  const overdraw = amount && account && state.type === "expense" && wouldOverdraw(account, amount) ? fill(t.overdraw, { account: account.name, balance: formatCop(addAmounts(account.posted_balance, negateAmount(amount))) }) : null;
  const gmfApplies = isTransfer && account ? (state.gmf ?? !account.exempt_gmf) : false;

  const errors = {
    amount: touched && !amount ? (state.amount.trim() === "" ? t.errors.amountRequired : dict.fin.common.invalidAmount) : null,
    account: touched && !account ? t.errors.accountRequired : null,
    toAccount: touched && isTransfer && (!toAccount || toAccount.id === accountId) ? (toAccount ? t.errors.sameAccount : t.errors.toAccountRequired) : null,
  };

  function applyRecent(m: Movement) {
    setState((current) => ({
      ...current,
      type: m.type,
      amount: amountToInput(m.amount),
      accountId: m.account.id,
      categoryId: m.category?.id ?? "",
      description: m.description ?? "",
      counterparty: m.counterparty?.name ?? "",
      nature: (m.nature as Nature) || "",
      classification: (m.classification as Classification) || "",
      tags: m.tags.map((tag) => tag.name).join(", "),
      paymentMethodId: m.payment_method?.id ?? "",
    }));
    setSaved(null);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!amount || !account || (isTransfer && (!toAccount || toAccount.id === account.id))) return;
    const common = {
      amount,
      date: state.date,
      status: effectiveStatus,
      ...(state.description.trim() ? { description: state.description.trim() } : {}),
      ...(state.notes.trim() ? { notes: state.notes.trim() } : {}),
      ...(state.gmf !== null ? { apply_gmf: state.gmf } : {}),
    };
    const body = isTransfer
      ? { ...common, from_account_id: account.id, to_account_id: toAccount!.id }
      : {
          ...common,
          type: state.type,
          account_id: account.id,
          ...(state.categoryId ? { category_id: state.categoryId } : {}),
          ...(state.counterparty.trim() ? { counterparty: state.counterparty.trim() } : {}),
          ...(state.nature ? { nature: state.nature } : {}),
          ...(state.classification ? { classification: state.classification } : {}),
          ...(state.paymentMethodId ? { payment_method_id: state.paymentMethodId } : {}),
          tags: state.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        };
    const result = await submit.run(body, (key) => api.post<Movement>(isTransfer ? paths.transfers() : roots.movements, body, { idempotencyKey: key, locale }));
    if (result.ok) {
      clearDraft();
      setSaved({ movement: result.data, warnings: result.data.warnings ?? [] });
      setTouched(false);
      setState((current) => ({ ...current, amount: "", description: "", counterparty: "", notes: "", tags: "", categoryId: "", nature: "", classification: "", paymentMethodId: "", gmf: null }));
      recents.reload();
      accounts.reload();
    }
  }

  const loading = accounts.loading && !accounts.data;
  const typeOptions = [
    { value: "expense", label: t.types.expense },
    { value: "income", label: t.types.income },
    { value: "transfer", label: t.types.transfer },
  ];
  const quickRecents = (() => {
    const seen = new Set<string>();
    const list: Movement[] = [];
    for (const m of recentItems) {
      const key = `${m.type}|${m.counterparty?.id ?? m.description ?? ""}|${m.category?.id ?? ""}|${m.account.id}|${m.amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(m);
      if (list.length === 4) break;
    }
    return list;
  })();

  return (
    <div className="screen screen--form">
      <ScreenHeader title={dict.screens["movimiento-nuevo"]} eyebrow={dict.nav.sections.movimientos} back={{ href: href("movimientos"), label: dict.screens.movimientos }} />

      {saved && (
        <Banner tone="positive">
          <p>{saved.movement.status === "pendiente" ? t.savedPending : t.saved}</p>
          {saved.warnings.map((warning, index) => (
            <p key={`${warning.code}-${index}`}>{warningText(warning, dict.fin.warnings, accounts.items)}</p>
          ))}
          <p className="actions">
            <Link className="button button--ghost" href={href("movimiento", [saved.movement.id])}>
              {t.viewSaved}
            </Link>
            <button type="button" className="button button--ghost" onClick={() => setSaved(null)}>
              {t.addAnother}
            </button>
          </p>
        </Banner>
      )}

      {loading && <Loading />}
      {accounts.failure && <ErrorState message={dict.fin.errors.generic} onRetry={accounts.reload} />}
      {accounts.data && usable.length === 0 && (
        <Empty
          title={t.noAccountsTitle}
          body={t.noAccountsBody}
          action={
            <Link className="button button--primary" href={href("cuentas")}>
              {t.goToAccounts}
            </Link>
          }
        />
      )}

      {accounts.data && usable.length > 0 && (
        <form onSubmit={onSubmit} noValidate className="fin-form">
          {quickRecents.length > 0 && !isTransfer && (
            <section aria-labelledby="recents-title" className="fin-recents">
              <h2 id="recents-title" className="title-s">
                {t.recents}
              </h2>
              <ul className="fin-chips">
                {quickRecents.map((m) => (
                  <li key={m.id}>
                    <button type="button" className="chip" onClick={() => applyRecent(m)}>
                      <span>{m.counterparty?.name ?? m.description ?? m.category?.name ?? t.types[m.type]}</span>
                      <Money value={m.amount} compact />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Segmented legend={t.type} options={typeOptions} value={state.type} onChange={(v) => set("type", v as MovementType)} />

          <AmountField label={t.amount} value={state.amount} onChange={(v) => set("amount", v)} error={errors.amount} required preview={amount ? formatCop(amount) : null} />

          {phrase && <p className="fin-phrase">{phrase}</p>}
          {overdraw && <Banner tone="warning">{overdraw}</Banner>}

          <Segmented legend={isTransfer ? t.from : t.account} variant="chips" options={usable.map((a) => ({ value: a.id, label: a.name }))} value={accountId} onChange={(v) => set("accountId", v)} />
          {errors.account && <p className="field__error">{errors.account}</p>}
          {account?.kind === "credit_card" && state.type === "expense" && (
            <p className="hint">
              {t.installmentsHint}{" "}
              <Link href={href("cuentas-credito")}>{dict.screens["cuentas-credito"]}</Link>
            </p>
          )}

          {isTransfer && (
            <>
              <Segmented legend={t.to} variant="chips" options={usable.filter((a) => a.id !== accountId).map((a) => ({ value: a.id, label: a.name }))} value={state.toAccountId} onChange={(v) => set("toAccountId", v)} />
              {errors.toAccount && <p className="field__error">{errors.toAccount}</p>}
              {account && (
                <Checkbox label={t.applyGmf} hint={account.exempt_gmf ? t.gmfExempt : t.gmfHint} checked={gmfApplies} onChange={(v) => set("gmf", v)} />
              )}
            </>
          )}

          {!isTransfer && (
            <>
              {frequentCategories.length > 0 && <Segmented legend={t.category} variant="chips" options={frequentCategories.map((c) => ({ value: c.id, label: c.name }))} value={state.categoryId} onChange={(v) => set("categoryId", v)} />}
              <SelectField label={frequentCategories.length > 0 ? t.otherCategory : t.category} value={state.categoryId} onChange={(v) => set("categoryId", v)} placeholder={t.noCategory} options={categoryOptions.map((c) => ({ value: c.id, label: c.path.join(" › ") }))} hint={categoryOptions.length === 0 && categories.data ? t.noCategoriesHint : undefined} />
            </>
          )}

          <div className="fin-grid-2">
            <TextField label={t.date} type="date" value={state.date} onChange={(v) => set("date", v)} required />
            <SelectField
              label={t.status}
              value={effectiveStatus}
              onChange={(v) => set("status", v as "confirmed" | "pending")}
              options={[
                { value: "confirmed", label: t.statuses.confirmed },
                { value: "pending", label: t.statuses.pending },
              ]}
            />
          </div>

          <button type="button" className="button button--ghost fin-disclosure" aria-expanded={moreOpen} aria-controls="more-details" onClick={() => setMoreOpen((v) => !v)}>
            {t.moreDetails}
            <Icon name="chevron-down" size={20} />
          </button>
          {moreOpen && (
            <div id="more-details" className="fin-form fin-more">
              {!isTransfer && <TextField label={t.counterparty} value={state.counterparty} onChange={(v) => set("counterparty", v)} maxLength={80} />}
              <TextField label={t.description} value={state.description} onChange={(v) => set("description", v)} maxLength={200} />
              {!isTransfer && (
                <>
                  <Segmented legend={t.nature} options={[{ value: "", label: t.none }, { value: "fixed", label: t.natures.fixed }, { value: "variable", label: t.natures.variable }]} value={state.nature} onChange={(v) => set("nature", v as Nature)} />
                  <Segmented legend={t.classification} options={[{ value: "", label: t.none }, { value: "necessary", label: t.classifications.necessary }, { value: "discretionary", label: t.classifications.discretionary }]} value={state.classification} onChange={(v) => set("classification", v as Classification)} />
                  <TextField label={t.tags} hint={t.tagsHint} value={state.tags} onChange={(v) => set("tags", v)} list="tag-suggestions" />
                  <datalist id="tag-suggestions">
                    {tagList.items.map((tag) => (
                      <option key={tag.id} value={tag.name} />
                    ))}
                  </datalist>
                  {(methods.data ?? []).length > 0 && (
                    <SelectField
                      label={t.paymentMethod}
                      value={state.paymentMethodId}
                      onChange={(v) => {
                        const method = (methods.data ?? []).find((m) => m.id === v);
                        setState((current) => ({ ...current, paymentMethodId: v, accountId: method ? method.account_id : current.accountId }));
                      }}
                      placeholder={t.none}
                      options={(methods.data ?? []).filter((m) => m.active).map((m) => ({ value: m.id, label: m.name }))}
                    />
                  )}
                </>
              )}
              <TextArea label={t.notes} value={state.notes} onChange={(v) => set("notes", v)} maxLength={280} hint={t.notesHint} />
            </div>
          )}

          {submit.error && (
            <Banner tone="negative" live="assertive">
              {submit.error}
            </Banner>
          )}
          <FormActions>
            <button type="submit" className="button button--primary button--block fin-save" disabled={submit.pending || !amount}>
              {submit.pending ? dict.fin.common.saving : t.save}
            </button>
          </FormActions>
        </form>
      )}
    </div>
  );
}

/** El texto de un aviso no bloqueante de la API (`possible_duplicate`, `negative_balance`, `credit_limit_exceeded`). */
export function warningText(warning: Warning, texts: Record<string, string>, accounts: readonly Account[]): string {
  const template = texts[warning.code] ?? texts.generic;
  const account = warning.account_id ? accounts.find((a) => a.id === warning.account_id) : undefined;
  return fill(template, { account: account?.name ?? "", balance: warning.balance ? formatCop(warning.balance) : "", available: warning.available ? formatCop(warning.available) : "" });
}
