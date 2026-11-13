"use client";

import { useState } from "react";
import { api } from "@/api";
import type { Category, Named } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { ReadOnlyBanner } from "../../household/notices";
import { useCanWrite } from "../../household/scope-store";
import { useAll, useSubmit } from "../hooks";
import { Badge, Banner, Checkbox, Empty, ErrorState, FormActions, Loading, Modal, ScreenHeader, Section, Segmented, SelectField, Tabs, TextField } from "../kit";
import { AttributesPanel } from "../classification/attributes-panel";
import { CostCentersPanel } from "../classification/cost-centers-panel";

/** Categorías (`/configuracion/categorias`): árbol de egresos e ingresos, alta, cambio de nombre y archivo (nada se borra). */
export function CategoriesScreen() {
  const { dict } = useI18n();
  const t = dict.fin.categories;
  const canWrite = useCanWrite();
  const [archived, setArchived] = useState(false);
  const categories = useAll<Category>(paths.categories({ archived }));
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const archiving = useSubmit();
  async function toggleArchive(category: Category) {
    const body = { archived: !category.archived };
    const result = await archiving.run({ id: category.id, ...body }, (key) => api.patch(paths.category(category.id), body, { idempotencyKey: key }));
    if (result.ok) categories.reload();
  }
  const items = [...categories.items].sort((a, b) => a.path.join("\u0000").localeCompare(b.path.join("\u0000")));

  return (
    <div className="screen">
      <ScreenHeader
        title={dict.screens["config-categorias"]}
        eyebrow={dict.nav.sections.config}
        actions={
          canWrite ? (
            <button type="button" className="button button--primary" onClick={() => setEditing("new")}>
              <Icon name="plus" size={20} />
              {t.add}
            </button>
          ) : undefined
        }
      />
      <ReadOnlyBanner />
      <Checkbox label={t.showArchived} checked={archived} onChange={setArchived} />
      {categories.loading && !categories.data && <Loading />}
      {categories.failure && <ErrorState message={dict.fin.errors.generic} onRetry={categories.reload} />}
      {categories.data && items.length === 0 && <Empty title={archived ? t.noArchived : t.emptyTitle} body={archived ? undefined : t.emptyBody} icon="list" />}
      {(["expense", "income"] as const).map((kind) => {
        const group = items.filter((c) => c.kind === kind);
        if (group.length === 0) return null;
        return (
          <Section key={kind} title={t.kinds[kind]}>
            <ul className="fin-list">
              {group.map((category) => (
                <li key={category.id} className="fin-row fin-row--static" style={{ paddingInlineStart: `calc(var(--space-16) + ${category.path.length - 1} * var(--space-16))` }}>
                  <span className="fin-row__main">
                    <span className="fin-row__title">{category.name}</span>
                    {category.archived && <Badge>{t.archived}</Badge>}
                  </span>
                  {canWrite && (
                    <>
                      <button type="button" className="button button--ghost" onClick={() => setEditing(category)}>
                        {t.edit}
                        <span className="visually-hidden"> {category.name}</span>
                      </button>
                      <button type="button" className="button button--ghost" disabled={archiving.pending} onClick={() => void toggleArchive(category)}>
                        {category.archived ? dict.fin.own.unarchive : dict.fin.own.archive}
                        <span className="visually-hidden"> {category.name}</span>
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        );
      })}
      <Modal open={editing !== null} title={editing === "new" ? t.add : t.edit} onClose={() => setEditing(null)}>
        <CategoryForm
          category={editing === "new" || editing === null ? null : editing}
          all={categories.items}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            categories.reload();
          }}
        />
      </Modal>
    </div>
  );
}

function CategoryForm({ category, all, onDone, onCancel }: { category: Category | null; all: readonly Category[]; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.categories;
  const submit = useSubmit();
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<"expense" | "income">(category?.kind ?? "expense");
  const [parent, setParent] = useState(category?.parent_id ?? "");
  const [archived, setArchived] = useState(category?.archived ?? false);
  const parents = all.filter((c) => c.kind === kind && c.id !== category?.id && c.path.length < 2);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim() === "") return;
    const result = category
      ? await submit.run({ name, archived }, (key) => api.patch(paths.category(category.id), { name: name.trim(), archived }, { idempotencyKey: key }))
      : await submit.run({ name, kind, parent }, (key) => api.post(roots.categories, { name: name.trim(), kind, ...(parent ? { parent_id: parent } : {}) }, { idempotencyKey: key, locale }));
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={onSubmit} className="fin-form" noValidate>
      <TextField label={t.fields.name} value={name} onChange={setName} maxLength={80} required />
      {!category && (
        <>
          <Segmented legend={t.fields.kind} options={[{ value: "expense", label: t.kinds.expense }, { value: "income", label: t.kinds.income }]} value={kind} onChange={(v) => { setKind(v as "expense" | "income"); setParent(""); }} />
          <SelectField label={t.fields.parent} value={parent} onChange={setParent} placeholder={t.noParent} options={parents.map((c) => ({ value: c.id, label: c.path.join(" › ") }))} />
        </>
      )}
      {category && <Checkbox label={t.archiveLabel} hint={t.archiveHint} checked={archived} onChange={setArchived} />}
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || name.trim() === ""}>
          {submit.pending ? dict.fin.common.saving : dict.fin.common.save}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </form>
  );
}

/** Etiquetas: alta, cambio de nombre y archivo. */
function TagsPanel() {
  const { dict, locale } = useI18n();
  const t = dict.fin.tags;
  const tags = useAll<Named>(paths.tags());
  const canWrite = useCanWrite();
  const [editing, setEditing] = useState<Named | "new" | null>(null);
  const submit = useSubmit();
  const [name, setName] = useState("");
  const [archived, setArchived] = useState(false);

  function open(target: Named | "new") {
    setEditing(target);
    setName(target === "new" ? "" : target.name);
    setArchived(target === "new" ? false : target.archived);
    submit.clearError();
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim() === "" || editing === null) return;
    const result =
      editing === "new"
        ? await submit.run({ name }, (key) => api.post(roots.tags, { name: name.trim() }, { idempotencyKey: key, locale }))
        : await submit.run({ name, archived }, (key) => api.patch(paths.tag(editing.id), { name: name.trim(), archived }, { idempotencyKey: key }));
    if (result.ok) {
      setEditing(null);
      tags.reload();
    }
  }

  return (
    <div className="fin-stack">
      <ReadOnlyBanner />
      {canWrite && (
        <div className="actions">
          <button type="button" className="button button--primary" onClick={() => open("new")}>
            <Icon name="plus" size={20} />
            {t.add}
          </button>
        </div>
      )}
      {tags.loading && !tags.data && <Loading />}
      {tags.failure && <ErrorState message={dict.fin.errors.generic} onRetry={tags.reload} />}
      {tags.data && tags.items.length === 0 && <Empty title={t.emptyTitle} body={t.emptyBody} icon="list" />}
      {tags.items.length > 0 && (
        <ul className="fin-list">
          {tags.items.map((tag) => (
            <li key={tag.id} className="fin-row fin-row--static">
              <span className="fin-row__main">
                <span className="fin-row__title">#{tag.name}</span>
                {tag.archived && <Badge>{t.archived}</Badge>}
              </span>
              {canWrite && (
                <button type="button" className="button button--ghost" onClick={() => open(tag)}>
                  {t.edit}
                  <span className="visually-hidden"> {tag.name}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal open={editing !== null} title={editing === "new" ? t.add : t.edit} onClose={() => setEditing(null)}>
        <form onSubmit={onSubmit} className="fin-form" noValidate>
          <TextField label={t.name} value={name} onChange={setName} maxLength={40} required />
          {editing !== "new" && <Checkbox label={t.archiveLabel} checked={archived} onChange={setArchived} />}
          {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
          <FormActions>
            <button type="submit" className="button button--primary" disabled={submit.pending || name.trim() === ""}>
              {submit.pending ? dict.fin.common.saving : dict.fin.common.save}
            </button>
            <button type="button" className="button button--ghost" onClick={() => setEditing(null)}>
              {dict.common.cancel}
            </button>
          </FormActions>
        </form>
      </Modal>
    </div>
  );
}

/**
 * Etiquetas (`/configuracion/etiquetas`) y, desde FMS-2b (corte 2.8, diseño §3.15), los centros de costo y los atributos
 * personalizados: las tres formas de clasificar un movimiento además de su categoría.
 */
export function TagsScreen() {
  const { dict } = useI18n();
  const t = dict.fin.cls.tabs;
  const [tab, setTab] = useState<"tags" | "centers" | "attributes">("tags");
  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["config-etiquetas"]} eyebrow={dict.nav.sections.config} />
      <Tabs label={t.label} value={tab} onChange={setTab} tabs={[{ value: "tags", label: t.tags }, { value: "centers", label: t.centers }, { value: "attributes", label: t.attributes }]}>
        {tab === "tags" && <TagsPanel />}
        {tab === "centers" && <CostCentersPanel />}
        {tab === "attributes" && <AttributesPanel />}
      </Tabs>
    </div>
  );
}
