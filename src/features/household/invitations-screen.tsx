"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { HouseholdInvitation } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { formatDate } from "@/lib/dates";
import { fill } from "../finance/helpers";
import { useHref, useSubmit } from "../finance/hooks";
import { Banner, Empty, ErrorState, Loading, ScreenHeader } from "../finance/kit";
import { refreshHouseholds, setScope, useHouseholds } from "./scope-store";

/** Invitaciones a hogares (`/hogar/invitaciones`): aceptar o rechazar. Las invitaciones son dentro de la app; no se envía correo. */
export function InvitationsScreen() {
  const { dict } = useI18n();
  const t = dict.fin.hh.invitations;
  const href = useHref();
  const { data, status, reload } = useHouseholds();
  const [notice, setNotice] = useState<{ text: string; householdId?: string } | null>(null);

  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["hogar-invitaciones"]} back={{ href: href("hogares"), label: dict.screens.hogares }} />
      <p className="muted">{t.intro}</p>
      {notice && (
        <Banner tone="positive">
          {notice.text}{" "}
          {notice.householdId && (
            <Link href={href("hogar", [notice.householdId])} onClick={() => notice.householdId && setScope({ kind: "household", id: notice.householdId })}>
              {t.view}
            </Link>
          )}
        </Banner>
      )}
      {status === "loading" && !data && <Loading />}
      {status === "error" && !data && <ErrorState message={dict.fin.hh.scope.loadError} onRetry={() => void reload()} />}
      {data && data.invitations.length === 0 && <Empty icon="bell" title={t.emptyTitle} body={t.emptyBody} />}
      {data && data.invitations.length > 0 && (
        <ul className="fin-list" aria-label={dict.screens["hogar-invitaciones"]}>
          {data.invitations.map((invitation) => (
            <li key={invitation.id}>
              <InvitationCard invitation={invitation} onAnswered={(text, householdId) => setNotice({ text, householdId })} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InvitationCard({ invitation, onAnswered }: { invitation: HouseholdInvitation; onAnswered: (text: string, householdId?: string) => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.hh;
  const submit = useSubmit();

  async function answer(kind: "accept" | "decline") {
    const result = await submit.run({ kind }, (key) => api.post(paths.invitationAnswer(invitation.id, kind), undefined, { idempotencyKey: key, locale }));
    if (!result.ok) return;
    await refreshHouseholds();
    onAnswered(kind === "accept" ? fill(t.invitations.accepted, { name: invitation.household_name }) : t.invitations.declined, kind === "accept" ? invitation.household_id : undefined);
  }

  return (
    <div className="fin-card hh-invitation">
      <p className="title-s">{invitation.household_name}</p>
      <p className="muted">
        {invitation.invited_by ? fill(t.invitations.from, { name: invitation.invited_by }) : ""} {fill(t.invitations.as, { role: t.roles[invitation.role] })} · {fill(t.detail.expires, { date: formatDate(invitation.expires_at) })}
      </p>
      <p className="hint">{t.roleHelp[invitation.role]}</p>
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
        </Banner>
      )}
      <div className="actions">
        <button type="button" className="button button--primary" disabled={submit.pending} onClick={() => void answer("accept")}>
          {t.invitations.accept}
        </button>
        <button type="button" className="button button--ghost" disabled={submit.pending} onClick={() => void answer("decline")}>
          {t.invitations.decline}
        </button>
      </div>
    </div>
  );
}
