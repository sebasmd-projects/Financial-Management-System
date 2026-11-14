"use client";

import { useMemo, useState } from "react";
import { api } from "@/api";
import type { Category, DryRun } from "@/api/models";
import { paths } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { Icon } from "@/ui/icons";
import { fill } from "../helpers";
import { useAll, useResource, useSubmit } from "../hooks";
import { Badge, Banner, Empty, ErrorState, FormActions, Loading, Modal, ScreenHeader, Section } from "../kit";
import { ReadOnlyBanner } from "../../household/notices";
import { useCanWrite } from "../../household/scope-store";
import { describeCondition, draftFromConditions, draftFromRule, emptyAutoRule, isAutoConfirmRule, suggestedRuleName, syncApi, type AutoRuleDraft, type ConditionTexts, type CustomRule, type LooseCondition, type SyncCatalog, type SyncRuleSuggestion } from "../../../../core/sync";
import { AutoRuleForm } from "./auto-rule-form";
import { SyncDryResult } from "./dry-result";

const sync = syncApi(api);

type Editing = { rule: CustomRule | null; draft: AutoRuleDraft } | null;

/**
 * `/configuracion/autoconfirmacion` (W3): las reglas que confirman solas los movimientos que llegan del correo (nómina, suscripciones…), con sus
 * sugerencias. La condición se muestra en lenguaje de persona; «Probar» lista los casos de los últimos 90 días sin efectos; pausar y borrar. Es
 * personal: un movimiento de un hogar siempre queda por revisar.
 */
