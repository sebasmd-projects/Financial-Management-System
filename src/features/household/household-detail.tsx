"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/api";
import type { HouseholdDetail, HouseholdMember, HouseholdRename, InvitableRole } from "@/api/models";
import { paths } from "@/api/paths";
import { useI18n } from "@/i18n/provider";
import { formatDate } from "@/lib/dates";
import { toInt } from "@/lib/ints";
import { fill } from "../finance/helpers";
import { useHref, useResource, useSubmit } from "../finance/hooks";
import { Badge, Banner, ErrorState, FormActions, Loading, ScreenHeader, Section, SelectField, TextField } from "../finance/kit";
import { ConfirmDialog } from "./confirm-dialog";
import { CrossTransferDialog } from "./cross-transfer";
import { assignableRoles, canManageRole, canRemove, canWriteRole, invitableRoles, type Role } from "./scope";
import { refreshHouseholds, setScope } from "./scope-store";

const ROTATION_POLL_MS = 8000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Un hogar (`/hogar/[id]`): miembros y roles, invitaciones, salir, ceder y borrar (con la explicación del borrado criptográfico). */
export function HouseholdScreen({ id }: { id: string }) {
  const { dict } = useI18n();
  const t = dict.fin.hh.detail;
  const href = useHref();
  const detail = useResource<HouseholdDetail>(paths.household(id));
  const back = { href: href("hogares"), label: dict.screens.hogares };
  const rotating = detail.data?.rotating === true;
  const { reload } = detail;

  // Mientras se rota la llave, se vuelve a preguntar: el estado se apaga solo cuando termina.
  useEffect(() => {
    if (!rotating) return;
    const timer = setInterval(reload, ROTATION_POLL_MS);
    return () => clearInterval(timer);
  }, [rotating, reload]);

  if (detail.loading && !detail.data) return <div className="screen"><ScreenHeader title={dict.screens.hogar} back={back} /><Loading /></div>;
  if (detail.failure || !detail.data) {
    return (
      <div className="screen">
        <ScreenHeader title={dict.screens.hogar} back={back} />
        <ErrorState message={detail.failure?.status === 404 ? t.notFound : dict.fin.errors.generic} onRetry={detail.reload} />
      </div>
    );
  }
  return <HouseholdBody household={detail.data} back={back} reload={detail.reload} />;
}

