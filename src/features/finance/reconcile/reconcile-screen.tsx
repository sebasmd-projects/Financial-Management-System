"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { Account, Adjustment, Page, ReconcilePreview, Reconciliation } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { normalizeAmountInput } from "@/lib/amount-input";
import { formatDate, todayBogota } from "@/lib/dates";
import { absAmount, compareAmounts, formatCop, isNegativeAmount } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { accountGroup, fill } from "../helpers";
import { useHref, useResource, useSubmit } from "../hooks";
import { AmountField, Badge, Banner, Checkbox, DefinitionList, ErrorState, FormActions, Loading, Modal, Money, ScreenHeader, Section, Slots, TextArea, TextField } from "../kit";
import { canReconcile, differenceOf, markedBalance, reopenable, signedStatementBalance } from "./logic";

/** Conciliar una cuenta contra su extracto (`/cuentas/[id]/conciliar`, diseño §3.6): datos, marcar, diferencia, ajuste, conciliar y reabrir. */
export function ReconcileScreen({ id }: { id: string }) {
  const { dict } = useI18n();
  const t = dict.fin.recon;
  const href = useHref();
  const account = useResource<Account>(paths.account(id));
  const history = useResource<Page<Reconciliation>>(paths.reconciliations(id));
  const back = { href: href("cuenta", [id]), label: dict.screens.cuenta };

  if (account.loading && !account.data) return <div className="screen"><ScreenHeader title={dict.screens["cuenta-conciliar"]} back={back} /><Loading /></div>;
  if (account.failure || !account.data) {
    return (
      <div className="screen">
        <ScreenHeader title={dict.screens["cuenta-conciliar"]} back={back} />
        <ErrorState message={account.failure?.status === 404 ? dict.fin.errors.notFound : t.loadError} onRetry={account.reload} />
      </div>
    );
  }
  const a = account.data;
  const group = accountGroup(a);
  const last = history.data ? reopenable(history.data.results) : null;

  return (
    <div className="screen screen--form">
      <ScreenHeader title={dict.screens["cuenta-conciliar"]} eyebrow={a.name} back={back} />
      {group !== "bancos" && group !== "efectivo" ? (
        <Banner tone="warning">
          <p>{t.notReconcilable}</p>
        </Banner>
      ) : (
        <>
          <p className="muted">{t.intro}</p>
          <LastReconciliation list={history.data?.results ?? []} last={last} loading={history.loading && !history.data} onChanged={history.reload} />
          <ReconcileFlow account={a} onReconciled={history.reload} />
        </>
      )}
    </div>
  );
}