export function AutoRulesScreen() {
  const { dict } = useI18n();
  const t = dict.fin.sync.rules;
  const canWrite = useCanWrite();
  const rules = useResource<{ results: CustomRule[] }>("/automation/rules?page_size=100");
  const suggestions = useResource<{ results: SyncRuleSuggestion[] }>("/sync/rule-suggestions");
  const catalog = useResource<SyncCatalog>("/sync/catalog");
  const categories = useAll<Category>(paths.categories({ archived: false }));
  const [editing, setEditing] = useState<Editing>(null);
  const [testing, setTesting] = useState<CustomRule | null>(null);
  const [removing, setRemoving] = useState<CustomRule | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const list = (rules.data?.results ?? []).filter(isAutoConfirmRule);
  const institutions = catalog.data?.institutions ?? [];

  const texts = useMemo<ConditionTexts>(
    () => ({
      institution: t.conditions.institution,
      kind: t.conditions.kind,
      kinds: dict.fin.sync.review.kinds,
      text: t.conditions.text,
      amountMin: t.conditions.amountMin,
      amountMax: t.conditions.amountMax,
      dayMin: t.conditions.dayMin,
      dayMax: t.conditions.dayMax,
    }),
    [t, dict],
  );
  const institutionName = (code: string) => institutions.find((i) => i.code === code)?.name;
  const categoryName = (id: string | null) => (id ? categories.items.find((c) => c.id === id)?.name : undefined);
  const describe = (conditions: readonly LooseCondition[]) => conditions.map((c) => describeCondition(c, texts, institutionName));
  const reload = () => {
    rules.reload();
    suggestions.reload();
  };

  return (
    <div className="screen">
      <ScreenHeader
        title={dict.screens["config-autoconfirmacion"]}
        eyebrow={dict.nav.sections.config}
        actions={
          canWrite && (
            <button type="button" className="button button--primary" onClick={() => setEditing({ rule: null, draft: emptyAutoRule() })}>
              <Icon name="plus" size={20} />
              {t.add}
            </button>
          )
        }
      />
      <ReadOnlyBanner />
      <p className="muted">{t.intro}</p>
      {note && (
        <p role="status" aria-live="polite">
          {note}
        </p>
      )}

      {suggestions.data && suggestions.data.results.length > 0 && canWrite && (
        <Section title={t.suggestionsTitle}>
          <p className="muted">{t.suggestionsIntro}</p>
          <ul className="fin-list" aria-label={t.suggestionsTitle}>
            {suggestions.data.results.map((s) => (
              <SuggestionRow
                key={s.key}
                suggestion={s}
                lines={describe(s.conditions)}
                onAccept={() => {
                  const draft = draftFromConditions(s.conditions);
                  if (draft) setEditing({ rule: null, draft: { ...draft, name: suggestedRuleName(s, t.suggestionPrefix) } });
                }}
                onDismissed={() => {
                  setNote(t.dismissed);
                  suggestions.reload();
                }}
              />
            ))}
          </ul>
        </Section>
      )}

      {rules.loading && !rules.data && <Loading />}
      {rules.failure && <ErrorState message={t.loadError} onRetry={rules.reload} />}
      {rules.data && list.length === 0 && <Empty icon="gear" title={t.emptyTitle} body={t.emptyBody} />}
      {list.length > 0 && (
        <ul className="fin-list" aria-label={t.listLabel}>
          {list.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              lines={describe(rule.conditions)}
              categoryName={categoryName(rule.action_category_id)}
              canWrite={canWrite}
              onEdit={() => {
                const draft = draftFromRule(rule);
                if (draft) setEditing({ rule, draft });
              }}
              onTest={() => setTesting(rule)}
              onRemove={() => setRemoving(rule)}
              onToggled={(message) => {
                setNote(message);
                reload();
              }}
            />
          ))}
        </ul>
      )}

      <Modal open={editing !== null} title={editing?.rule ? t.editTitle : t.newTitle} onClose={() => setEditing(null)}>
        {editing && (
          <AutoRuleForm
            rule={editing.rule}
            initial={editing.draft}
            institutions={institutions}
            onCancel={() => setEditing(null)}
            onDone={(saved) => {
              setNote(fill(editing.rule ? t.updated : t.created, { name: saved.name }));
              setEditing(null);
              reload();
            }}
          />
        )}
      </Modal>
      <Modal open={testing !== null} title={t.testTitle} onClose={() => setTesting(null)}>
        {testing && <TestBody rule={testing} onClose={() => setTesting(null)} />}
      </Modal>
      <Modal open={removing !== null} title={t.removeTitle} onClose={() => setRemoving(null)}>
        {removing && (
          <RemoveBody
            rule={removing}
            onCancel={() => setRemoving(null)}
            onDone={() => {
              setRemoving(null);
              setNote(t.removed);
              reload();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function RuleRow({ rule, lines, categoryName, canWrite, onEdit, onTest, onRemove, onToggled }: { rule: CustomRule; lines: string[]; categoryName: string | undefined; canWrite: boolean; onEdit: () => void; onTest: () => void; onRemove: () => void; onToggled: (message: string) => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.sync.rules;
  const toggle = useSubmit();
  const editable = draftFromRule(rule) !== null;
  async function flip() {
    const body = { enabled: !rule.enabled };
    const result = await toggle.run({ id: rule.id, ...body }, () => sync.patchRule(rule.id, body, { locale }));
    if (result.ok) onToggled(rule.enabled ? t.paused_ok : t.resumed_ok);
  }
  return (
    <li className="fin-row fin-row--static auto-rule">
      <div className="fin-row__main">
        <span className="fin-row__title">{rule.name}</span>
        <span className="fin-row__badges">
          <Badge tone={rule.enabled ? "positive" : "neutral"}>{rule.enabled ? t.active : t.paused}</Badge>
        </span>
        <span className="fin-row__sub muted">{t.when}</span>
        <ul className="sync-conditions">
          {lines.map((line) => (
            <li key={line} className="fin-row__sub">
              {line}
            </li>
          ))}
        </ul>
        <span className="fin-row__sub muted">
          {t.then}
          {categoryName ? `, ${fill(t.withCategory, { name: categoryName })}` : ""}
          {rule.action_counterparty ? `, ${fill(t.withCounterparty, { name: rule.action_counterparty })}` : ""}
        </span>
        <span className="fin-row__sub muted">
          {rule.applied_count === 1 ? t.appliedOne : fill(t.applied, { n: String(rule.applied_count) })}
          {rule.last_applied_at ? ` · ${fill(t.lastApplied, { date: formatDate(rule.last_applied_at) })}` : ` · ${t.neverApplied}`}
        </span>
        {!editable && <span className="fin-row__sub muted">{t.cannotEdit}</span>}
        {toggle.error && (
          <span className="field__error" role="alert">
            {toggle.error}
          </span>
        )}
        {canWrite && (
          <span className="actions">
            <button type="button" className="button button--ghost" onClick={onTest}>
              {t.test}
              <span className="visually-hidden"> {rule.name}</span>
            </button>
            <button type="button" className="button button--ghost" disabled={toggle.pending} onClick={() => void flip()}>
              {rule.enabled ? t.pause : t.resume}
              <span className="visually-hidden"> {rule.name}</span>
            </button>
            {editable && (
              <button type="button" className="button button--ghost" onClick={onEdit}>
                {t.edit}
                <span className="visually-hidden"> {rule.name}</span>
              </button>
            )}
            <button type="button" className="button button--ghost" onClick={onRemove}>
              {t.remove}
              <span className="visually-hidden"> {rule.name}</span>
            </button>
          </span>
        )}
      </div>
    </li>
  );
}

function SuggestionRow({ suggestion, lines, onAccept, onDismissed }: { suggestion: SyncRuleSuggestion; lines: string[]; onAccept: () => void; onDismissed: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.sync.rules;
  const submit = useSubmit();
  async function dismiss() {
    const result = await submit.run({ dismiss: suggestion.key }, () => sync.dismissSuggestion(suggestion.key, { locale }));
    if (result.ok) onDismissed();
  }
  return (
    <li className="fin-row fin-row--static">
      <div className="fin-row__main">
        <span className="fin-row__title">{fill(t.suggestionCount, { n: String(suggestion.count) })}</span>
        <ul className="sync-conditions">
          {lines.map((line) => (
            <li key={line} className="fin-row__sub">
              {line}
            </li>
          ))}
        </ul>
        {submit.error && (
          <span className="field__error" role="alert">
            {submit.error}
          </span>
        )}
        <span className="actions">
          <button type="button" className="button button--primary" onClick={onAccept}>
            {t.accept}
            <span className="visually-hidden"> {suggestion.text}</span>
          </button>
          <button type="button" className="button button--ghost" disabled={submit.pending} onClick={() => void dismiss()}>
            {t.dismiss}
            <span className="visually-hidden"> {suggestion.text}</span>
          </button>
        </span>
      </div>
    </li>
  );
}

/** «Probar» una regla guardada: evalúa sus condiciones contra los correos de los últimos 90 días, sin efectos. */
function TestBody({ rule, onClose }: { rule: CustomRule; onClose: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.sync.rules;
  const submit = useSubmit();
  const [dry, setDry] = useState<DryRun | null>(null);
  async function run() {
    const body = { trigger: "sync_event" as const, conditions: rule.conditions };
    const result = await submit.run(body, () => sync.previewRule(body, { locale }));
    if (result.ok) setDry(result.data);
  }
  return (
    <div className="fin-form">
      <p className="muted">{rule.name}</p>
      <p className="hint">{t.testIntro}</p>
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
        </Banner>
      )}
      <FormActions>
        <button type="button" className="button button--primary" disabled={submit.pending} onClick={() => void run()}>
          {submit.pending ? t.testing : t.testRun}
        </button>
        <button type="button" className="button button--ghost" onClick={onClose}>
          {dict.common.close}
        </button>
      </FormActions>
      {dry && <SyncDryResult dry={dry} />}
    </div>
  );
}

function RemoveBody({ rule, onDone, onCancel }: { rule: CustomRule; onDone: () => void; onCancel: () => void }) {
  const { dict, locale } = useI18n();
  const t = dict.fin.sync.rules;
  const submit = useSubmit();
  async function remove() {
    const result = await submit.run({ remove: rule.id }, () => sync.deleteRule(rule.id, { locale }));
    if (result.ok) onDone();
  }
  return (
    <div className="fin-form">
      <p>{fill(t.removeBody, { name: rule.name })}</p>
      {submit.error && (
        <Banner tone="negative" live="assertive">
          {submit.error}
        </Banner>
      )}
      <FormActions>
        <button type="button" className="button button--danger" disabled={submit.pending} onClick={() => void remove()}>
          {submit.pending ? dict.fin.common.saving : t.removeConfirm}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </div>
  );
}
