"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Account, CrossTransferResult } from "@/api/models";
import { paths } from "@/api/paths";
import { normalizeAmountInput } from "@/lib/amount-input";
import { todayBogota } from "@/lib/dates";
import { formatCop } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { transferAccounts } from "../finance/helpers";
import { useAll, useSubmit } from "../finance/hooks";
import { AmountField, Banner, FormActions, Modal, Segmented, SelectField, TextField, TextArea } from "../finance/kit";
import { ConfirmDialog } from "./confirm-dialog";
import { canWriteRole } from "./scope";
import { useHouseholds, useScope } from "./scope-store";

/**
 * Traslado entre una cuenta personal y una del hogar (`POST households/{id}/cross-transfers`). Las dos listas se piden por su ruta
 * propia (sin reescritura de ámbito), así que el diálogo vale estando en cualquier ámbito. Los montos solo viajan en el cuerpo.
 */
export function CrossTransferDialog({ open, householdId, onClose }: { open: boolean; householdId: string; onClose: () => void }) {
  const { dict } = useI18n();
  return (
    <Modal open={open} title={dict.fin.hh.cross.title} onClose={onClose}>
      <CrossTransferForm householdId={householdId} onClose={onClose} />
    </Modal>
  );
}

function CrossTransferForm({ householdId, onClose }: { householdId: string; onClose: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.hh.cross;
  const submit = useSubmit();
  const personal = useAll<Account>(paths.accounts(), { unscoped: true });
  const household = useAll<Account>(paths.householdAccounts(householdId), { unscoped: true });
  const [direction, setDirection] = useState("to_household");
  const [personalId, setPersonalId] = useState("");
  const [householdAccountId, setHouseholdAccountId] = useState("");
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState(todayBogota());
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<CrossTransferResult | null>(null);
  const [annulling, setAnnulling] = useState(false);
  const [annulled, setAnnulled] = useState(false);

  const personalOptions = transferAccounts(personal.items).filter((a) => a.system_key === "" && a.kind !== "credit_card");
  const householdOptions = transferAccounts(household.items).filter((a) => a.system_key === "" && a.kind !== "credit_card");
  const amount = normalizeAmountInput(amountText);
  const positive = amount !== null && amount !== "0" && !amount.startsWith("-");
  const personalChosen = personalId || personalOptions[0]?.id || "";
  const householdChosen = householdAccountId || householdOptions[0]?.id || "";
  const loading = (personal.loading && !personal.data) || (household.loading && !household.data);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!positive || !personalChosen || !householdChosen) return;
    const body = {
      personal_account_id: personalChosen,
      household_account_id: householdChosen,
      direction: direction as "to_household" | "from_household",
      amount: amount!,
      date,
      ...(description.trim() ? { description: description.trim() } : {}),
    };
    const result = await submit.run(body, (key) => api.post<CrossTransferResult>(paths.crossTransfers(householdId), body, { idempotencyKey: key, locale, unscoped: true }));
    if (result.ok) setDone(result.data);
  }

  if (done) {
    return (
      <div className="fin-form">
        <Banner tone="positive">{annulled ? t.annulled : t.done}</Banner>
        <FormActions>
          {!annulled && (
            <button type="button" className="button button--ghost" onClick={() => setAnnulling(true)}>
              {t.annul}
            </button>
          )}
          <button type="button" className="button button--primary" onClick={onClose}>
            {t.dismiss}
          </button>
        </FormActions>
        <AnnulTransfer
          open={annulling}
          householdId={householdId}
          group={done.group}
          onClose={() => setAnnulling(false)}
          onDone={() => {
            setAnnulling(false);
            setAnnulled(true);
          }}
        />
      </div>
    );
  }

  if (!loading && (personalOptions.length === 0 || householdOptions.length === 0)) {
    return (
      <div className="fin-form">
        <p className="muted">{t.needAccounts}</p>
        <button type="button" className="button button--ghost" onClick={onClose}>
          {t.dismiss}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <p className="muted">{t.intro}</p>
      <Segmented
        legend={t.direction}
        options={[
          { value: "to_household", label: t.toHousehold },
          { value: "from_household", label: t.fromHousehold },
        ]}
        value={direction}
        onChange={setDirection}
      />
      <SelectField label={t.personalAccount} value={personalChosen} onChange={setPersonalId} options={personalOptions.map((a) => ({ value: a.id, label: a.name }))} />
      <SelectField label={t.householdAccount} value={householdChosen} onChange={setHouseholdAccountId} options={householdOptions.map((a) => ({ value: a.id, label: a.name }))} />
      <AmountField
        apiCode={submit.errorCode}
        label={t.amount}
        value={amountText}
        onChange={setAmountText}
        required
        error={touched && !positive ? dict.fin.common.invalidAmount : null}
        preview={positive ? formatCop(amount!) : null}
      />
      <TextField label={t.date} type="date" value={date} onChange={setDate} required />
      <TextField label={t.description} value={description} onChange={setDescription} maxLength={200} />
      {submit.error && submit.errorCode !== "too_many_decimals" && (
        <Banner tone="negative" live="assertive">
          {submit.error}
        </Banner>
      )}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || loading}>
          {submit.pending ? dict.fin.common.saving : t.submit}
        </button>
        <button type="button" className="button button--ghost" onClick={onClose}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

/**
 * Anular un traslado entre ámbitos: los dos asientos juntos, con motivo. El `group` sale del propio movimiento (`linked_transfer.group`),
 * así que vale desde cualquier sesión. El hogar es el activo; en el ámbito Personal, el único donde se pueda escribir (o el que se elija).
 */
export function AnnulTransfer({ open, householdId, group, onClose, onDone }: { open: boolean; householdId?: string; group: string; onClose: () => void; onDone: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.hh.cross;
  const scope = useScope();
  const { data } = useHouseholds();
  const [reason, setReason] = useState("");
  const [chosen, setChosen] = useState("");
  const candidates = householdId ? [{ id: householdId, name: "" }] : scope.kind !== "personal" ? [{ id: scope.id, name: "" }] : (data?.households ?? []).filter((h) => canWriteRole(h.role));
  const target = candidates.find((h) => h.id === chosen)?.id ?? candidates[0]?.id ?? "";
  return (
    <ConfirmDialog
      open={open}
      danger
      title={t.annulTitle}
      confirmLabel={t.annul}
      disabled={reason.trim() === "" || target === ""}
      fingerprint={{ group, household: target, reason: reason.trim() }}
      call={(key) => api.post(paths.crossTransferAnnul(target, group), { reason: reason.trim() }, { idempotencyKey: key, locale, unscoped: true })}
      onClose={onClose}
      onDone={onDone}
    >
      <p className="muted">{t.annulBody}</p>
      {candidates.length > 1 && <SelectField label={t.annulHousehold} value={target} onChange={setChosen} options={candidates.map((h) => ({ value: h.id, label: h.name }))} />}
      <TextArea label={t.reason} value={reason} onChange={setReason} required maxLength={200} />
    </ConfirmDialog>
  );
}
