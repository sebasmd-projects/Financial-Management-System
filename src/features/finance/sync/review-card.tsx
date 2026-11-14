"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { fill } from "../helpers";
import { useHref } from "../hooks";
import { useReviewCount } from "./review-count";

/** El contador de «Por revisar» en el Resumen: solo el número y un enlace (nada de los movimientos). No se pinta si no hay nada por revisar. */
export function ReviewCard() {
  const { dict } = useI18n();
  const t = dict.fin.sync.summary;
  const href = useHref();
  const { count } = useReviewCount();
  if (count <= 0) return null;
  return (
    <section className="fin-card sync-review-card" aria-label={t.title}>
      <p role="status">
        <strong>{count === 1 ? t.countOne : fill(t.countOther, { n: String(count) })}</strong>
      </p>
      <p className="muted">{t.body}</p>
      <div className="actions">
        <Link className="button button--primary" href={href("movimientos-por-revisar")}>
          {t.open}
        </Link>
      </div>
    </section>
  );
}
