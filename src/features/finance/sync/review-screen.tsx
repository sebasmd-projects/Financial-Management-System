"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { useHref, useResource } from "../hooks";
import { Empty, ErrorState, Loading, Modal, Pager, ScreenHeader, Tabs } from "../kit";
import { ReadOnlyBanner } from "../../household/notices";
import { useCanWrite } from "../../household/scope-store";
import { syncPaths, type SyncConnectionPage, type SyncEvent, type SyncEventPage } from "../../../../core/sync";
import { EventCard, type Decision } from "./event-card";
import { ModifyForm } from "./modify-form";
import { useReviewCount } from "./review-count";

type Tab = "pending" | "history";

/**
 * `/movimientos/por-revisar` (W2): lo que el FMS propuso a partir de los correos de tu banco. Aprobar | Modificar | Descartar | Deshacer y «Ir al correo»
 * (enlace externo, `noopener noreferrer`; el correo nunca se muestra). Lo recién decidido queda arriba con «Deshacer» a mano. En un hogar, según tu rol.
 */
export function ReviewScreen() {
  const { dict } = useI18n();
  const t = dict.fin.sync.review;
  const href = useHref();
  const canWrite = useCanWrite();
  const { refresh } = useReviewCount();
  const [tab, setTab] = useState<Tab>("pending");
  const [page, setPage] = useState(1);
  const events = useResource<SyncEventPage>(syncPaths.events(tab === "pending" ? "proposed" : "all", page));
  const connections = useResource<SyncConnectionPage>("/sync/connections?page_size=100");
  const [recent, setRecent] = useState<{ event: SyncEvent; decision: Decision }[]>([]);
  const [modifying, setModifying] = useState<SyncEvent | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const where = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of connections.data?.results ?? []) map.set(c.id, `${c.account_name} · ${c.institution_name}`);
    return map;
  }, [connections.data]);

  function decided(event: SyncEvent, decision: Decision) {
    setRecent((list) => [{ event, decision }, ...list.filter((row) => row.event.id !== event.id)].slice(0, 10));
    setNote(decision === "approved" ? t.approved : decision === "discarded" ? t.discarded : decision === "undone" ? t.undone : t.modified);
    setModifying(null);
    events.reload();
    refresh();
  }

  const recentIds = new Set(recent.map((row) => row.event.id));
  const rows = (events.data?.results ?? []).filter((event) => !recentIds.has(event.id));
  const noConnections = connections.data !== null && connections.data.results.length === 0;
  const render = (event: SyncEvent) => <EventCard key={event.id} event={event} where={where.get(event.connection_id) ?? null} canWrite={canWrite} onDecided={decided} onModify={setModifying} />;

  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["movimientos-por-revisar"]} eyebrow={dict.nav.sections.movimientos} />
      <ReadOnlyBanner />
      <p className="muted">{t.intro}</p>
      <p role="status" aria-live="polite" className={note ? undefined : "visually-hidden"}>
        {note ?? ""}
      </p>
      <Tabs label={t.tabsLabel} tabs={[{ value: "pending", label: t.tabPending }, { value: "history", label: t.tabDecided }]} value={tab} onChange={(next) => { setTab(next); setPage(1); }}>
        {recent.length > 0 && (
          <ul className="fin-list" aria-label={t.status.approved}>
            {recent.map((row) => (
              <EventCard key={row.event.id} event={row.event} where={where.get(row.event.connection_id) ?? null} canWrite={canWrite} onDecided={decided} onModify={setModifying} />
            ))}
          </ul>
        )}
        {events.loading && !events.data && <Loading />}
        {events.failure && <ErrorState message={t.loadError} onRetry={events.reload} />}
        {events.data && rows.length === 0 && recent.length === 0 && (
          <Empty
            icon="list"
            title={tab === "pending" ? t.emptyTitle : t.emptyHistory}
            body={tab === "pending" ? (noConnections ? t.noConnections : t.emptyBody) : undefined}
            action={
              noConnections ? (
                <Link className="button button--primary" href={href("config-conexiones")}>
                  <Icon name="plus" size={20} />
                  {t.connect}
                </Link>
              ) : undefined
            }
          />
        )}
        {rows.length > 0 && <ul className="fin-list" aria-label={t.listLabel}>{rows.map(render)}</ul>}
        {events.data && events.data.count > events.data.page_size && <Pager page={events.data.page} count={events.data.count} pageSize={events.data.page_size} onPage={setPage} />}
      </Tabs>

      <Modal open={modifying !== null} title={t.modifyTitle} onClose={() => setModifying(null)}>
        {modifying && <ModifyForm event={modifying} onDone={(saved) => decided(saved, "modified")} onCancel={() => setModifying(null)} />}
      </Modal>
    </div>
  );
}