function HouseholdBody({ household, back, reload }: { household: HouseholdDetail; back: { href: string; label: string }; reload: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.hh;
  const router = useRouter();
  const href = useHref();
  const role: Role = household.role;
  const manage = canManageRole(role);
  const [dialog, setDialog] = useState<"leave" | "transfer" | "delete" | "cross" | null>(null);
  const [removing, setRemoving] = useState<HouseholdMember | null>(null);
  const others = household.members_list.filter((m) => !m.you);
  const changed = () => {
    reload();
    void refreshHouseholds();
  };

  return (
    <div className="screen">
      <ScreenHeader
        title={household.name}
        eyebrow={dict.screens.hogar}
        back={back}
        actions={
          <span className="fin-row__badges">
            <Badge tone="info">{t.roles[role]}</Badge>
          </span>
        }
      />
      {household.rotating && (
        <Banner tone="warning">
          <strong>{t.detail.rotatingTitle}.</strong> {t.detail.rotatingBody}{" "}
          <button type="button" className="button button--ghost" onClick={reload}>
            {t.detail.refresh}
          </button>
        </Banner>
      )}
      <p className="muted">{t.roleHelp[role]}</p>
      <div className="actions">
        <button type="button" className="button button--primary" onClick={() => { setScope({ kind: "household", id: household.id }); router.push(href("cuentas")); }}>
          {t.detail.use}
        </button>
        <button type="button" className="button button--ghost" onClick={() => { setScope({ kind: "both", id: household.id }); router.push(href("resumen")); }}>
          {t.detail.useBoth}
        </button>
        {canWriteRole(role) && (
          <button type="button" className="button button--ghost" onClick={() => setDialog("cross")}>
            {t.detail.crossTransfer}
          </button>
        )}
      </div>
      <p className="hint">{t.detail.accountsHint}</p>

      {manage && (
        <Section title={t.detail.renameTitle}>
          <RenameForm household={household} onRenamed={changed} />
        </Section>
      )}

      <Section title={t.detail.members}>
        <ul className="fin-list" aria-label={t.detail.members}>
          {household.members_list.map((member) => (
            <li key={member.user_id}>
              <MemberRow household={household} member={member} onChanged={changed} onRemove={() => setRemoving(member)} />
            </li>
          ))}
        </ul>
      </Section>

      {manage && (
        <>
          <Section title={t.detail.invite}>
            <InviteForm householdId={household.id} actor={role} onSent={changed} />
          </Section>
          <Section title={t.detail.pending}>
            {household.invitations.length === 0 ? (
              <p className="muted">{t.detail.pendingNone}</p>
            ) : (
              <ul className="fin-list">
                {household.invitations.map((invitation) => (
                  <li key={invitation.id}>
                    <PendingInvitation householdId={household.id} invitation={invitation} onChanged={changed} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      <Section title={t.detail.keyTitle}>
        <p className="muted">{t.detail.keyBody}</p>
      </Section>

      <Section title={t.detail.delete}>
        <div className="actions">
          {role !== "owner" && (
            <button type="button" className="button button--ghost" onClick={() => setDialog("leave")}>
              {t.detail.leave}
            </button>
          )}
          {role === "owner" && others.length > 0 && (
            <button type="button" className="button button--ghost" onClick={() => setDialog("transfer")}>
              {t.detail.transfer}
            </button>
          )}
          {role === "owner" && (
            <button type="button" className="button button--danger" onClick={() => setDialog("delete")}>
              {t.detail.delete}
            </button>
          )}
        </div>
      </Section>

      <LeaveDialog open={dialog === "leave"} household={household} onClose={() => setDialog(null)} onDone={() => router.push(href("hogares"))} />
      <TransferDialog open={dialog === "transfer"} household={household} onClose={() => setDialog(null)} onDone={() => { setDialog(null); changed(); }} />
      <DeleteDialog open={dialog === "delete"} household={household} onClose={() => setDialog(null)} onDone={() => router.push(href("hogares"))} />
      <CrossTransferDialog open={dialog === "cross"} householdId={household.id} onClose={() => setDialog(null)} />
      {removing && (
        <ConfirmDialog
          open
          danger
          title={fill(t.detail.removeTitle, { name: removing.name })}
          confirmLabel={t.detail.removeConfirm}
          fingerprint={{ remove: removing.user_id }}
          call={(key) => api.delete(paths.householdMember(household.id, removing.user_id), { locale, idempotencyKey: key })}
          onClose={() => setRemoving(null)}
          onDone={() => { setRemoving(null); changed(); }}
        >
          <p>{t.detail.removeBody}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Renombrar el hogar (`PATCH households/{id}`, propietario y administradores): el nombre viaja en el cuerpo y se cifra con la llave del hogar. */
function RenameForm({ household, onRenamed }: { household: HouseholdDetail; onRenamed: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.hh.detail;
  const submit = useSubmit();
  const [name, setName] = useState(household.name);
  const [saved, setSaved] = useState(false);
  const trimmed = name.trim();
  const unchanged = trimmed === household.name;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaved(false);
    if (trimmed === "" || unchanged) return;
    const body: HouseholdRename = { name: trimmed };
    const result = await submit.run(body, (key) => api.patch(paths.household(household.id), body, { idempotencyKey: key, locale }));
    if (result.ok) {
      setSaved(true);
      onRenamed();
    }
  }
  return (
    <form onSubmit={onSubmit} noValidate className="fin-form">
      <TextField label={t.renameLabel} value={name} onChange={(value) => { setName(value); setSaved(false); }} maxLength={80} required />
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
        </Banner>
      )}
      {saved && <Banner tone="positive">{t.renamed}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending || trimmed === "" || unchanged}>
          {submit.pending ? dict.fin.common.saving : t.renameSave}
        </button>
      </FormActions>
    </form>
  );
}

function MemberRow({ household, member, onChanged, onRemove }: { household: HouseholdDetail; member: HouseholdMember; onChanged: () => void; onRemove: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.hh;
  const submit = useSubmit();
  const actor: Role = household.role;
  const options = assignableRoles(actor, member.role);
  const [role, setRole] = useState<string>(member.role);

  async function save() {
    const body = { role: role as InvitableRole };
    const result = await submit.run(body, (key) => api.patch(paths.householdMember(household.id, member.user_id), body, { idempotencyKey: key, locale }));
    if (result.ok) onChanged();
  }
  return (
    <div className="fin-row hh-member">
      <span className="fin-row__main">
        <span className="fin-row__title">
          {member.name}
          {member.you && <span className="muted"> ({t.detail.you})</span>}
        </span>
        <span className="fin-row__sub muted">{fill(t.detail.joined, { date: formatDate(member.joined_at) })}</span>
        <span className="fin-row__badges">
          <Badge tone={member.role === "owner" ? "positive" : "neutral"}>{t.roles[member.role]}</Badge>
        </span>
        {submit.error && (
          <Banner tone="negative" live="assertive">
            {submit.error}
          </Banner>
        )}
      </span>
      <span className="hh-row__actions">
        {options.length > 0 && (
          <>
            <SelectField label={t.detail.changeRole} value={role} onChange={setRole} options={options.map((r) => ({ value: r, label: t.roles[r] }))} />
            <button type="button" className="button button--ghost" disabled={submit.pending || role === member.role} onClick={() => void save()}>
              {t.detail.saveRole}
            </button>
          </>
        )}
        {canRemove(actor, member.role, member.you) && (
          <button type="button" className="button button--ghost" onClick={onRemove}>
            {t.detail.remove}
            <span className="visually-hidden"> {member.name}</span>
          </button>
        )}
      </span>
    </div>
  );
}

function InviteForm({ householdId, actor, onSent }: { householdId: string; actor: Role; onSent: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.hh;
  const submit = useSubmit();
  const roles = invitableRoles(actor);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>(roles[roles.length - 1] ?? "viewer");
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);
  const trimmed = email.trim();
  const emailError = touched && !EMAIL.test(trimmed) ? dict.fin.errors.invalid_email : null;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    setSent(false);
    if (!EMAIL.test(trimmed)) return;
    const body = { email: trimmed, role: role as InvitableRole };
    const result = await submit.run(body, (key) => api.post(paths.householdInvitations(householdId), body, { idempotencyKey: key, locale }));
    if (result.ok) {
      setSent(true);
      setEmail("");
      setTouched(false);
      onSent();
    }
  }
  return (
    <form onSubmit={onSubmit} noValidate className="fin-form">
      <p className="hint">{t.detail.inviteHint}</p>
      <TextField label={t.detail.email} type="email" value={email} onChange={setEmail} required autoComplete="off" error={emailError} />
      <SelectField label={t.detail.role} value={role} onChange={setRole} options={roles.map((r) => ({ value: r, label: `${t.roles[r]} · ${t.roleHelp[r]}` }))} />
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
        </Banner>
      )}
      {sent && <Banner tone="positive">{t.detail.inviteSent}</Banner>}
      <FormActions>
        <button type="submit" className="button button--primary" disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : t.detail.inviteSend}
        </button>
      </FormActions>
    </form>
  );
}

function PendingInvitation({ householdId, invitation, onChanged }: { householdId: string; invitation: HouseholdDetail["invitations"][number]; onChanged: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.hh;
  const submit = useSubmit();
  async function revoke() {
    const result = await submit.run({ revoke: invitation.id }, (key) => api.delete(paths.householdInvitation(householdId, invitation.id), { idempotencyKey: key, locale }));
    if (result.ok) onChanged();
  }
  return (
    <div className="fin-row">
      <span className="fin-row__main">
        <span className="fin-row__title">{invitation.invitee ?? "—"}</span>
        <span className="fin-row__sub muted">
          {t.roles[invitation.role]} · {fill(t.detail.expires, { date: formatDate(invitation.expires_at) })}
        </span>
        {submit.error && (
          <Banner tone="negative" live="assertive">
            {submit.error}
          </Banner>
        )}
      </span>
      <button type="button" className="button button--ghost" disabled={submit.pending} onClick={() => void revoke()}>
        {t.detail.revoke}
      </button>
    </div>
  );
}

function LeaveDialog({ open, household, onClose, onDone }: { open: boolean; household: HouseholdDetail; onClose: () => void; onDone: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.hh.detail;
  return (
    <ConfirmDialog
      open={open}
      danger
      title={t.leaveTitle}
      confirmLabel={t.leaveConfirm}
      fingerprint={{ leave: household.id }}
      call={(key) => api.post(paths.householdAction(household.id, "leave"), undefined, { idempotencyKey: key, locale })}
      onClose={onClose}
      onDone={() => {
        setScope({ kind: "personal" });
        void refreshHouseholds();
        onDone();
      }}
    >
      <p>{t.leaveBody}</p>
    </ConfirmDialog>
  );
}

function TransferDialog({ open, household, onClose, onDone }: { open: boolean; household: HouseholdDetail; onClose: () => void; onDone: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.hh.detail;
  const others = household.members_list.filter((m) => !m.you);
  const [target, setTarget] = useState(others[0] ? String(others[0].user_id) : "");
  return (
    <ConfirmDialog
      open={open}
      title={t.transferTitle}
      confirmLabel={t.transferConfirm}
      disabled={toInt(target) === null}
      fingerprint={{ transfer: target }}
      call={(key) => api.post(paths.householdAction(household.id, "transfer-ownership"), { user_id: toInt(target) ?? 0 }, { idempotencyKey: key, locale })}
      onClose={onClose}
      onDone={onDone}
    >
      <p>{t.transferBody}</p>
      <SelectField label={t.transferTo} value={target} onChange={setTarget} options={others.map((m) => ({ value: String(m.user_id), label: m.name }))} />
    </ConfirmDialog>
  );
}

function DeleteDialog({ open, household, onClose, onDone }: { open: boolean; household: HouseholdDetail; onClose: () => void; onDone: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.hh.detail;
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === household.name.trim();
  return (
    <ConfirmDialog
      open={open}
      danger
      title={t.deleteTitle}
      confirmLabel={t.deleteConfirm}
      disabled={!matches}
      fingerprint={{ delete: household.id }}
      call={(key) => api.post(paths.householdAction(household.id, "delete"), { confirm: "delete" }, { idempotencyKey: key, locale })}
      onClose={onClose}
      onDone={() => {
        setScope({ kind: "personal" });
        void refreshHouseholds();
        onDone();
      }}
    >
      <Banner tone="negative">
        <strong>{t.deleteWarn}</strong> {t.deleteBody}
      </Banner>
      <TextField label={t.deleteType} value={typed} onChange={setTyped} autoComplete="off" />
    </ConfirmDialog>
  );
}
