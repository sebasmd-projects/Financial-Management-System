"use client";

import Link from "next/link";
import type { Person } from "@/api/models";
import { useI18n } from "@/i18n/provider";
import type { RouteId } from "@/nav/routes";
import { fmsHref } from "@/nav/routes";
import { fill } from "../finance/helpers";
import { Banner, Empty } from "../finance/kit";
import { isPersonalOnlyRoute } from "./scope";
import { setScope, useActiveHousehold, useCanWrite, useScope } from "./scope-store";

/** El aviso de solo lectura del visor (con una región que el lector de pantalla anuncia). */
export function ReadOnlyBanner() {
  const { dict } = useI18n();
  const t = dict.fin.hh.readOnly;
  const canWrite = useCanWrite();
  const { loading } = useActiveHousehold();
  if (canWrite || loading) return null;
  return (
    <Banner tone="warning">
      <strong>{t.title}.</strong> {t.body} {t.needRole}
    </Banner>
  );
}

/** En «Ambos», las listas son las personales: se dice y se ofrece pasar al hogar. */
export function BothNotice() {
  const { dict } = useI18n();
  const t = dict.fin.hh.bothNotice;
  const scope = useScope();
  if (scope.kind !== "both") return null;
  const id = scope.id;
  return (
    <p className="fin-phrase" role="status">
      {t.body}{" "}
      <button type="button" className="button button--ghost" onClick={() => setScope({ kind: "household", id })}>
        {t.action}
      </button>
    </p>
  );
}

/** «Creado por X · editado por Y» de un movimiento o asiento (en un hogar, el miembro). */
export function AuthorLine({ createdBy, updatedBy, className }: { createdBy: Person | null | undefined; updatedBy: Person | null | undefined; className?: string }) {
  const { dict } = useI18n();
  const t = dict.fin.hh.by;
  if (!createdBy && !updatedBy) return null;
  const edited = updatedBy && (!createdBy || updatedBy.id !== createdBy.id) ? updatedBy : null;
  return (
    <span className={className ?? "fin-row__sub muted"} aria-label={t.label}>
      {createdBy ? fill(t.createdBy, { name: createdBy.name }) : t.unknown}
      {edited ? ` · ${fill(t.editedBy, { name: edited.name })}` : ""}
    </span>
  );
}

/** La pantalla que sustituye a una solo personal cuando el ámbito es el Hogar: dice por qué y deja volver. Ningún botón muerto. */
export function PersonalOnly({ routeId }: { routeId: RouteId }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.hh.personalOnly;
  const screen = dict.screens[routeId];
  return (
    <div className="screen">
      <Empty
        icon="shield"
        title={t.title}
        body={fill(t.body, { screen })}
        action={
          <Link className="button button--primary" href={fmsHref(locale, "resumen")} onClick={() => setScope({ kind: "personal" })}>
            {t.action}
          </Link>
        }
      />
    </div>
  );
}

/** La marca «Solo personal» junto a un elemento del menú cuando el ámbito es el Hogar. */
export function PersonalTag({ route }: { route: RouteId }) {
  const { dict } = useI18n();
  const scope = useScope();
  if (scope.kind !== "household" || !isPersonalOnlyRoute(route)) return null;
  return (
    <span className="personal-tag" title={dict.fin.hh.personalOnly.tagHint}>
      {dict.fin.hh.personalOnly.tag}
    </span>
  );
}
