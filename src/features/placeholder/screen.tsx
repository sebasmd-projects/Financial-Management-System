import Link from "next/link";
import { defaultLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import type { RouteId, SectionId } from "@/nav/routes";
import { Icon } from "@/ui/icons";
import { Hello } from "./hello";

/** Pantalla de relleno de FMS-0: título, la sección a la que pertenece y un estado vacío con una acción. */
export function PlaceholderScreen({ routeId, section }: { routeId: RouteId; section: SectionId | null }) {
  const dict = getDictionary(defaultLocale);
  const title = dict.screens[routeId];
  const isSummary = routeId === "resumen";
  return (
    <div className="screen">
      {section && section !== "resumen" && <p className="eyebrow">{dict.nav.sections[section]}</p>}
      <h1 className="title-l">{title}</h1>
      {isSummary && <Hello greeting={dict.placeholder.summaryHello} />}
      <section className="empty" aria-labelledby="empty-title">
        <div className="empty__art" aria-hidden="true">
          <Icon name={isSummary ? "wallet" : "grid"} size={48} />
        </div>
        <h2 id="empty-title" className="title-m">
          {isSummary ? dict.placeholder.summaryEmptyTitle : dict.placeholder.emptyTitle}
        </h2>
        <p className="muted">{isSummary ? dict.placeholder.summaryEmptyBody : dict.placeholder.emptyBody}</p>
        {!isSummary && (
          <Link href="/" className="button button--primary">
            {dict.common.goToSummary}
          </Link>
        )}
      </section>
    </div>
  );
}
