"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/api";
import type { CustomRule, DryRun, Page, RuleCatalog, RuleTrigger } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { formatCop } from "@/lib/money";
import { formatPercent } from "@/lib/percent";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { fill } from "../helpers";
import { useHref, useResource, useSubmit } from "../hooks";
import { Badge, Banner, Checkbox, Empty, ErrorState, FormActions, Loading, Modal, Section } from "../kit";
import { DryRunView } from "./dry-run";
import { choiceLabel, fieldLabel, triggerLabel } from "./labels";
import { fieldOf, OPERATOR_SYMBOLS } from "./logic";
import { RuleForm } from "./rule-form";

/**
 * Tus reglas (`/configuración/reglas`, §3.16, corte 3.1): el constructor libre sobre el catálogo cerrado del servidor. Una regla
 * nueva «si utilización ≥ 70 % → push» se crea sin código y «Probar ahora» muestra a quién avisaría hoy, sin efectos.
 */
export function CustomRules() {
  const { dict } = useI18n();
  const t = dict.fin.auto;
  const catalog = useResource<RuleCatalog>(paths.automationCatalog());
  const rules = useResource<Page<CustomRule>>(paths.automationRules());
  const [editing, setEditing] = useState<CustomRule | "new" | null>(null);
  const [testing, setTesting] = useState<CustomRule | null>(null);
  const [removing, setRemoving] = useState<CustomRule | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const list = rules.data?.results ?? [];
  const cat = catalog.data;
  return (
    <Section
      title={t.title}
      aside={
        <button type="button" className="button button--primary" disabled={!cat} onClick={() => setEditing("new")}>
          <Icon name="plus" size={20} />
          {t.add}
        </button>
      }
    >
      <p className="muted">{t.intro}</p>
      {notice && <Banner tone="positive">{notice}</Banner>}
      {(catalog.loading && !cat) || (rules.loading && !rules.data) ? <Loading /> : null}
      {catalog.failure && <ErrorState message={dict.fin.errors.generic} onRetry={catalog.reload} />}
      {rules.failure && <ErrorState message={dict.fin.errors.generic} onRetry={rules.reload} />}
      {rules.data && list.length === 0 && <Empty icon="gear" title={t.emptyTitle} body={t.emptyBody} />}
      {cat && list.length > 0 && (
        <ul className="fin-list">
          {list.map((rule) => (
            <RuleRow key={rule.id} rule={rule} catalog={cat} onEdit={() => setEditing(rule)} onTest={() => setTesting(rule)} onRemove={() => setRemoving(rule)} onToggled={rules.reload} />
          ))}
        </ul>
      )}

      <Modal open={editing !== null} title={editing === "new" || editing === null ? t.newRule : t.editRule} onClose={() => setEditing(null)}>
        {cat && editing !== null && (
          <RuleForm
            catalog={cat}
            rule={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onDone={(saved) => {
              setEditing(null);
              setNotice(fill(editing === "new" ? t.created : t.updated, { name: saved.name }));
              rules.reload();
            }}
          />
        )}
      </Modal>
      <Modal open={testing !== null} title={t.testNow} onClose={() => setTesting(null)}>
        {cat && testing && <TestRule rule={testing} trigger={cat.triggers.find((x) => x.key === testing.trigger)} onClose={() => setTesting(null)} />}
      </Modal>
      <Modal open={removing !== null} title={t.removeTitle} onClose={() => setRemoving(null)}>
        {removing && (
          <RemoveRule
            rule={removing}
            onCancel={() => setRemoving(null)}
            onDone={() => {
              setRemoving(null);
              setNotice(t.removed);
              rules.reload();
            }}
          />
        )}
      </Modal>
    </Section>
  );
}

function RuleRow({ rule, catalog, onEdit, onTest, onRemove, onToggled }: { rule: CustomRule; catalog: RuleCatalog; onEdit: () => void; onTest: () => void; onRemove: () => void; onToggled: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.auto;
  const toggle = useSubmit();
  const trigger = catalog.triggers.find((x) => x.key === rule.trigger);
  async function flip(enabled: boolean) {
    const body = { enabled };
    const result = await toggle.run({ id: rule.id, ...body }, () => api.patch<CustomRule>(paths.automationRule(rule.id), body, { locale }));
    if (result.ok) onToggled();
  }
  return (
    <li className="fin-row fin-row--static auto-rule">
      <span className="fin-row__main">
        <span className="fin-row__title">{rule.name}</span>
        <span className="fin-row__sub muted">
          {t.when} {trigger ? triggerLabel(t, trigger.key, trigger.label) : rule.trigger}
        </span>
        {rule.conditions.map((c, index) => (
          <span key={index} className="fin-row__sub muted">
            {index === 0 ? t.ifWord : t.andWord} {conditionText(c, trigger, locale, t)}
          </span>
        ))}
        <span className="fin-row__badges">
          {rule.channels.map((channel) => (
            <Badge key={channel}>{(t.channels as Record<string, string>)[channel] ?? channel}</Badge>
          ))}
          <Badge tone={rule.enabled ? "positive" : "neutral"}>{rule.enabled ? t.active : t.paused}</Badge>
        </span>
        <span className="fin-row__sub muted">{rule.last_fired_on ? fill(t.lastFired, { date: formatDate(rule.last_fired_on) }) : t.neverFired}</span>
        <Checkbox label={`${t.enabled}: ${rule.name}`} checked={rule.enabled} onChange={(on) => void flip(on)} />
        {toggle.error && <span className="field__error" role="alert">{toggle.error}</span>}
        <span className="actions">
          <button type="button" className="button button--primary" onClick={onTest}>
            {t.testNow}
            <span className="visually-hidden"> {rule.name}</span>
          </button>
          <button type="button" className="button button--ghost" onClick={onEdit}>
            {t.edit}
            <span className="visually-hidden"> {rule.name}</span>
          </button>
          <button type="button" className="button button--ghost" onClick={onRemove}>
            {t.remove}
            <span className="visually-hidden"> {rule.name}</span>
          </button>
        </span>
      </span>
    </li>
  );
}

/** «Utilización 70 %» → «Usado ÷ cupo (%) ≥ 70 %». El valor se formatea según el tipo del campo. */
function conditionText(c: { field: string; op: string; value: string }, trigger: RuleTrigger | undefined, locale: "es" | "en", t: ReturnType<typeof useI18n>["dict"]["fin"]["auto"]): string {
  const field = fieldOf(trigger, c.field);
  const value = field?.kind === "amount" ? formatCop(c.value) : field?.kind === "percent" ? formatPercent(c.value, locale, 2) : field?.kind === "option" ? choiceLabel(t, c.value) : c.value;
  return `${fieldLabel(t, c.field, field?.label)} ${OPERATOR_SYMBOLS[c.op as keyof typeof OPERATOR_SYMBOLS] ?? c.op} ${value}`;
}

/**
 * «Probar ahora» de una regla guardada: evalúa con los datos de hoy y muestra quién cumple, sin efectos. Marcar «avisarme ahora»
 * crea UN aviso de prueba («Prueba: …») que sale por los canales de la regla, con `Idempotency-Key`: reintentar no lo duplica.
 */
function TestRule({ rule, trigger, onClose }: { rule: CustomRule; trigger: RuleTrigger | undefined; onClose: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.auto;
  const href = useHref();
  const submit = useSubmit();
  const [send, setSend] = useState(false);
  const [dry, setDry] = useState<DryRun | null>(null);
  async function run() {
    const body = { send_notification: send };
    const result = await submit.run(body, (key) => api.post<DryRun>(paths.automationRuleTest(rule.id), body, { idempotencyKey: key, locale }));
    if (result.ok) setDry(result.data);
  }
  return (
    <div className="fin-form">
      <p className="muted">{rule.name}</p>
      <p className="hint">{t.testHint}</p>
      <Checkbox label={t.sendTest} hint={t.sendTestHint} checked={send} onChange={setSend} />
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="button" className="button button--primary" disabled={submit.pending} onClick={() => void run()}>
          {submit.pending ? t.testing : t.runTest}
        </button>
        <button type="button" className="button button--ghost" onClick={onClose}>
          {dict.common.close}
        </button>
      </FormActions>
      {dry && (
        <>
          <DryRunView dry={dry} trigger={trigger} />
          {dry.notification_id ? (
            <Banner tone="positive">
              {t.testSent} <Link href={href("notificaciones")}>{dict.screens.notificaciones}</Link>
            </Banner>
          ) : send ? (
            <Banner tone="warning">{t.testNotSent}</Banner>
          ) : null}
        </>
      )}
    </div>
  );
}

function RemoveRule({ rule, onDone, onCancel }: { rule: CustomRule; onDone: () => void; onCancel: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.auto;
  const submit = useSubmit();
  async function remove() {
    const result = await submit.run({ remove: rule.id }, () => api.delete(paths.automationRule(rule.id)));
    if (result.ok) onDone();
  }
  return (
    <div className="fin-form">
      <p>{fill(t.removeBody, { name: rule.name })}</p>
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="button" className="button button--primary" disabled={submit.pending} onClick={() => void remove()}>
          {submit.pending ? dict.fin.common.saving : t.remove}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </div>
  );
}
