"use client";

import { useI18n } from "@/i18n/provider";

// Sin `console.error`: el mensaje de un error puede arrastrar datos. Next ya lo registra en el servidor sin el cuerpo.
export default function ErrorScreen({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { dict } = useI18n();
  return (
    <div className="screen" role="alert">
      <h1 className="title-l">{dict.error.title}</h1>
      <p className="muted">{dict.error.body}</p>
      <button type="button" className="button button--primary" onClick={reset}>
        {dict.common.retry}
      </button>
    </div>
  );
}
