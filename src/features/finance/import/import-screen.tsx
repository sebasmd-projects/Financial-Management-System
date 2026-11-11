"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { api } from "@/api";
import { errorText } from "@/api/errors";
import type { Account, ImportBatch, ImportMapping, ImportPreview, ImportPreviewRow, ImportSavedMapping, Page } from "@/api/models";
import { paths, roots } from "@/api/paths";
import { formatDate } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import { fill, movementAccounts } from "../helpers";
import { useAll, useHref, useResource, useSubmit } from "../hooks";
import { Badge, Banner, Empty, ErrorState, FormActions, Loading, Modal, Pager, ScreenHeader, Section, SelectField } from "../kit";
import { buildUpload, fileProblem, overridesBody, tally, toggleRow, uploadFingerprint, ACCEPTED_EXTENSIONS } from "./logic";
import { MappingStep } from "./mapping-step";
import { ReviewStep } from "./review-step";

type Stage = "file" | "mapping" | "review" | "done";

function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * `/cuentas/importar` (diseño §3.6, corte 2.6): archivo → columnas (solo la primera vez por banco) → revisión fila por fila →
 * confirmar. El archivo se queda en la MEMORIA de esta pantalla solo para enviarlo; no pasa por el almacenamiento del navegador.
 * Confirmar reenvía el mismo archivo con una `Idempotency-Key` por intención: reintentar no duplica nada.
 */
