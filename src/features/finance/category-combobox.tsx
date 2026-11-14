"use client";

/**
 * Selector de categoría con búsqueda y alta en línea (patrón ARIA «editable combobox with list autocomplete»).
 *
 * * Escribir filtra por nombre o ruta, sin mirar mayúsculas ni tildes.
 * * Si lo escrito no existe, la última opción es «Crear «texto»»: la crea con la API (tipo del formulario) y la deja
 *   seleccionada **sin salir ni reiniciar el formulario**: aquí solo cambia el valor de la categoría; todo lo demás que la persona ya
 *   escribió queda como estaba.
 * * Si ya existe una con ese nombre (aunque cambien mayúsculas o tildes), se selecciona esa: nunca se duplica. Si el servidor responde
 *   que el nombre ya existe (otra pestaña, una archivada), se muestra el aviso y se recarga la lista.
 * * Sin categorías de ese tipo, ofrece «Añadir categorías por defecto»: el servidor solo inserta las que faltan.
 */
import { useId, useState } from "react";
import { api } from "@/api";
import type { Category } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { filterCategories, findExisting, ofKind, pathLabel } from "./category-search";
import { fill } from "./helpers";
import { useResource, useSubmit } from "./hooks";
import { FieldShell } from "./kit";
import { hasTrashedCategories, type Deletion } from "../../../core/trash";

type Item = { type: "none" } | { type: "category"; category: Category } | { type: "create"; name: string };

export interface CategorySource {
  items: Category[];
  loading: boolean;
  reload: () => void;
}

const MAX_NAME = 80;

export function CategoryCombobox({ label, kind, categories, value, onChange, placeholder, hint, required }: { label: string; kind: "income" | "expense"; categories: CategorySource; value: string; onChange: (categoryId: string) => void; placeholder: string; hint?: string; required?: boolean }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.form.categoryPicker;
  const id = useId();
  const listId = `${id}-list`;
  const create = useSubmit();
  const defaults = useSubmit();
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [added, setAdded] = useState<Category[]>([]);
  const [notice, setNotice] = useState("");

  // Lo recién creado se suma a la lista mientras llega la recarga: la selección no depende de ella.
  const known = [...categories.items, ...added.filter((a) => !categories.items.some((c) => c.id === a.id))];
  const options = ofKind(known, kind);
  // Sin categorías de este tipo solo se ofrecen las de por defecto si no hay categorías en la papelera (el servidor las cuenta como existentes).
  const offerDefaults = options.length === 0 && !categories.loading;
  const trash = useResource<Deletion[]>(offerDefaults ? "/deletions" : null);
  const inTrash = hasTrashedCategories(trash.data);
  const selected = known.find((c) => c.id === value) ?? null;
  const text = query ?? "";
  const typed = text.replace(/\s+/g, " ").trim();
  const matches = filterCategories(options, text);
  const canCreate = typed !== "" && typed.length <= MAX_NAME && findExisting(options, typed) === null;
  const items: Item[] = [
    ...(typed === "" ? [{ type: "none" } as const] : []),
    ...matches.map((category) => ({ type: "category", category }) as const),
    ...(canCreate ? [{ type: "create", name: typed } as const] : []),
  ];
  const current = Math.min(active, Math.max(items.length - 1, 0));
  const optionId = (index: number) => `${id}-opt-${index}`;

  function close() {
    setOpen(false);
    setQuery(null);
  }

  async function createCategory(name: string) {
    const existing = findExisting(options, name);
    if (existing) {
      onChange(existing.id);
      return;
    }
    const result = await create.run({ name, kind }, (key) => api.post<Category>(roots.categories, { name, kind }, { idempotencyKey: key, locale }));
    if (result.ok) {
      setAdded((list) => [...list, result.data]);
      onChange(result.data.id);
      setNotice(fill(t.created, { name: result.data.name }));
    }
    categories.reload();
  }

  function choose(item: Item | undefined) {
    if (!item) return;
    close();
    if (item.type === "none") onChange("");
    else if (item.type === "category") onChange(item.category.id);
    else void createCategory(item.name);
  }

  async function addDefaults() {
    const result = await defaults.run({ defaults: true }, (key) => api.post<Category[]>(paths.categoryDefaults(), undefined, { idempotencyKey: key }));
    if (!result.ok) return;
    setAdded((list) => [...list, ...result.data.filter((c) => !list.some((a) => a.id === c.id))]);
    setNotice(result.data.length === 0 ? t.defaultsNone : fill(t.defaultsAdded, { n: String(result.data.length) }));
    categories.reload();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActive((current + (event.key === "ArrowDown" ? 1 : items.length - 1)) % Math.max(items.length, 1));
    } else if (event.key === "Enter" && open) {
      event.preventDefault(); // no envía el formulario: solo elige
      choose(items[current]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  const error = create.error ?? defaults.error;
  const status = open ? (items.length === 0 ? t.noResults : fill(t.results, { n: String(items.length) })) : notice;

  return (
    <div className="combobox">
      <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
        <div className="combobox__box">
        <input
          id={id}
          className="input"
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && items.length > 0 ? optionId(current) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          placeholder={placeholder}
          maxLength={MAX_NAME}
          value={query ?? (selected ? pathLabel(selected) : "")}
          onFocus={(event) => { setOpen(true); event.currentTarget.select(); }}
          onClick={() => setOpen(true)}
          onBlur={close}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); create.clearError(); setNotice(""); }}
          onKeyDown={onKeyDown}
        />
        <ul id={listId} role="listbox" aria-label={label} className="combobox__list" hidden={!open}>
          {items.map((item, index) => (
            <li
              key={item.type === "category" ? item.category.id : item.type}
              id={optionId(index)}
              role="option"
              aria-selected={index === current}
              className={`combobox__option${item.type === "create" ? " combobox__option--create" : ""}${item.type === "category" && item.category.id === value ? " combobox__option--chosen" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(item)}
            >
              {item.type === "none" ? placeholder : item.type === "category" ? pathLabel(item.category) : create.pending ? t.creating : fill(t.create, { name: item.name })}
            </li>
          ))}
          {items.length === 0 && <li role="presentation" className="combobox__empty">{t.noResults}</li>}
        </ul>
        </div>
      </FieldShell>
      {offerDefaults && inTrash && <p className="hint">{t.inTrash}</p>}
      {offerDefaults && (trash.data !== null || trash.failure !== null) && !inTrash && (
        <button type="button" className="button button--ghost combobox__defaults" disabled={defaults.pending} onClick={() => void addDefaults()}>
          {defaults.pending ? dict.fin.common.saving : t.addDefaults}
        </button>
      )}
      <span role="status" className="visually-hidden">{status}</span>
    </div>
  );
}
