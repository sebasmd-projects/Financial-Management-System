import { cvPath, rootPath } from "@/config/paths";
import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { loginRedirectUrl, signupUrl } from "@/api/login";
import { Icon } from "@/ui/icons";

const FEATURE_ICONS = ["home", "list", "bank", "calendar-check", "loan", "chart"] as const;
const SECURITY_ICONS = ["shield", "shield", "user", "x"] as const;

/**
 * La página de aterrizaje pública (`/es/finanzas`, `/en/finance`). Componente de SERVIDOR que solo recibe el idioma:
 * no lee cookies, cabeceras ni sesión, así que su HTML es idéntico para todo el mundo (y una prueba e2e lo verifica).
 * Quien tiene sesión no ve datos aquí: el navegador pregunta a `/me` y, si la cuenta está activa, cambia esta página por
 * el Resumen (`landing-entry.tsx`).
 */
export function Landing({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const t = dict.landing;
  const other = locales.find((l) => l !== locale)!;
  const here = rootPath(locale);
  const signIn = loginRedirectUrl(locale, here);
  const signUp = signupUrl(locale, here);

  return (
    <div className="landing">
      <header className="landing__header">
        <span className="landing__brand">{dict.appName}</span>
        <nav aria-label={t.nav} className="landing__nav">
          <a className="button button--ghost" href={rootPath(other)} hrefLang={other} lang={other} title={dict.language.switchLabel}>
            {dict.language.otherName}
          </a>
          <a className="button button--ghost" href={signIn}>
            {dict.common.signIn}
          </a>
        </nav>
      </header>

      <main id="contenido" tabIndex={-1}>
        <section className="landing__hero" aria-labelledby="hero-title">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 id="hero-title" className="title-display">
            {t.heroTitle}
          </h1>
          <p className="landing__lead">{t.heroBody}</p>
          <div className="actions">
            <a className="button button--primary" href={signUp}>
              {dict.common.createAccount}
            </a>
            <a className="button button--ghost" href={signIn}>
              {dict.common.signIn}
            </a>
          </div>
          <p className="hint">{t.freeNote}</p>
        </section>

        <section className="landing__section" aria-labelledby="features-title">
          <h2 id="features-title" className="title-l">
            {t.featuresTitle}
          </h2>
          <ul className="cards">
            {t.features.map((feature, index) => (
              <li key={feature.title} className="card">
                <span className="card__icon" aria-hidden="true">
                  <Icon name={FEATURE_ICONS[index % FEATURE_ICONS.length]} />
                </span>
                <h3 className="title-s">{feature.title}</h3>
                <p className="body-s muted">{feature.body}</p>
              </li>
            ))}
          </ul>
          <p className="hint">{t.rolloutNote}</p>
        </section>

        <section className="landing__section landing__section--tint" aria-labelledby="security-title">
          <h2 id="security-title" className="title-l">
            {t.securityTitle}
          </h2>
          <p className="muted">{t.securityIntro}</p>
          <ul className="cards">
            {t.security.map((item, index) => (
              <li key={item.title} className="card">
                <span className="card__icon card__icon--positive" aria-hidden="true">
                  <Icon name={SECURITY_ICONS[index % SECURITY_ICONS.length]} />
                </span>
                <h3 className="title-s">{item.title}</h3>
                <p className="body-s muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing__section landing__final" aria-labelledby="final-title">
          <h2 id="final-title" className="title-l">
            {t.finalTitle}
          </h2>
          <p className="muted">{t.finalBody}</p>
          <div className="actions">
            <a className="button button--primary" href={signUp}>
              {dict.common.createAccount}
            </a>
            <a className="button button--ghost" href={signIn}>
              {dict.common.signIn}
            </a>
          </div>
        </section>
      </main>

      <footer className="landing__footer">
        <a href={cvPath(locale, "terms")}>{t.footerTerms}</a>
        <a href={cvPath(locale, "privacy")}>{t.footerPrivacy}</a>
      </footer>
    </div>
  );
}
