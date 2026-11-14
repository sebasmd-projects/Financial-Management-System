import { Linking } from "react-native";
import type { MailLink } from "@core/sync";
import { sanitizeMailLink } from "./deeplink";

/**
 * «Ir al correo»: abre el mensaje en la web o la app del proveedor, FUERA de esta app. Solo si la URL pasa la lista blanca de
 * `deeplink.ts`; si no, o si el teléfono no la abre, devuelve `false` y la pantalla muestra la pista de búsqueda. No pide permisos nuevos.
 */
export async function openMail(link: Pick<MailLink, "url"> | null | undefined): Promise<boolean> {
  const url = sanitizeMailLink(link);
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
