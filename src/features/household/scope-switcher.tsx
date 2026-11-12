"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { fmsHref } from "@/nav/routes";
import { fill } from "../finance/helpers";
import { PERSONAL, scopeKey, type Scope } from "./scope";
import { setScope, useHouseholds, useScope } from "./scope-store";

/** De la opción elegida (`personal`, `household:<id>`, `both:<id>`) al ámbito; lo que no sea del formato, Personal. */
export function parseScopeOption(value: string): Scope {
  const [kind, id] = value.split(":");
  if ((kind === "household" || kind === "both") && id) return { kind, id };
  return PERSONAL;
}

/**
 * El selector de ámbito, visible en toda la app (cabecera): Personal / Hogar X / Ambos · X. Es un `<select>` nativo (teclado, lector
 * de pantalla y selector del teléfono gratis). El ámbito vive en memoria; nunca en la URL ni en el almacenamiento del navegador.
 */
export function ScopeSwitcher() {
  const { dict, locale } = useI18n();
  const t = dict.fin.hh.scope;
  const scope = useScope();
  const { data, status } = useHouseholds();
  const households = data?.households ?? [];
  const invitations = data?.invitations.length ?? 0;
  const value = scopeKey(scope);
  const known = scope.kind === "personal" || households.some((h) => h.id === scope.id);

  return (
    <div className="scope-switcher">
      <label className="visually-hidden" htmlFor="scope-select">
        {t.label}
      </label>
      <select
        id="scope-select"
        className="scope-switcher__select"
        value={known ? value : "personal"}
        onChange={(event) => {
          setScope(parseScopeOption(event.target.value));
        }}
        aria-describedby="scope-hint"
      >
        <option value="personal">{t.personal}</option>
        {households.map((h) => (
          <option key={`h-${h.id}`} value={`household:${h.id}`}>
            {fill(t.householdOf, { name: h.name })}
          </option>
        ))}
        {households.map((h) => (
          <option key={`b-${h.id}`} value={`both:${h.id}`}>
            {fill(t.bothOf, { name: h.name })}
          </option>
        ))}
      </select>
      <span id="scope-hint" className="visually-hidden">
        {t.hint}
      </span>
      {status !== "idle" && (
        <Link href={fmsHref(locale, invitations > 0 ? "hogar-invitaciones" : "hogares")} className="scope-switcher__link">
          {invitations > 0 ? fill(t.invitations, { n: String(invitations) }) : t.manage}
        </Link>
      )}
    </div>
  );
}