function LastReconciliation({ list, last, loading, onChanged }: { list: readonly Reconciliation[]; last: Reconciliation | null; loading: boolean; onChanged: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.recon;
  const [open, setOpen] = useState(false);
  const [reopened, setReopened] = useState(false);
  return (
    <Section title={t.last}>
      {loading && <Loading />}
      {!loading && list.length === 0 && <p className="muted">{t.lastNone}</p>}
      {reopened && (
        <Banner tone="positive">
          <p>{t.reopened}</p>
        </Banner>
      )}
      {list.some((r) => r.status === "unbalanced") && <Banner tone="warning" live="off"><p>{t.unbalancedNote}</p></Banner>}
      {last && (
        <div className="fin-row fin-row--static">
          <div className="fin-row__main">
            <span className="fin-row__sub">
              <Slots template={fill(t.lastLine, { date: formatDate(last.cutoff), n: String(last.entry_count) })} vars={{ amount: <Money value={last.statement_balance} /> }} />
            </span>
            {last.status === "unbalanced" && <Badge tone="warning">{t.status.unbalanced}</Badge>}
          </div>
          <button type="button" className="button button--ghost" onClick={() => setOpen(true)}>
            {t.reopen}
          </button>
        </div>
      )}
      {list.length > 1 && (
        <details className="fin-details">
          <summary>{t.history}</summary>
          <ul className="fin-list">
            {list.map((r) => (
              <li key={r.id} className="fin-row fin-row--static">
                <span className="fin-row__main">
                  <span className="fin-row__title">{formatDate(r.cutoff)}</span>
                  <span className="fin-row__sub muted">
                    <Money value={r.statement_balance} /> · {r.entry_count}
                  </span>
                </span>
                <Badge tone={r.status === "closed" ? "positive" : "warning"}>{t.status[r.status]}</Badge>
              </li>
            ))}
          </ul>
        </details>
      )}
      <Modal open={open} title={t.reopenTitle} onClose={() => setOpen(false)}>
        {last && (
          <ReopenForm
            reconciliation={last}
            onCancel={() => setOpen(false)}
            onDone={() => {
              setOpen(false);
              setReopened(true);
              onChanged();
            }}
          />
        )}
      </Modal>
    </Section>
  );
}

function ReopenForm({ reconciliation, onDone, onCancel }: { reconciliation: Reconciliation; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.recon;
  const submit = useSubmit();
  const [reason, setReason] = useState("");
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (reason.trim() === "") return;
    const body = { reason: reason.trim() };
    const result = await submit.run(body, (key) => api.post<Reconciliation>(paths.reconciliationReopen(reconciliation.id), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} noValidate className="fin-form">
      <p className="muted">{t.reopenIntro}</p>
      <TextArea label={t.reopenReason} value={reason} onChange={setReason} required maxLength={280} />
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
        </Banner>
      )}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || reason.trim() === ""}>
          {submit.pending ? dict.fin.common.saving : t.reopenConfirm}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

function ReconcileFlow({ account, onReconciled }: { account: Account; onReconciled: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.recon;
  const href = useHref();
  const today = todayBogota();
  const review = useSubmit();
  const reconcile = useSubmit();
  const adjust = useSubmit();
  const [cutoff, setCutoff] = useState(today);
  const [balanceText, setBalanceText] = useState("");
  const [negative, setNegative] = useState(false);
  const [touched, setTouched] = useState(false);
  const [preview, setPreview] = useState<ReconcilePreview | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [done, setDone] = useState(false);
  const [adjusted, setAdjusted] = useState(false);

  const normalized = normalizeAmountInput(balanceText);
  const statement = signedStatementBalance(normalized, negative);
  const cutoffProblem = cutoff === "" ? t.cutoff : cutoff > today ? t.cutoffFuture : null;
  const inputsValid = statement !== null && cutoffProblem === null;

  async function onReview(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    setDone(false);
    setAdjusted(false);
    if (!inputsValid || statement === null) return;
    const body = { account_id: account.id, cutoff, statement_balance: statement };
    const result = await review.run(body, () => api.post<ReconcilePreview>(paths.reconciliationPreview(), body, { locale }));
    if (result.ok) {
      setPreview(result.data);
      // Se parte con todo marcado: lo normal es que casi todo aparezca en el extracto y se desmarque lo que no.
      setSelected(new Set(result.data.candidates.map((c) => c.entry_id)));
    }
  }

  const marked = preview ? markedBalance(preview.reconciled_balance, preview.candidates, selected) : "0";
  const difference = preview ? differenceOf(preview.statement_balance, marked) : "0";
  const ready = preview !== null && canReconcile(difference, selected.size);
  const body = preview ? { account_id: account.id, cutoff: preview.cutoff, statement_balance: preview.statement_balance, entry_ids: [...selected] } : null;

  async function onReconcile() {
    if (!body) return;
    const result = await reconcile.run(body, (key) => api.post<Reconciliation>(roots.reconciliations, body, { idempotencyKey: key, locale }));
    if (result.ok) {
      setDone(true);
      setPreview(null);
      onReconciled();
    }
  }

  async function onAdjust() {
    if (!body) return;
    const result = await adjust.run(body, (key) => api.post<Adjustment>(paths.reconciliationAdjust(), body, { idempotencyKey: key, locale }));
    if (result.ok) {
      setPreview(result.data.preview);
      setSelected(new Set([...selected, result.data.entry_id]));
      setAdjusted(true);
    }
  }

  function toggle(entryId: string) {
    const next = new Set(selected);
    if (next.has(entryId)) next.delete(entryId);
    else next.add(entryId);
    setSelected(next);
  }

  return (
    <>
      {done && (
        <Banner tone="positive">
          <p>{t.done}</p>
          <p>
            <Link className="button button--primary" href={href("cuenta", [account.id])}>
              {t.doneBack}
            </Link>
          </p>
        </Banner>
      )}

      <form onSubmit={onReview} noValidate className="fin-form">
        <h2 className="title-s">{t.step1}</h2>
        <TextField label={t.cutoff} type="date" value={cutoff} onChange={setCutoff} required error={touched && cutoffProblem ? (cutoff > today ? t.cutoffFuture : dict.fin.common.requiredField) : null} />
        <AmountField label={t.statementBalance} value={balanceText} onChange={setBalanceText} required error={touched && normalized === null ? t.invalidBalance : null} />
        <Checkbox label={t.negativeBalance} checked={negative} onChange={setNegative} />
        {review.error && (
          <Banner tone="negative" live="assertive">
            {review.error}
          </Banner>
        )}
        <FormActions>
          <button type="submit" className="button button--primary" disabled={review.pending}>
            {review.pending ? t.reviewing : t.review}
          </button>
        </FormActions>
      </form>

      {preview && (
        <div className="recon">
          <h2 className="title-s">{t.step2}</h2>
          <section className="fin-card recon__summary" aria-label={t.step2} aria-live="polite">
            <DefinitionList
              rows={[
                { label: t.summaryStatement, value: <Money value={preview.statement_balance} /> },
                { label: t.summaryMarked, value: <Money value={marked} /> },
                {
                  label: t.summaryDifference,
                  value: (
                    <span className={compareAmounts(difference, "0") === 0 ? "recon__zero" : "recon__nonzero"}>
                      {compareAmounts(difference, "0") !== 0 && <Icon name="alert" size={16} />}
                      <Money value={difference} sign="always" tone={compareAmounts(difference, "0") === 0 ? "positive" : "negative"} />
                    </span>
                  ),
                },
                ...(compareAmounts(preview.reconciled_balance, "0") !== 0 ? [{ label: t.alreadyReconciled, value: <Money value={preview.reconciled_balance} /> }] : []),
              ]}
            />
          </section>

          <Section
            title={t.candidates}
            aside={
              preview.candidates.length > 0 ? (
                <button type="button" className="button button--ghost" onClick={() => setSelected(selected.size === preview.candidates.length ? new Set() : new Set(preview.candidates.map((c) => c.entry_id)))}>
                  {selected.size === preview.candidates.length ? t.unmarkAll : t.markAll}
                </button>
              ) : undefined
            }
          >
            {preview.candidates.length === 0 ? (
              <p className="muted">{t.candidatesNone}</p>
            ) : (
              <>
                <ul className="fin-list">
                  {preview.candidates.map((c) => (
                    <li key={c.entry_id}>
                      <label className="recon__row">
                        <input type="checkbox" checked={selected.has(c.entry_id)} onChange={() => toggle(c.entry_id)} />
                        <span className="fin-row__main">
                          <span className="fin-row__title">{c.description || fill(t.entryFallback, { n: String(c.number) })}</span>
                          <span className="fin-row__sub muted">{formatDate(c.date)}</span>
                        </span>
                        <Money value={c.effect} sign={isNegativeAmount(c.effect) ? "auto" : "always"} />
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="hint">{t.notInStatementHint}</p>
              </>
            )}
          </Section>

          <h2 className="title-s">{t.step3}</h2>
          {adjusted && (
            <Banner tone="positive">
              <p>{t.adjusted}</p>
            </Banner>
          )}
          {ready ? (
            <Banner tone="positive">
              <p>{t.differenceZero}</p>
            </Banner>
          ) : (
            compareAmounts(difference, "0") !== 0 && (
              <Banner tone="warning">
                <p>{t.differenceNotZero}</p>
                <p className="hint">{t.adjustHint}</p>
              </Banner>
            )
          )}
          {reconcile.error && (
            <Banner tone="negative" live="assertive">
              {reconcile.error}
            </Banner>
          )}
          {adjust.error && (
            <Banner tone="negative" live="assertive">
              {adjust.error}
            </Banner>
          )}
          <FormActions>
            {ready ? (
              <button type="button" className="button button--primary" disabled={reconcile.pending} onClick={() => void onReconcile()}>
                {reconcile.pending ? dict.fin.common.saving : selected.size === 1 ? t.reconcileOne : fill(t.reconcile, { n: String(selected.size) })}
              </button>
            ) : (
              <>
                <Link className="button button--ghost" href={`${href("movimiento-nuevo")}?desde=${encodeURIComponent(account.id)}`}>
                  {t.addMissing}
                </Link>
                {compareAmounts(difference, "0") !== 0 && (
                  <button type="button" className="button button--primary" disabled={adjust.pending} onClick={() => void onAdjust()}>
                    {adjust.pending ? dict.fin.common.saving : fill(t.adjust, { amount: formatCop(absAmount(difference)) })}
                  </button>
                )}
                <Link className="button button--ghost" href={href("cuenta", [account.id])}>
                  {t.saveLater}
                </Link>
              </>
            )}
          </FormActions>
        </div>
      )}
    </>
  );
}
