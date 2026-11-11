"use client";

/**
 * Piezas de interfaz de las pantallas financieras (diseño §5): campos con etiqueta, segmentos, fichas, hoja modal, insignias,
 * progreso, estados vacío / cargando / error. Accesibles por teclado, con etiqueta visible y objetivos de 44 dp.
 */
import Link from "next/link";
import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { amountInputProblem } from "@/lib/amount-input";
import { formatCop, formatCopCompact, HIDDEN_AMOUNT, spokenCop } from "@/lib/money";
import { useI18n } from "@/i18n/provider";
import { Icon, type IconName } from "@/ui/icons";

export function ScreenHeader({ title, eyebrow, back, actions }: { title: string; eyebrow?: string; back?: { href: string; label: string }; actions?: ReactNode }) {
  return (
    <header className="fin-header">
      {back && (
        <Link href={back.href} className="fin-back">
          <Icon name="arrow-left" size={20} />
          <span>{back.label}</span>
        </Link>
      )}
      <div className="fin-header__row">
        <div className="fin-header__titles">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="title-l">{title}</h1>
        </div>
        {actions && <div className="fin-header__actions">{actions}</div>}
      </div>
    </header>
  );
}

export function Loading({ label }: { label?: string }) {
  const { dict } = useI18n();
  return (
    <div className="fin-loading" role="status" aria-live="polite">
      <span className="fin-loading__bar" aria-hidden="true" />
      <span className="visually-hidden">{label ?? dict.loading}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { dict } = useI18n();
  return (
    <div className="status status--negative" role="alert">
      <Icon name="alert" size={20} />
      <div>
        <p>{message}</p>
        {onRetry && (
          <button type="button" className="button button--ghost fin-retry" onClick={onRetry}>
            {dict.common.retry}
          </button>
        )}
      </div>
    </div>
  );
}

export function Banner({ tone, children, live = "polite" }: { tone: "positive" | "warning" | "negative"; children: ReactNode; live?: "polite" | "assertive" | "off" }) {
  return (
    <div className={`status status--${tone}`} role={live === "assertive" ? "alert" : "status"} aria-live={live}>
      <Icon name={tone === "positive" ? "check" : "alert"} size={20} />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ title, body, action, icon = "wallet" }: { title: string; body?: string; action?: ReactNode; icon?: IconName }) {
  return (
    <section className="empty">
      <div className="empty__art" aria-hidden="true">
        <Icon name={icon} size={40} />
      </div>
      <h2 className="title-m">{title}</h2>
      {body && <p className="muted">{body}</p>}
      {action}
    </section>
  );
}

/** «Ocultar montos» del Resumen: mientras vale `true`, todo `Money` debajo pinta `•••••`. Solo en memoria (no se guarda). */
export const HiddenAmountsContext = createContext(false);

/**
 * Un monto: el valor formateado (una sola función de formato, `lib/money.ts`) y, para el lector de pantalla, el valor
 * COMPLETO en palabras. El color nunca es la única señal: el signo (+/−) siempre va escrito.
 */
export function Money({ value, sign = "auto", kind, compact = false, estimated = false, strike = false, tone }: { value: string; sign?: "auto" | "always"; kind?: "egreso" | "ingreso" | "transferencia"; compact?: boolean; estimated?: boolean; strike?: boolean; tone?: "positive" | "negative" | "warning" | "muted" }) {
  const { dict, locale } = useI18n();
  const hidden = useContext(HiddenAmountsContext);
  const shown = hidden ? HIDDEN_AMOUNT : compact ? formatCopCompact(value, { sign, estimated }) : formatCop(value, { sign, estimated });
  const classes = ["money", "tabular", tone ? `money--${tone}` : "", strike ? "money--strike" : ""].filter(Boolean).join(" ");
  return (
    <span className={classes}>
      <span aria-hidden="true">{shown}</span>
      <span className="visually-hidden">{hidden ? dict.fin.dash.hiddenAmount : spokenCop(value, kind, locale)}</span>
    </span>
  );
}

export function Badge({ tone = "neutral", children, dashed = false }: { tone?: "neutral" | "info" | "positive" | "warning" | "negative"; children: ReactNode; dashed?: boolean }) {
  return <span className={`badge badge--${tone}${dashed ? " badge--dashed" : ""}`}>{children}</span>;
}

export function Progress({ percent, label, tone = "primary" }: { percent: number; label: string; tone?: "primary" | "warning" | "negative" | "positive" }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} aria-label={label}>
      <div className={`progress__fill progress__fill--${tone}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

/**
 * «Gastado» de una compra a cuotas (decisión del propietario, 2026-11-10): en el MISMO cuadro, GRANDE y en naranja el costo
 * total real (cuotas + intereses) y pequeño y en rojo el valor de la compra. Ambos con rótulo escrito: el color no es la señal.
 */
export function SpentFigure({ totalRealCost, purchaseValue }: { totalRealCost: string; purchaseValue: string }) {
  const { dict } = useI18n();
  return (
    <div className="spent" data-testid="spent">
      <p className="spent__total">
        <span className="spent__label">{dict.fin.spent.realCost}</span>
        <Money value={totalRealCost} />
      </p>
      <p className="spent__purchase">
        <span className="spent__label">{dict.fin.spent.purchaseValue}</span>
        <Money value={purchaseValue} />
      </p>
    </div>
  );
}

/* ---------- Campos ---------- */

interface BaseField {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
}

function FieldShell({ id, label, hint, error, required, children }: BaseField & { id: string; children: ReactNode }) {
  const { dict } = useI18n();
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
        {required ? <span className="visually-hidden"> ({dict.fin.common.required})</span> : null}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string | null): string | undefined {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export function TextField({ label, hint, error, required, value, onChange, type = "text", inputMode, autoComplete = "off", maxLength, placeholder, list, name }: BaseField & { value: string; onChange: (value: string) => void; type?: "text" | "date" | "email"; inputMode?: "text" | "decimal" | "numeric"; autoComplete?: string; maxLength?: number; placeholder?: string; list?: string; name?: string }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <input id={id} name={name} className="input" type={type} value={value} inputMode={inputMode} autoComplete={autoComplete} maxLength={maxLength} placeholder={placeholder} list={list} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} onChange={(event) => onChange(event.target.value)} />
    </FieldShell>
  );
}

/**
 * Monto: texto con teclado decimal; el valor se interpreta con `lib/amount-input.ts`, nunca con `Number`. Hasta 2 decimales: más
 * se avisa aquí mismo (`too_many_decimals`, el mismo código del servidor, que además puede devolverlo: `apiCode`).
 */
export function AmountField(props: BaseField & { value: string; onChange: (value: string) => void; preview?: string | null; apiCode?: string | null }) {
  const id = useId();
  const { dict } = useI18n();
  const { value, onChange, preview, apiCode, ...shell } = props;
  const decimals = amountInputProblem(value) === "too_many_decimals" || apiCode === "too_many_decimals";
  const error = decimals ? dict.fin.errors.too_many_decimals : shell.error;
  return (
    <FieldShell id={id} {...shell} error={error} hint={shell.hint}>
      <input id={id} className="input input--amount tabular" type="text" inputMode="decimal" autoComplete="off" placeholder="0" value={value} required={shell.required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, shell.hint, error)} onChange={(event) => onChange(event.target.value)} />
      {preview && !decimals && (
        <p className="fin-amount-preview tabular" aria-live="polite">
          {preview}
        </p>
      )}
    </FieldShell>
  );
}

export function TextArea({ label, hint, error, required, value, onChange, maxLength, rows = 3 }: BaseField & { value: string; onChange: (value: string) => void; maxLength?: number; rows?: number }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <textarea id={id} className="input" rows={rows} value={value} maxLength={maxLength} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} onChange={(event) => onChange(event.target.value)} />
    </FieldShell>
  );
}

export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

export function SelectField({ label, hint, error, required, value, onChange, options, placeholder }: BaseField & { value: string; onChange: (value: string) => void; options: readonly Option[]; placeholder?: string }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <select id={id} className="input" value={value} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} onChange={(event) => onChange(event.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function Checkbox({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label className="check" htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} aria-describedby={hint ? `${id}-hint` : undefined} onChange={(event) => onChange(event.target.checked)} />
        <span>{label}</span>
      </label>
      {hint && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Elección única (radios nativos con aspecto de segmentos o fichas): flechas para moverse, Espacio para elegir, lector de
 * pantalla anuncia el grupo y la opción. `legend` es visible salvo `hideLegend`.
 */
export function Segmented({ legend, options, value, onChange, variant = "segments", hideLegend = false }: { legend: string; options: readonly Option[]; value: string; onChange: (value: string) => void; variant?: "segments" | "chips"; hideLegend?: boolean }) {
  const group = useId();
  return (
    <fieldset className={`choice choice--${variant}`}>
      <legend className={hideLegend ? "visually-hidden" : "field__label"}>{legend}</legend>
      <div className="choice__options">
        {options.map((option) => (
          <label key={option.value} className="choice__option">
            <input type="radio" name={group} value={option.value} checked={value === option.value} disabled={option.disabled} onChange={() => onChange(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Pestañas que son enlaces (cada una es una pantalla de la tabla de rutas). */
export function LinkTabs({ label, items }: { label: string; items: readonly { href: string; label: string; current: boolean }[] }) {
  return (
    <nav aria-label={label} className="fin-tabs">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="fin-tab" aria-current={item.current ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function Pager({ page, count, pageSize, onPage }: { page: number; count: number; pageSize: number; onPage: (page: number) => void }) {
  const { dict } = useI18n();
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label={dict.fin.common.pagination}>
      <button type="button" className="button button--ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {dict.fin.common.previous}
      </button>
      <span className="muted" aria-live="polite">
        {page} / {pages}
      </span>
      <button type="button" className="button button--ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {dict.fin.common.next}
      </button>
    </nav>
  );
}

/** Hoja modal (<dialog> nativo: atrapa el foco, Esc cierra, devuelve el foco). El contenido se monta solo mientras está abierta. */
export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { dict } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="sheet__header">
        <h2 id={titleId} className="title-m">
          {title}
        </h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={dict.common.close}>
          <Icon name="x" />
        </button>
      </div>
      <div className="sheet__body">{open ? children : null}</div>
    </dialog>
  );
}

/** Un bloque con título (`<section>` con `aria-labelledby`). */
export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="fin-section">
      <div className="fin-section__head">
        <h2 id={id} className="title-s">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="actions fin-form-actions">{children}</div>;
}

export function DefinitionList({ rows }: { rows: readonly { label: string; value: ReactNode }[] }) {
  return (
    <dl className="deflist">
      {rows.map((row) => (
        <div key={row.label} className="deflist__row">
          <dt className="muted">{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
