"use client";

import type { ReactNode } from "react";
import type { ApiResult } from "@/api/client";
import { useI18n } from "@/i18n/provider";
import { useSubmit } from "../finance/hooks";
import { Banner, FormActions, Modal } from "../finance/kit";

/**
 * Una confirmación con su escritura (salir, quitar, borrar, ceder…): explica lo que pasa, pide el sí y muestra el error del servidor
 * en el mismo sitio. `call` recibe la `Idempotency-Key` de la intención; reintentar el mismo diálogo la repite.
 */
export function ConfirmDialog<T>({
  open,
  title,
  confirmLabel,
  danger = false,
  disabled = false,
  fingerprint,
  call,
  onDone,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  danger?: boolean;
  disabled?: boolean;
  fingerprint: unknown;
  call: (idempotencyKey: string) => Promise<ApiResult<T>>;
  onDone: (data: T) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const { dict } = useI18n();
  const submit = useSubmit();
  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (disabled) return;
    const result = await submit.run(fingerprint, call);
    if (result.ok) onDone(result.data);
  }
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={onSubmit} className="fin-form" noValidate>
        {children}
        {submit.error && (
          <Banner tone="negative" live="assertive">
            {submit.error}
          </Banner>
        )}
        <FormActions>
          <button type="submit" className={`button ${danger ? "button--danger" : "button--primary"}`} disabled={submit.pending || disabled}>
            {submit.pending ? dict.fin.common.saving : confirmLabel}
          </button>
          <button type="button" className="button button--ghost" onClick={onClose}>
            {dict.common.cancel}
          </button>
        </FormActions>
      </form>
    </Modal>
  );
}
