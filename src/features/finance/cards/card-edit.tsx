"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Card } from "@/api/models";
import { paths } from "@/api/paths";
import { normalizeAmountInput } from "@/lib/amount-input";
import { toInt } from "@/lib/ints";
import { useI18n } from "@/i18n/provider";
import { amountToInput } from "../movements/movement-form";
import { useSubmit } from "../hooks";
import { AmountField, Banner, Checkbox, FormActions, TextField } from "../kit";

/** Editar una tarjeta: nombre, últimos 4 dígitos, cupo, corte, pago y «predeterminada». La tasa y la cuota de manejo se cambian en su historial con vigencia. */
export function CardEditForm({ card, onDone, onCancel }: { card: Card; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const o = dict.fin.own;
  const t = dict.fin.cards;
  const submit = useSubmit();
  const [name, setName] = useState(card.name);
  const [last4, setLast4] = useState(card.last4 ?? "");
  const [limit, setLimit] = useState(amountToInput(card.limit));
  const [cut, setCut] = useState(String(card.cut_day));
  const [pay, setPay] = useState(String(card.pay_day));
  const [isDefault, setDefault] = useState(card.is_default);
  const [touched, setTouched] = useState(false);
  const limitValue = normalizeAmountInput(limit);
  const cutValue = toInt(cut, 1, 31);
  const payValue = toInt(pay, 1, 31);
  const last4Bad = last4 !== "" && !/^\d{4}$/.test(last4);
  const valid = name.trim() !== "" && limitValue !== null && cutValue !== null && payValue !== null && !last4Bad;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const body: Record<string, unknown> = {};
    if (name.trim() !== card.name) body.name = name.trim();
    if ((last4 || null) !== card.last4) body.last4 = last4 || null;
    if (limitValue !== amountToInput(card.limit)) body.limit = limitValue;
    if (cutValue !== card.cut_day) body.cut_day = cutValue;
    if (payValue !== card.pay_day) body.pay_day = payValue;
    if (isDefault !== card.is_default) body.is_default = isDefault;
    if (Object.keys(body).length === 0) return onDone();
    const result = await submit.run(body, (key) => api.patch<Card>(paths.card(card.id), body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} noValidate className="fin-form">
      <TextField label={dict.fin.accounts.fields.name} value={name} onChange={setName} maxLength={80} required error={touched && name.trim() === "" ? dict.fin.common.requiredField : null} />
      <TextField label={o.account.last4} value={last4} onChange={setLast4} inputMode="numeric" maxLength={4} error={last4Bad ? dict.fin.accounts.last4Invalid : null} />
      <AmountField label={o.card.limit} value={limit} onChange={setLimit} required error={touched && limitValue === null ? dict.fin.common.invalidAmount : null} />
      <div className="fin-grid-2">
        <TextField label={o.card.cutDay} value={cut} onChange={setCut} inputMode="numeric" maxLength={2} error={touched && cutValue === null ? t.dayInvalid : null} />
        <TextField label={o.card.payDay} value={pay} onChange={setPay} inputMode="numeric" maxLength={2} error={touched && payValue === null ? t.dayInvalid : null} />
      </div>
      <Checkbox label={o.default.toggle} hint={o.default.hint} checked={isDefault} onChange={setDefault} disabled={card.status !== "active"} />
      <p className="hint">{o.card.rateNote}</p>
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : o.save}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}
