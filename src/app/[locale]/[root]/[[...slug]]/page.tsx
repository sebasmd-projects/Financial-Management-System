import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ROOT_SLUG, rootPath } from "@/config/paths";
import { Landing } from "@/features/landing/landing";
import { LandingEntry } from "@/features/landing/landing-entry";
import { IMPLEMENTED } from "@/features/finance/implemented";
import { FinanceScreen } from "@/features/finance/screens";
import { PlaceholderScreen } from "@/features/placeholder/screen";
import { htmlLang, isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { parseFmsPath } from "@/nav/routes";
import { alternatesFor, siteOrigin } from "@/seo/site";

// Las pantallas sin implementar son de relleno (FMS-0): una sola página resuelve la ruta contra la tabla de `nav/routes.ts`
// (la misma para los dos idiomas). La raíz `/<idioma>/<raíz>` es la página de aterrizaje pública y, para quien tiene la
// cuenta activa, el Resumen. Lo que no esté en la tabla, o no sea `/es/finanzas` ni `/en/finance`, es un 404.
type Props = { params: Promise<{ locale: string; root: string; slug?: string[] }> };

async function resolve({ params }: Props) {
  const { locale, root, slug = [] } = await params;
  if (!isLocale(locale) || root !== ROOT_SLUG[locale]) return null;
  const pathname = slug.length === 0 ? rootPath(locale) : `${rootPath(locale)}/${slug.join("/")}`;
  const parsed = parseFmsPath(pathname);
  if (!parsed || !parsed.match) return null;
  return { locale: locale as Locale, pathname, parsed, match: parsed.match };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const found = await resolve(props);
  if (!found) return { title: getDictionary("es").notFound.title };
  const { locale, pathname, parsed, match } = found;
  const dict = getDictionary(locale);
  const alternates = alternatesFor(pathname, locale, siteOrigin());
  if (parsed.isLanding) {
    // La única página que se indexa. Su HTML no lleva nada de la persona (ver `features/landing/landing-entry.tsx`).
    return {
      title: { absolute: dict.landing.metaTitle },
      description: dict.landing.metaDescription,
      alternates,
      robots: { index: true, follow: true },
      openGraph: { type: "website", title: dict.landing.metaTitle, description: dict.landing.metaDescription, url: alternates.canonical, locale: htmlLang[locale].replace("-", "_"), siteName: dict.appName },
    };
  }
  return { title: `${dict.screens[match.route.id]} · ${dict.appName}`, alternates, robots: { index: false, follow: false, nocache: true } };
}

export default async function Page(props: Props) {
  const found = await resolve(props);
  if (!found) notFound();
  const { locale, parsed, match } = found;
  // Las pantallas de FMS-1 (cuentas, movimientos, tarjetas, créditos, pagos) viven en `features/finance`; el resto sigue de relleno.
  const screen = IMPLEMENTED.has(match.route.id) ? (
    <FinanceScreen routeId={match.route.id} params={match.params} />
  ) : (
    <PlaceholderScreen locale={locale} routeId={match.route.id} section={match.route.section} />
  );
  if (!parsed.isLanding) return screen;
  return <LandingEntry landing={<Landing locale={locale} />} summary={screen} />;
}
