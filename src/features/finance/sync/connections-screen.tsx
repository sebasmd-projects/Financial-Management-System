"use client";

import { useState } from "react";
import { api } from "@/api";
import { formatDate } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { fill } from "../helpers";
import { useResource, useSubmit } from "../hooks";
import { Badge, Banner, Empty, ErrorState, FormActions, Loading, Modal, ScreenHeader } from "../kit";
import { ReadOnlyBanner } from "../../household/notices";
import { useCanWrite } from "../../household/scope-store";
import { activeForwardingCode, connectionHealth, syncApi, syncPaths, type Provider, type SyncCatalog, type SyncConnection, type SyncConnectionHealth, type SyncConnectionPage } from "../../../../core/sync";
import { Created, Wizard } from "./wizard";
import { ForwardingGuide } from "./forwarding";

const sync = syncApi(api);

type Dialog = { kind: "add" } | { kind: "how"; connection: SyncConnection } | { kind: "rotate"; connection: SyncConnection } | { kind: "remove"; connection: SyncConnection } | null;

/**
 * `/configuracion/conexiones` (W1): los bancos conectados por correo, con su salud, y el asistente para conectar otro. Solo lectura: crear,
 * rotar y borrar piden reautenticación; Nequi y Nu no se ofrecen aquí (se activan en la app). Nunca se muestra un correo.
 */
