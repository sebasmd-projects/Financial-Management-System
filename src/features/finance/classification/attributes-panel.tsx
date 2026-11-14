"use client";

import { useState } from "react";
import { api } from "@/api";
import type { CustomAttribute, CustomAttributePatch, MovementType, Page } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { fill } from "../helpers";
import { RemoveDialog } from "../shared/remove";
import { useResource, useSubmit } from "../hooks";
import { Badge, Banner, Checkbox, Empty, ErrorState, FormActions, Loading, Modal, Segmented, TextArea, TextField } from "../kit";
import { ATTRIBUTE_KINDS, ATTRIBUTE_TYPES, MAX_OPTIONS, parseOptions } from "./logic";

/** Atributos personalizados (§3.15): texto, número, fecha o lista; a qué tipos de movimiento aplican; obligatorios o no; archivables. */
export function AttributesPanel() {
  const { dict } = useI18n();
  const t = dict.fin.cls.attributes;
  const list = useResource<Page<CustomAttribute>>(paths.customAttributes());
  const [editing, setEditing] = useState<CustomAttribute | "new" | null>(null);
  const [removing, setRemoving] = useState<CustomAttribute | null>(null);
  const items = list.data?.results ?? [];
  return (
    <div className="fin-stack">
      <p className="muted">{t.intro}</p>
      <div className="actions">
        <button type="button" className="button button--primary" onClick={() => setEditing("new")}>
          <Icon name="plus" size={20} />
          {t.add}
        </button>
      </div>
      {list.loading && !list.data && <Loading />}
      {list.failure && <ErrorState message={dict.fin.errors.generic} onRetry={list.reload} />}
      {list.data && items.length === 0 && <Empty icon="list" title={t.emptyTitle} body={t.emptyBody} />}
      {items.length > 0 && (
        <ul className="fin-list">
          {items.map((attr) => (
            <li key={attr.id} className="fin-row fin-row--static">
              <span className="fin-row__main">
                <span className="fin-row__title">{attr.name}</span>
                <span className="fin-row__badges">
                  <Badge>{t.kinds[attr.kind]}</Badge>
                  {attr.required && <Badge tone="info">{t.required}</Badge>}
                  {attr.archived && <Badge>{t.archived}</Badge>}
                </span>
                {attr.kind === "choice" && attr.options.length > 0 && <span className="fin-row__sub muted">{fill(t.optionsLine, { options: attr.options.join(", ") })}</span>}
                <span className="fin-row__sub muted">{fill(t.appliesLine, { types: attr.applies_to.length === 0 ? t.allTypes : attr.applies_to.map((x) => t.types[x]).join(", ") })}</span>
              </span>
              <button type="button" className="button button--ghost" onClick={() => setEditing(attr)}>
                {t.edit}
                <span className="visually-hidden"> {attr.name}</span>
              </button>
              <button type="button" className="button button--ghost" onClick={() => setRemoving(attr)}>
                {dict.fin.own.delete}
                <span className="visually-hidden"> {attr.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <RemoveDialog
        open={removing !== null}
        kind="custom_attribute"
        id={removing?.id ?? ""}
        name={removing?.name ?? ""}
        onClose={() => setRemoving(null)}
        onDone={() => {
          setRemoving(null);
          list.reload();
        }}
      />
      <Modal open={editing !== null} title={editing === "new" || editing === null ? t.newTitle : t.editTitle} onClose={() => setEditing(null)}>
        {editing !== null && (
          <AttributeForm
            attribute={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onDone={() => {
              setEditing(null);
              list.reload();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function AttributeForm({ attribute, onDone, onCancel }: { attribute: CustomAttribute | null; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.cls.attributes;
  const submit = useSubmit();
  const [name, setName] = useState(attribute?.name ?? "");
  const [kind, setKind] = useState<CustomAttribute["kind"]>(attribute?.kind ?? "text");
  const [options, setOptions] = useState(attribute?.options.join("\n") ?? "");
  const [applies, setApplies] = useState<MovementType[]>(attribute?.applies_to ?? []);
  const [required, setRequired] = useState(attribute?.required ?? false);
  const [archived, setArchived] = useState(attribute?.archived ?? false);
  const [touched, setTouched] = useState(false);
  const parsed = parseOptions(options);
  const optionsBad = kind === "choice" && (parsed.length === 0 || parsed.length > MAX_OPTIONS);
  const valid = name.trim() !== "" && !optionsBad;
  const toggle = (type: MovementType, on: boolean) => setApplies((current) => (on ? [...current, type] : current.filter((x) => x !== type)));

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    if (attribute) {
      const body: CustomAttributePatch = { name: name.trim(), applies_to: applies, required, archived, ...(attribute.kind === "choice" ? { options: parsed } : {}) };
      const result = await submit.run({ id: attribute.id, ...body }, (key) => api.patch(paths.customAttribute(attribute.id), body, { idempotencyKey: key, locale }));
      if (result.ok) onDone();
      return;
    }
    const body = { name: name.trim(), kind, applies_to: applies, required, ...(kind === "choice" ? { options: parsed } : {}) };
    const result = await submit.run(body, (key) => api.post(roots.customAttributes, body, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={t.name} value={name} onChange={setName} maxLength={80} required error={touched && name.trim() === "" ? dict.fin.common.requiredField : null} />
      {attribute ? (
        <p className="hint">
          {t.kind}: {t.kinds[attribute.kind]}. {t.kindFixed}
        </p>
      ) : (
        <Segmented legend={t.kind} variant="chips" value={kind} onChange={(v) => setKind(v as CustomAttribute["kind"])} options={ATTRIBUTE_KINDS.map((k) => ({ value: k, label: t.kinds[k] }))} />
      )}
      {(attribute ? attribute.kind : kind) === "choice" && <TextArea label={t.options} hint={t.optionsHint} value={options} onChange={setOptions} rows={4} required error={touched && optionsBad ? t.optionsRequired : null} />}
      <fieldset className="fin-months">
        <legend className="field__label">{t.appliesTo}</legend>
        <p className="hint">{t.appliesToHint}</p>
        {ATTRIBUTE_TYPES.map((type) => (
          <Checkbox key={type} label={t.types[type]} checked={applies.includes(type)} onChange={(on) => toggle(type, on)} />
        ))}
      </fieldset>
      <Checkbox label={t.requiredLabel} checked={required} onChange={setRequired} />
      {attribute && <Checkbox label={t.archiveLabel} checked={archived} onChange={setArchived} />}
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : dict.fin.common.save}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}
