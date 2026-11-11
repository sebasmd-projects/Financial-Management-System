import localFont from "next/font/local";

/**
 * Sora (cifras destacadas y títulos) e Inter (todo lo demás), autoalojadas: variables, subconjunto latino, SIL OFL 1.1
 * (licencias junto a los ficheros). `next/font` las sirve desde el propio origen (`/finanzas/_next/static/media/`):
 * ningún CDN ni Google Fonts (CSP: `font-src 'self'`), con `font-display: swap` y el fallback ajustado.
 */
export const sora = localFont({
  src: "./sora-latin-wght-normal.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  variable: "--font-sora-loaded",
  fallback: ["system-ui", "sans-serif"],
});

export const inter = localFont({
  src: "./inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter-loaded",
  fallback: ["system-ui", "sans-serif"],
});
