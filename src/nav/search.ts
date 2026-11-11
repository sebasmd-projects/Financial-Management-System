import type { Dictionary } from "@/i18n/get-dictionary";
import { SECTIONS, type NavItem, type NavSection } from "./routes";

/** Minúsculas y sin tildes: «parametros» encuentra «Parámetros Colombia». */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export interface SectionHit {
  section: NavSection;
  items: NavItem[];
  /** El nombre de la sección coincide: se listan todos sus subelementos. */
  sectionMatches: boolean;
}

/** El buscador de pantallas de la hoja «Más» (diseño §1.2): sección o subelemento cuyo nombre contiene el texto. */
export function searchScreens(query: string, dict: Dictionary): SectionHit[] {
  const q = normalize(query);
  const hits: SectionHit[] = [];
  for (const section of SECTIONS) {
    const sectionMatches = q === "" || normalize(dict.nav.sections[section.id]).includes(q);
    const items = section.items.filter((item) => sectionMatches || normalize(dict.nav.items[item.id] ?? "").includes(q));
    if (sectionMatches || items.length > 0) hits.push({ section, items, sectionMatches });
  }
  return hits;
}
