"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Recurrence, ScenarioCompare, UserScenario } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { todayBogota } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { useAll, useSubmit } from "../hooks";
import { Banner, FormActions, TextArea, TextField } from "../kit";
import { AdjustmentFields } from "./adjustment-fields";
import { CompareTable } from "./compare-table";
import { adjustmentToDraft, buildAdjustment, emptyDraft, type AdjustmentDraft, type AdjustmentField } from "./logic";

/**
 * Crear o editar un escenario: un nombre y una lista de ajustes (lista cerrada). Guardar NO escribe movimientos: solo guarda el
 * escenario. «Ver el efecto» lo compara con «Hoy» a 12 meses sin guardar nada.
 */
export function ScenarioForm({ scenario, onDone, onCancel }: { scenario: UserScenario | null; onDone: (saved: UserScenario) => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.scen;
  const today = todayBogota();
  const submit = useSubmit();
  const preview = useSubmit();
  const recurrences = useAll<Recurrence>(paths.recurrences());
  const [name, setName] = useState(scenario?.name ?? "");
  const [description, setDescription] = useState(scenario?.description ?? "");
  const [drafts, setDrafts] = useState<AdjustmentDraft[]>(() => (scenario ? scenario.adjustments.map((a) => adjustmentToDraft(a, today)) : [emptyDraft("cancel_recurrence", today)]));
  const [touched, setTouched] = useState(false);
  const [effect, setEffect] = useState<ScenarioCompare | null>(null);

  const built = drafts.map(buildAdjustment);
  const adjustments = built.every((b) => b.adjustment !== null) ? built.map((b) => b.adjustment!) : null;
  const valid = name.trim() !== "" && name.trim().length <= 80 && adjustments !== null && adjustments.length > 0;

  function update(index: number, patch: Partial<AdjustmentDraft>) {
    setDrafts((list) => list.map((d, i) => (i === index ? { ...d, ...patch } : d)));
    setEffect(null);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid || !adjustments) return;
    const body = { name: name.trim(), description: description.trim() === "" ? null : description.trim(), adjustments };
    const result = scenario
      ? await submit.run({ id: scenario.id, ...body }, () => api.patch<UserScenario>(paths.scenario(scenario.id), body, { locale }))
      : await submit.run(body, (key) => api.post<UserScenario>(roots.scenarios, body, { idempotencyKey: key, locale }));
    if (result.ok) onDone(result.data);
  }

  async function onPreview() {
    setTouched(true);
    if (!adjustments || adjustments.length === 0) return;
    const body = { items: [{ name: name.trim() || t.draftName, adjustments }] };
    const result = await preview.run(body, () => api.post<ScenarioCompare>(paths.scenarioCompare(), body, { locale }));
    if (result.ok) setEffect(result.data);
  }

  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={t.name} hint={t.nameHint} value={name} onChange={setName} maxLength={80} required error={touched && name.trim() === "" ? dict.fin.common.requiredField : null} />
      <TextArea label={t.description} value={description} onChange={setDescription} maxLength={280} rows={2} />
      <p className="hint">{t.noLedger}</p>
      {drafts.map((draft, index) => (
        <fieldset key={index} className="fin-details auto-block">
          <legend>{t.adjustmentN.replace("{n}", String(index + 1))}</legend>
          <AdjustmentFields draft={draft} onChange={(patch) => update(index, patch)} recurrences={recurrences.items.filter((r) => r.status === "active")} invalid={touched ? (built[index].invalid as AdjustmentField[]) : []} apiCode={submit.errorCode} />
          {drafts.length > 1 && (
            <button type="button" className="button button--ghost" onClick={() => { setDrafts((list) => list.filter((_, i) => i !== index)); setEffect(null); }}>
              {t.removeAdjustment}
              <span className="visually-hidden"> {index + 1}</span>
            </button>
          )}
        </fieldset>
      ))}
      <button type="button" className="button button--ghost" onClick={() => { setDrafts((list) => [...list, emptyDraft("cancel_recurrence", today)]); setEffect(null); }}>
        {t.addAdjustment}
      </button>
      <section aria-label={t.seeEffect}>
        <button type="button" className="button button--ghost" disabled={preview.pending} onClick={() => void onPreview()}>
          {preview.pending ? t.calculating : t.seeEffect}
        </button>
        {preview.error && <Banner tone="negative" live="assertive">{preview.error}</Banner>}
        {effect && <CompareTable data={effect} />}
      </section>
      {submit.error && submit.errorCode !== "too_many_decimals" && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : scenario ? t.saveChanges : t.create}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}
