"use client";

import type { CustomAttribute, MovementType } from "@/api/models";
import { useI18n } from "@/i18n/provider";
import { SelectField, TextField } from "../kit";
import { applicableAttributes, type AttributeProblem } from "./logic";

/** Los atributos personalizados que aplican al tipo de movimiento, cada uno con el campo de su tipo (texto, número, fecha o lista). */
export function AttributeFields({ defs, type, values, onChange, problems, touched }: { defs: readonly CustomAttribute[]; type: MovementType; values: Readonly<Record<string, string>>; onChange: (id: string, value: string) => void; problems: readonly AttributeProblem[]; touched: boolean }) {
  const { dict } = useI18n();
  const t = dict.fin.cls.form;
  const applicable = applicableAttributes(defs, type);
  if (applicable.length === 0) return null;
  return (
    <fieldset className="cls-attributes" data-testid="attribute-fields">
      <legend className="title-s">{t.attributesTitle}</legend>
      {applicable.map((def) => {
        const problem = touched ? problems.find((p) => p.id === def.id) : undefined;
        const error = problem ? (problem.kind === "required" ? t.requiredMissing : t.invalid) : null;
        const value = values[def.id] ?? "";
        if (def.kind === "choice") {
          return <SelectField key={def.id} label={def.name} value={value} onChange={(v) => onChange(def.id, v)} options={def.options.map((o) => ({ value: o, label: o }))} placeholder={t.pick} required={def.required} error={error} />;
        }
        return (
          <TextField
            key={def.id}
            label={def.name}
            hint={def.kind === "number" ? t.numberHint : undefined}
            type={def.kind === "date" ? "date" : "text"}
            inputMode={def.kind === "number" ? "decimal" : undefined}
            value={value}
            onChange={(v) => onChange(def.id, v)}
            maxLength={200}
            required={def.required}
            error={error}
          />
        );
      })}
    </fieldset>
  );
}
