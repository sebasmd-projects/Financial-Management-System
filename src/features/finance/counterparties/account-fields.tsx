"use client";

import { useEffect, useState } from "react";
import { api } from "@/api";
import type { CounterpartyLookup } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { Banner, SelectField, TextField } from "../kit";
import { CHANNELS, fold } from "./logic";

const MIN_VALUE = 3;
const WAIT_MS = 350;

/** ¿Esa cuenta ya tiene nombre? Pregunta al servidor al dejar de escribir (la cuenta va en la consulta; no es un monto). */
export function useAccountLookup(channel: string, value: string): CounterpartyLookup | null {
  const [answer, setAnswer] = useState<{ key: string; found: CounterpartyLookup | null } | null>(null);
  const text = value.trim();
  const key = `${channel}|${text}`;
  useEffect(() => {
    if (text.length < MIN_VALUE) return;
    let live = true;
    const timer = setTimeout(() => {
      void api.get<CounterpartyLookup>(paths.counterpartyLookup(channel, text)).then((result) => {
        if (live) setAnswer({ key, found: result.ok ? result.data : null });
      });
    }, WAIT_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [channel, text, key]);
  // Una respuesta vale solo para lo que se escribió cuando se pidió.
  return text.length >= MIN_VALUE && answer?.key === key ? answer.found : null;
}

/**
 * La cuenta destino del movimiento (canal y celular, cuenta o referencia). Opcional: si ya tiene nombre se coloca sola; con otro nombre, al
 * guardar se pregunta «¿Actualizar "anterior" → "nuevo"?» o «Crear otro».
 */
export function AccountFields({
  channel,
  value,
  name,
  onChannel,
  onValue,
  known,
  conflict,
  onConflict,
}: {
  channel: string;
  value: string;
  name: string;
  onChannel: (channel: string) => void;
  onValue: (value: string) => void;
  known: CounterpartyLookup | null;
  /** Se pidió resolver el conflicto: `rename` o `move` (lo manda el formulario al guardar). */
  conflict: "rename" | "move" | null;
  onConflict: (choice: "rename" | "move") => void;
}) {
  const { dict } = useI18n();
  const t = dict.fin.cp;
  const knownName = known?.counterparty?.name ?? null;
  const differs = knownName !== null && name.trim() !== "" && fold(name) !== fold(knownName);
  return (
    <fieldset className="fin-form">
      <legend className="visually-hidden">{t.accountLabel}</legend>
      <div className="fin-grid-2">
        <SelectField label={t.channelLabel} value={channel} onChange={onChannel} options={CHANNELS.map((c) => ({ value: c, label: t.channels[c] }))} />
        <TextField label={t.accountLabel} hint={t.accountOptional} value={value} onChange={onValue} maxLength={60} inputMode="text" />
      </div>
      {knownName && !differs && <p className="hint" data-testid="account-known">{fill(t.autofilled, { name: knownName })}</p>}
      {differs && conflict === null && (
        <Banner tone="warning" live="polite">
          <p>{fill(t.differentName, { old: knownName })}</p>
          <p>{fill(t.conflictAsk, { old: knownName, new: name.trim() })}</p>
          <p className="actions">
            <button type="button" className="button button--secondary" onClick={() => onConflict("rename")}>
              {t.conflictRename}
            </button>
            <button type="button" className="button button--ghost" onClick={() => onConflict("move")}>
              {t.conflictMove}
            </button>
          </p>
        </Banner>
      )}
      {differs && conflict !== null && <p className="hint">{conflict === "rename" ? t.conflictRename : t.conflictMove}</p>}
    </fieldset>
  );
}