export function ConnectionsScreen() {
  const { dict } = useI18n();
  const t = dict.fin.sync.conn;
  const canWrite = useCanWrite();
  const catalog = useResource<SyncCatalog>("/sync/catalog");
  const list = useResource<SyncConnectionPage>("/sync/connections?page_size=100");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState<string | null>(null);
  const connections = list.data?.results ?? [];
  const configured = catalog.data?.configured ?? true;
  const close = () => setDialog(null);

  return (
    <div className="screen">
      <ScreenHeader
        title={dict.screens["config-conexiones"]}
        eyebrow={dict.nav.sections.config}
        actions={
          canWrite && (
            <button type="button" className="button button--primary" disabled={!catalog.data || !configured} onClick={() => setDialog({ kind: "add" })}>
              <Icon name="plus" size={20} />
              {t.add}
            </button>
          )
        }
      />
      <ReadOnlyBanner />
      <p className="muted">{t.intro}</p>
      <p className="hint">{t.mobileOnly}</p>
      {catalog.data && !configured && <Banner tone="warning">{t.notConfigured}</Banner>}
      {note && (
        <p role="status" aria-live="polite">
          {note}
        </p>
      )}
      {list.loading && !list.data && <Loading />}
      {list.failure && <ErrorState message={t.loadError} onRetry={list.reload} />}
      {list.data && connections.length === 0 && <Empty icon="bank" title={t.emptyTitle} body={t.emptyBody} />}
      {connections.length > 0 && (
        <ul className="fin-list" aria-label={t.listLabel}>
          {connections.map((connection) => (
            <ConnectionRow key={connection.id} connection={connection} canWrite={canWrite} onDialog={setDialog} onChanged={(message) => { setNote(message); list.reload(); }} />
          ))}
        </ul>
      )}

      <Modal open={dialog?.kind === "add"} title={dict.fin.sync.wizard.title} onClose={() => { close(); list.reload(); }}>
        {catalog.data && dialog?.kind === "add" && <Wizard catalog={catalog.data} existing={connections} onDone={() => { close(); list.reload(); }} />}
      </Modal>
      <Modal open={dialog?.kind === "how"} title={dialog?.kind === "how" ? fill(dict.fin.sync.wizard.howTitle, { bank: dialog.connection.institution_name }) : ""} onClose={close}>
        {dialog?.kind === "how" && <HowTo connection={dialog.connection} onDone={close} />}
      </Modal>
      <Modal open={dialog?.kind === "rotate"} title={t.rotateTitle} onClose={() => { close(); list.reload(); }}>
        {dialog?.kind === "rotate" && <RotateBody connection={dialog.connection} onDone={() => { close(); list.reload(); }} />}
      </Modal>
      <Modal open={dialog?.kind === "remove"} title={t.removeTitle} onClose={close}>
        {dialog?.kind === "remove" && (
          <RemoveBody
            connection={dialog.connection}
            onCancel={close}
            onDone={() => {
              close();
              setNote(t.removed_ok);
              list.reload();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function ConnectionRow({ connection, canWrite, onDialog, onChanged }: { connection: SyncConnection; canWrite: boolean; onDialog: (dialog: Dialog) => void; onChanged: (note: string) => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.sync.conn;
  const toggle = useSubmit();
  // La salud la calcula el servidor (`sync/connections/{id}/health`); aquí no hay una regla de días.
  const serverHealth = useResource<SyncConnectionHealth>(syncPaths.health(connection.id));
  const health = connectionHealth(connection, serverHealth.data);
  const code = activeForwardingCode(connection);
  const paused = connection.status === "paused";
  const name = connection.label ? `${connection.institution_name} · ${connection.label}` : connection.institution_name;
  const provider = connection.provider ? (t.providers[connection.provider] ?? connection.provider) : null;
  const when = connection.last_event_at ? formatDate(connection.last_event_at) : "";

  async function flip() {
    const body = { status: paused ? ("active" as const) : ("paused" as const) };
    const result = await toggle.run({ id: connection.id, ...body }, () => sync.patchConnection(connection.id, body, { locale }));
    if (result.ok) {
      serverHealth.reload();
      onChanged(paused ? t.resumed_ok : t.paused_ok);
    }
  }

  return (
    <li className="fin-row fin-row--static sync-conn">
      <div className="fin-row__main">
        <span className="fin-row__title">{name}</span>
        <span className="fin-row__sub muted">{fill(t.account, { name: connection.account_name })}</span>
        {provider && <span className="fin-row__sub muted">{fill(t.provider, { name: provider })}</span>}
        <span className="fin-row__badges">
          <Badge tone={paused ? "neutral" : "positive"}>{paused ? t.paused : t.active}</Badge>
          {connection.include_statements && <Badge dashed>{t.statements}</Badge>}
        </span>
        <span className="fin-row__sub" role="status">
          {health.state === "ok" && fill(t.health.ok, { date: when })}
          {health.state === "waiting" && t.health.waiting}
          {health.state === "quiet" && fill(t.health.quiet, { n: String(health.days), date: when })}
          {health.state === "paused" && t.health.paused}
          {health.state === "error" && t.health.error}
        </span>
        {connection.rejected_count > 0 && <span className="fin-row__sub muted">{fill(t.rejected, { n: String(connection.rejected_count) })}</span>}
        {connection.is_manager && code && (
          <span className="fin-row__sub">
            {t.forwardingCode}: <strong className="tabular">{code}</strong>
          </span>
        )}
        {!connection.is_manager && <span className="fin-row__sub muted">{t.notManager}</span>}
        {toggle.error && (
          <span className="field__error" role="alert">
            {toggle.error}
          </span>
        )}
        {connection.is_manager && canWrite && (
          <span className="actions">
            <button type="button" className="button button--ghost" onClick={() => onDialog({ kind: "how", connection })}>
              {t.howTo}
              <span className="visually-hidden"> {name}</span>
            </button>
            <button type="button" className="button button--ghost" disabled={toggle.pending} onClick={() => void flip()}>
              {paused ? t.resume : t.pause}
              <span className="visually-hidden"> {name}</span>
            </button>
            <button type="button" className="button button--ghost" onClick={() => onDialog({ kind: "rotate", connection })}>
              {t.rotate}
              <span className="visually-hidden"> {name}</span>
            </button>
            <button type="button" className="button button--ghost" onClick={() => onDialog({ kind: "remove", connection })}>
              {t.remove}
              <span className="visually-hidden"> {name}</span>
            </button>
          </span>
        )}
      </div>
    </li>
  );
}

/** «Cómo reenviar» de una conexión que ya existe: la guía y el código de Gmail, sin la dirección (esa no se vuelve a mostrar). */
function HowTo({ connection, onDone }: { connection: SyncConnection; onDone: () => void }) {
  const { dict } = useI18n();
  const code = activeForwardingCode(connection);
  return (
    <div className="fin-form">
      <ForwardingGuide provider={(connection.provider ?? "other") as Provider} bankName={connection.institution_name} code={code} codeExpiresAt={code ? connection.forwarding_code_expires_at : null} />
      <FormActions>
        <button type="button" className="button button--primary" onClick={onDone}>
          {dict.fin.sync.conn.close}
        </button>
      </FormActions>
    </div>
  );
}

/** Rotar: confirmar → la dirección anterior deja de valer → la nueva sale UNA vez (con la guía para cambiar el filtro). */
function RotateBody({ connection, onDone }: { connection: SyncConnection; onDone: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.sync.conn;
  const submit = useSubmit();
  const [rotated, setRotated] = useState<SyncConnection | null>(null);
  async function rotate() {
    const result = await submit.run({ rotate: connection.id }, (key) => sync.rotate(connection.id, key, { locale }));
    if (result.ok) setRotated(result.data);
  }
  if (rotated) return <Created connection={rotated} onDone={onDone} onReplace={setRotated} />;
  return (
    <div className="fin-form">
      <p>{t.rotateBody}</p>
      <p className="hint">{t.reauthNote}</p>
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
        </Banner>
      )}
      <FormActions>
        <button type="button" className="button button--primary" disabled={submit.pending} onClick={() => void rotate()}>
          {submit.pending ? t.working : t.rotateConfirm}
        </button>
        <button type="button" className="button button--ghost" onClick={onDone}>
          {t.cancel}
        </button>
      </FormActions>
    </div>
  );
}

function RemoveBody({ connection, onDone, onCancel }: { connection: SyncConnection; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.sync.conn;
  const submit = useSubmit();
  async function remove() {
    const result = await submit.run({ remove: connection.id }, () => sync.deleteConnection(connection.id, { locale }));
    if (result.ok) onDone();
  }
  return (
    <div className="fin-form">
      <p>{t.removeBody}</p>
      <p className="hint">{t.reauthNote}</p>
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
        </Banner>
      )}
      <FormActions>
        <button type="button" className="button button--danger" disabled={submit.pending} onClick={() => void remove()}>
          {submit.pending ? t.working : t.removeConfirm}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {t.cancel}
        </button>
      </FormActions>
    </div>
  );
}
