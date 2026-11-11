import Link from "next/link";
import { defaultLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

export default function NotFound() {
  const dict = getDictionary(defaultLocale);
  return (
    <div className="screen">
      <h1 className="title-l">{dict.notFound.title}</h1>
      <p className="muted">{dict.notFound.body}</p>
      <Link href="/" className="button button--primary">
        {dict.common.goToSummary}
      </Link>
    </div>
  );
}
