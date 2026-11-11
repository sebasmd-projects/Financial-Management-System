import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Gate } from "@/features/gate/gate";
import { SessionProvider } from "@/features/session/provider";
import { defaultLocale, htmlLang } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { I18nProvider } from "@/i18n/provider";
import { inter, sora } from "@/ui/fonts/fonts";
import { ThemeScript } from "@/ui/theme/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Finanzas", template: "%s · Finanzas" },
  // Privada: ni se indexa ni se sigue. (Las cabeceras de `proxy.ts` lo repiten.)
  robots: { index: false, follow: false, nocache: true },
  referrer: "same-origin",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F5F1" },
    { media: "(prefers-color-scheme: dark)", color: "#111318" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // La CSP lleva un nonce por petición (proxy.ts): una página prerrenderizada no lo tendría y `strict-dynamic`
  // bloquearía sus scripts. Esperar la petición hace dinámico todo el árbol.
  await connection();
  const locale = defaultLocale;
  const dict = getDictionary(locale);
  return (
    // suppressHydrationWarning: el script del <head> pone `data-theme` en <html> antes de hidratar.
    <html lang={htmlLang[locale]} className={`${sora.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <a className="skip-link" href="#contenido">
          {dict.skipToContent}
        </a>
        <I18nProvider locale={locale} dict={dict}>
          <SessionProvider>
            <Gate>{children}</Gate>
          </SessionProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
