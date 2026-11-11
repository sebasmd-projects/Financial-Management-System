"use client";

import { formatDate } from "@/lib/dates";
import { useI18n } from "@/i18n/provider";
import type { Entry } from "@/api/models";
import { Badge, Money } from "../kit";

/**
 * «Ver asientos» (diseño §3.3): el único lugar donde aparecen «Debe» y «Haber». Solo lectura. Una tabla real
 * (`<table>` con `<th scope>`) para que el lector de pantalla recorra celda por celda.
 */
export function EntryTable({ entry, highlightAccount }: { entry: Entry; highlightAccount?: string }) {
  const { dict } = useI18n();
  const t = dict.fin.entries;
  const caption = `${t.entryNumber} ${entry.number} · ${formatDate(entry.date)}`;
  return (
    <div className="entry">
      <table className="table">
        <caption className="table__caption">
          <span>{caption}</span> <Badge tone={entry.voided ? "neutral" : "info"}>{dict.fin.entryStatus[entry.status]}</Badge> <span className="muted">{t.kinds[entry.kind] ?? entry.kind}</span>
        </caption>
        <thead>
          <tr>
            <th scope="col">{t.account}</th>
            <th scope="col" className="table__num">
              {t.debit}
            </th>
            <th scope="col" className="table__num">
              {t.credit}
            </th>
          </tr>
        </thead>
        <tbody>
          {entry.lines.map((line, index) => (
            <tr key={`${line.account.id}-${index}`} className={highlightAccount === line.account.id ? "table__hit" : undefined}>
              <th scope="row">{line.account.name}</th>
              <td className="table__num">{line.side === "debit" ? <Money value={line.amount} /> : null}</td>
              <td className="table__num">{line.side === "credit" ? <Money value={line.amount} /> : null}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{t.total}</th>
            <td className="table__num">
              <Money value={entry.total_debit} />
            </td>
            <td className="table__num">
              <Money value={entry.total_credit} /> {entry.balanced ? <span aria-hidden="true">✓</span> : null}
              <span className="visually-hidden">{entry.balanced ? t.balanced : t.unbalanced}</span>
            </td>
          </tr>
        </tfoot>
      </table>
      {entry.memo && <p className="muted">{entry.memo}</p>}
      {entry.reason && <p className="muted">{`${t.reason}: ${entry.reason}`}</p>}
    </div>
  );
}
