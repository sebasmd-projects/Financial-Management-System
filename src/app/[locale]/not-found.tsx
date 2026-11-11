"use client";

import Link from "next/link";
import { rootPath } from "@/config/paths";
import { useI18n } from "@/i18n/provider";

export default function NotFound() {
  const { dict, locale } = useI18n();
  return (
    <div className="screen">
      <h1 className="title-l">{dict.notFound.title}</h1>
      <p className="muted">{dict.notFound.body}</p>
      <Link href={rootPath(locale)} className="button button--primary">
        {dict.common.goToSummary}
      </Link>
    </div>
  );
}