export function ImportScreen() {
  const { dict, locale } = useI18n();
  const t = dict.fin.imp;
  const href = useHref();
  const accounts = useAll<Account>(paths.accounts());
  const submit = useSubmit();
  const [historyPage, setHistoryPage] = useState(1);
  const history = useResource<Page<ImportBatch>>(paths.imports({ page: historyPage }));
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("file");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [save, setSave] = useState(true);
  const [choices, setChoices] = useState<Map<number, "import" | "skip">>(new Map());
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportBatch | null>(null);
  const [undoing, setUndoing] = useState<ImportBatch | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileId = useId();

  const usable = movementAccounts(accounts.items);
  const account = usable.find((a) => a.id === accountId) ?? usable[0] ?? null;
  const steps: { id: Stage; label: string }[] = [
    { id: "file", label: t.steps.file },
    { id: "mapping", label: t.steps.mapping },
    { id: "review", label: t.steps.review },
    { id: "done", label: t.steps.done },
  ];

  function reset() {
    setFile(null);
    setPreview(null);
    setMapping(null);
    setChoices(new Map());
    setResult(null);
    setError(null);
    setFileError(null);
    setStage("file");
  }

  function pick(next: File | null) {
    setFileError(null);
    setError(null);
    if (!next) {
      setFile(null);
      return;
    }
    const problem = fileProblem(next);
    if (problem) {
      setFile(null);
      setFileError(problem === "too_large" ? t.file.tooLarge : problem === "empty" ? t.file.empty : t.file.extension);
      return;
    }
    setFile(next);
  }

  async function analyze(chosen: ImportMapping | null, remember = save) {
    if (!file || !account) return;
    setAnalyzing(true);
    setError(null);
    try {
      const response = await api.post<ImportPreview>(paths.importPreview(), buildUpload({ file, accountId: account.id, mapping: chosen }), { locale });
      if (!response.ok) {
        setError(errorText(response, dict.fin.errors));
        return;
      }
      setPreview(response.data);
      setMapping(response.data.mapping_source === "provided" ? chosen : null);
      setSave(remember);
      setChoices(new Map());
      setStage(response.data.needs_mapping ? "mapping" : "review");
    } finally {
      setAnalyzing(false);
    }
  }

  async function commit() {
    if (!file || !account || !preview) return;
    // El mapeo que se usó en la vista previa es el que se reenvía; el guardado del banco o el del OFX los pone el servidor.
    const sent = preview.mapping_source === "provided" ? (mapping ?? preview.mapping) : null;
    const input = { file, accountId: account.id, mapping: sent, overrides: overridesBody(choices), saveMapping: sent ? save : undefined };
    const outcome = await submit.run(uploadFingerprint(input), (key) => api.post<ImportBatch>(roots.imports, buildUpload(input), { idempotencyKey: key, locale }));
    if (outcome.ok) {
      setResult(outcome.data);
      setStage("done");
      setFile(null);
      history.reload();
    }
  }

  const counts = preview ? tally(preview.rows, choices) : null;
  const nothing = counts ? counts.import + counts.confirm + counts.link === 0 : true;

  return (
    <div className="screen">
      <ScreenHeader title={dict.screens["cuentas-importar"]} eyebrow={dict.nav.sections.cuentas} back={{ href: href("cuentas"), label: dict.screens.cuentas }} />
      <p className="muted">{t.intro}</p>
      <ol className="imp-steps" aria-label={t.steps.label}>
        {steps.map((step) => (
          <li key={step.id} aria-current={step.id === stage ? "step" : undefined} className={step.id === stage ? "imp-steps__current" : ""}>
            {step.label}
          </li>
        ))}
      </ol>
      {notice && <Banner tone="positive">{notice}</Banner>}

      {stage === "file" && (
        <>
          {accounts.loading && !accounts.data && <Loading />}
          {accounts.failure && <ErrorState message={dict.fin.errors.generic} onRetry={accounts.reload} />}
          {accounts.data && usable.length === 0 && (
            <Empty
              title={t.file.noAccountsTitle}
              body={t.file.noAccountsBody}
              action={
                <Link className="button button--primary" href={href("cuentas")}>
                  {t.file.goToAccounts}
                </Link>
              }
            />
          )}
          {usable.length > 0 && (
            <form className="fin-form" noValidate onSubmit={(event) => { event.preventDefault(); void analyze(null); }}>
              <SelectField label={t.file.account} value={account?.id ?? ""} onChange={setAccountId} options={usable.map((a) => ({ value: a.id, label: a.name }))} />
              <div className="field">
                <label className="field__label" htmlFor={fileId}>
                  {t.file.pick}
                </label>
                <input id={fileId} className="input" type="file" accept={ACCEPTED_EXTENSIONS.join(",")} aria-describedby={`${fileId}-hint`} onChange={(event) => pick(event.target.files?.[0] ?? null)} />
                <p id={`${fileId}-hint`} className="hint">
                  {t.file.pickHint}
                </p>
                {fileError && <p className="field__error" role="alert">{fileError}</p>}
                {file && <p className="hint">{fill(t.file.chosen, { name: file.name, size: sizeText(file.size) })}</p>}
              </div>
              <p className="hint">{t.file.privacy}</p>
              {error && <Banner tone="negative" live="assertive">{error}</Banner>}
              <FormActions>
                <button type="submit" className="button button--primary" disabled={!file || analyzing}>
                  {analyzing ? t.file.analyzing : t.file.analyze}
                </button>
              </FormActions>
            </form>
          )}
        </>
      )}

      {stage === "mapping" && preview && (
        <MappingStep preview={preview} busy={analyzing} error={error} onBack={reset} onApply={(chosen, remember) => void analyze(chosen, remember)} />
      )}

      {stage === "review" && preview && (
        <>
          <h2 className="title-m">{t.review.title}</h2>
          <p className="muted" data-testid="mapping-source">
            {preview.mapping_source === "saved" ? t.review.usedSaved : preview.mapping_source === "ofx" ? t.review.usedOfx : t.review.usedProvided} {fill(t.review.rows, { count: String(preview.rows.length) })}
          </p>
          {preview.mapping_source !== "ofx" && (
            <p>
              <button type="button" className="button button--ghost" onClick={() => { setError(null); setStage("mapping"); }}>
                {t.review.changeMapping}
              </button>
            </p>
          )}
          <ReviewStep preview={preview} choices={choices} onToggle={(row: ImportPreviewRow, include) => setChoices((current) => toggleRow(row, include, current))} />
          {nothing && <p className="hint">{t.review.nothing}</p>}
          <p className="hint">{t.review.commitHint}</p>
          {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
          <FormActions>
            <button type="button" className="button button--primary" onClick={() => void commit()} disabled={submit.pending || nothing}>
              {submit.pending ? t.review.committing : t.review.commit}
            </button>
            <button type="button" className="button button--ghost" onClick={reset}>
              {t.review.back}
            </button>
          </FormActions>
        </>
      )}

      {stage === "done" && result && (
        <Section title={t.done.title}>
          <ul className="fin-list" data-testid="import-result">
            <li>{fill(t.done.created, { count: String(result.created_count) })}</li>
            <li>{fill(t.done.confirmed, { count: String(result.confirmed_count) })}</li>
            <li>{fill(t.done.skipped, { count: String(result.skipped_count) })}</li>
          </ul>
          {result.created_count === 0 && result.confirmed_count === 0 && <p className="hint">{t.done.zero}</p>}
          <FormActions>
            <Link className="button button--primary" href={href("movimientos")}>
              {t.done.viewMovements}
            </Link>
            <button type="button" className="button button--ghost" onClick={() => setUndoing(result)}>
              {t.done.undo}
            </button>
            <button type="button" className="button button--ghost" onClick={reset}>
              {t.done.another}
            </button>
          </FormActions>
        </Section>
      )}

      <SavedMappings />
      <BatchHistory history={history} page={historyPage} onPage={setHistoryPage} onUndo={setUndoing} />

      <Modal open={undoing !== null} title={t.history.undoTitle} onClose={() => setUndoing(null)}>
        {undoing && (
          <UndoImport
            batch={undoing}
            onCancel={() => setUndoing(null)}
            onDone={() => {
              setUndoing(null);
              setNotice(t.done.undone);
              if (result && result.id === undoing.id) setResult(null);
              if (stage === "done") reset();
              history.reload();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function BatchHistory({ history, page, onPage, onUndo }: { history: ReturnType<typeof useResource<Page<ImportBatch>>>; page: number; onPage: (page: number) => void; onUndo: (batch: ImportBatch) => void }) {
  const { dict } = useI18n();
  const t = dict.fin.imp.history;
  const batches = history.data?.results ?? [];
  return (
    <Section title={t.title}>
      {history.loading && !history.data && <Loading />}
      {history.failure && <ErrorState message={dict.fin.errors.generic} onRetry={history.reload} />}
      {history.data && batches.length === 0 && <p className="muted">{t.empty}</p>}
      {batches.length > 0 && (
        <ul className="fin-list">
          {batches.map((batch) => (
            <li key={batch.id} className="fin-row fin-row--static">
              <span className="fin-row__main">
                <span className="fin-row__title">{formatDate(batch.created_at.slice(0, 10))}</span>
                <span className="fin-row__sub muted">{fill(t.file, { name: batch.filename ?? t.noName })}</span>
                <span className="fin-row__sub muted">{fill(t.summary, { created: String(batch.created_count), confirmed: String(batch.confirmed_count), skipped: String(batch.skipped_count) })}</span>
                <Badge tone={batch.status === "undone" ? "neutral" : "positive"}>{t.status[batch.status]}</Badge>
              </span>
              {batch.status === "committed" && (
                <button type="button" className="button button--ghost" onClick={() => onUndo(batch)}>
                  {t.undo}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {history.data && <Pager page={page} count={history.data.count} pageSize={history.data.page_size} onPage={onPage} />}
    </Section>
  );
}

function UndoImport({ batch, onDone, onCancel }: { batch: ImportBatch; onDone: () => void; onCancel: () => void }) {
  const { dict } = useI18n();
  const t = dict.fin.imp.history;
  const submit = useSubmit();
  async function confirm() {
    const outcome = await submit.run({ undo: batch.id }, () => api.post<ImportBatch>(paths.importUndo(batch.id)));
    if (outcome.ok) onDone();
  }
  return (
    <div className="fin-form">
      <p>{t.undoBody}</p>
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <FormActions>
        <button type="button" className="button button--primary" onClick={() => void confirm()} disabled={submit.pending}>
          {submit.pending ? dict.fin.common.saving : t.undoConfirm}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </FormActions>
    </div>
  );
}

/** Los mapeos que se recuerdan por banco: se reutilizan solos; aquí se pueden olvidar. */
function SavedMappings() {
  const { dict } = useI18n();
  const t = dict.fin.imp.saved;
  const list = useResource<Page<ImportSavedMapping>>(paths.importMappings());
  const submit = useSubmit();
  const items = list.data?.results ?? [];
  async function forget(id: string) {
    const outcome = await submit.run({ forget: id }, () => api.delete(paths.importMapping(id)));
    if (outcome.ok) list.reload();
  }
  if (list.data && items.length === 0) return null;
  return (
    <Section title={t.title}>
      <p className="muted">{t.intro}</p>
      {list.loading && !list.data && <Loading />}
      {list.failure && <ErrorState message={dict.fin.errors.generic} onRetry={list.reload} />}
      {submit.error && <Banner tone="negative" live="assertive">{submit.error}</Banner>}
      <ul className="fin-list">
        {items.map((item) => (
          <li key={item.id} className="fin-row fin-row--static">
            <span className="fin-row__main">
              <span className="fin-row__title">{item.name || item.kind.toUpperCase()}</span>
              <span className="fin-row__sub muted">
                {item.kind.toUpperCase()} · {item.last_used_at ? fill(t.lastUsed, { date: formatDate(item.last_used_at.slice(0, 10)) }) : t.neverUsed}
              </span>
            </span>
            <button type="button" className="button button--ghost" onClick={() => void forget(item.id)} disabled={submit.pending}>
              {t.forget}
              <span className="visually-hidden"> {item.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
