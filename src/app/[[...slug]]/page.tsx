import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlaceholderScreen } from "@/features/placeholder/screen";
import { defaultLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { matchRoute } from "@/nav/routes";

// Todas las pantallas de FMS-0 son de relleno: una sola página resuelve la ruta contra la tabla del diseño §1.4
// (`nav/routes.ts`). Cuando una pantalla tenga su contenido (FMS-1) se le da su carpeta propia y esta deja de
// resolverla. Lo que no esté en la tabla es un 404.
type Props = { params: Promise<{ slug?: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug = [] } = await params;
  const match = matchRoute(`/${slug.join("/")}`);
  return { title: match ? getDictionary(defaultLocale).screens[match.route.id] : getDictionary(defaultLocale).notFound.title };
}

export default async function Page({ params }: Props) {
  const { slug = [] } = await params;
  const match = matchRoute(`/${slug.join("/")}`);
  if (!match) notFound();
  return <PlaceholderScreen routeId={match.route.id} section={match.route.section} />;
}
