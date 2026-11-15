import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { components } from "@core/api/schema.gen";
import { formatCop } from "@core/money";
import { formatDate } from "@core/dates";
import { useFms } from "@/auth/use-session";
import { paths } from "@/features/common/paths";
import { useResource } from "@/features/common/use-resource";
import { es } from "@/i18n/es";
import { space } from "@/theme/tokens";
import { Money } from "@/ui/money";
import { AppText, Button, Card, Chip, Field, Notice, Screen, Title } from "@/ui/primitives";
import { cardBody, loanBody, strategyTitleKey } from "./logic";

type S = components["schemas"];
type Page<T> = { results: T[] };
const t = es.paySim;

/**
 * «Simular pago» (versión simple del simulador de la web): eliges una tarjeta o un crédito, escribes cuánto quieres pagar (o abonar) y ves, lado a
 * lado, lo que pasa con cada estrategia (total, mínimo, tu valor, diferir; solo la cuota o abonar). Solo lectura: no guarda nada. El servidor
 * calcula; aquí solo se muestra, con los supuestos a la vista.
 */
export function PaySimScreen() {
  const router = useRouter();
  const cards = useResource<Page<S["Card"]>>(paths.cards);
  const loans = useResource<Page<S["Loan"]>>(paths.loans);
  const [pick, setPick] = useState<{ kind: "card" | "loan"; id: string } | null>(null);
  const cardRows = (cards.data?.results ?? []).filter((c) => c.status === "active");
  const loanRows = (loans.data?.results ?? []).filter((l) => l.status === "active");
  const nothing = !cards.loading && !loans.loading && cardRows.length === 0 && loanRows.length === 0;
  return (
    <Screen>
      <Title>{t.title}</Title>
      <Button label={t.back} kind="ghost" onPress={() => router.back()} />
      <AppText tone="secondary">{t.intro}</AppText>
      {cards.failure || loans.failure ? <Notice>{t.loadFailed}</Notice> : null}
      {nothing ? <AppText tone="secondary">{t.empty}</AppText> : null}
      <View style={{ gap: space[8] }} accessibilityLabel={t.pick}>
        {cardRows.map((c) => (
          <Chip key={c.id} label={c.name} selected={pick?.id === c.id} onPress={() => setPick({ kind: "card", id: c.id })} a11yLabel={`${t.card} ${c.name}`} />
        ))}
        {loanRows.map((l) => (
          <Chip key={l.id} label={l.name} selected={pick?.id === l.id} onPress={() => setPick({ kind: "loan", id: l.id })} a11yLabel={`${t.loan} ${l.name}`} />
        ))}
      </View>
      {pick?.kind === "card" ? <CardSim key={pick.id} id={pick.id} /> : null}
      {pick?.kind === "loan" ? <LoanSim key={pick.id} id={pick.id} /> : null}
    </Screen>
  );
}

function useRun<T>(path: string) {
  const fms = useFms();
  const [state, setState] = useState<{ busy: boolean; data: T | null; error: string | null }>({ busy: false, data: null, error: null });
  async function run(body: unknown) {
    setState({ busy: true, data: null, error: null });
    const result = await fms.post<T>(path, body);
    if (result.ok) setState({ busy: false, data: result.data, error: null });
    else setState({ busy: false, data: null, error: result.status === 0 ? t.network : ((result as { code?: string }).code && t.errors[(result as { code: string }).code as keyof typeof t.errors]) || t.failed });
  }
  return { ...state, run };
}

function CardSim({ id }: { id: string }) {
  const [pay, setPay] = useState("");
  const sim = useRun<S["PayStrategy"]>(`/cards/${encodeURIComponent(id)}/simulators/payment-strategy`);
  const body = cardBody(pay);
  const d = sim.data;
  return (
    <View style={{ gap: space[12] }}>
      <Field label={t.payLabel} value={pay} onChangeText={setPay} keyboardType="decimal-pad" error={body === null ? t.invalidAmount : null} />
      <AppText kind="caption" tone="secondary">{t.payHint}</AppText>
      <Button label={t.simulate} busy={sim.busy} disabled={body === null} onPress={() => body && void sim.run(body)} />
      {sim.error ? <Notice>{sim.error}</Notice> : null}
      {d ? (
        <View style={{ gap: space[12] }} accessibilityLiveRegion="polite">
          <Card>
            <AppText kind="titleS">{t.statement(formatDate(d.statement.due_date))}</AppText>
            <AppText>
              {t.owe} <Money value={d.statement.total_due} /> · {t.minimum} <Money value={d.statement.minimum_due} />
            </AppText>
            {d.statement.estimated ? <AppText kind="caption" tone="secondary">{t.estimated}</AppText> : null}
          </Card>
          {d.strategies.map((o, i) => {
            const { key, terms } = strategyTitleKey(o);
            const best = i === d.cheapest_index;
            return (
              <Card key={`${o.key}-${terms ?? 0}-${i}`}>
                <AppText kind="titleS">{key === "defer" ? t.keys.defer(terms ?? 0) : key === "amount" ? t.keys.amount : t.keys[key]}</AppText>
                {best ? <AppText tone="positive" kind="label">{t.cheapest}</AppText> : null}
                <AppText>{t.payNow} <Money value={o.pay_now} /></AppText>
                <AppText>{o.truncated ? t.truncated : t.months(o.months)}</AppText>
                <AppText>{t.interest} <Money value={o.total_interest} /></AppText>
                <AppText>{t.cost} <Money value={o.total_cost} /></AppText>
                {!best && o.extra_cost !== "0" ? <AppText tone="secondary" kind="caption">{t.extra(formatCop(o.extra_cost))}</AppText> : null}
                {o.notes.map((n) => (
                  <AppText key={n} kind="caption" tone="secondary">{t.notes[n as keyof typeof t.notes] ?? n}</AppText>
                ))}
              </Card>
            );
          })}
          {d.warnings.some((w) => w.code === "rate_above_usury") ? <Notice>{t.usury}</Notice> : null}
          <AppText kind="caption" tone="secondary">{t.assumptions}</AppText>
        </View>
      ) : null}
    </View>
  );
}

function LoanSim({ id }: { id: string }) {
  const [extra, setExtra] = useState("");
  const sim = useRun<S["LoanPaySim"]>(`/loans/${encodeURIComponent(id)}/simulators/payment-strategy`);
  const body = loanBody(extra);
  const d = sim.data;
  return (
    <View style={{ gap: space[12] }}>
      <Field label={t.extraLabel} value={extra} onChangeText={setExtra} keyboardType="decimal-pad" error={body === null ? t.invalidAmount : null} />
      <AppText kind="caption" tone="secondary">{t.extraHint}</AppText>
      <Button label={t.simulate} busy={sim.busy} disabled={body === null} onPress={() => body && void sim.run(body)} />
      {sim.error ? <Notice>{sim.error}</Notice> : null}
      {d ? (
        <View style={{ gap: space[12] }} accessibilityLiveRegion="polite">
          <Card>
            <AppText>{t.loanSummary(d.installments_left)} <Money value={d.balance} /></AppText>
            <AppText>{t.nextPayment} <Money value={d.next_payment} /></AppText>
          </Card>
          {d.strategies.map((o) => (
            <Card key={o.key}>
              <AppText kind="titleS">{t.loanKeys[o.key]}</AppText>
              {o.cheapest && d.strategies.length > 1 ? <AppText tone="positive" kind="label">{t.cheapest}</AppText> : null}
              {o.extra_now !== "0" ? <AppText>{t.extraNow} <Money value={o.extra_now} /></AppText> : null}
              <AppText>{t.installmentsLeft(o.installments)}</AppText>
              <AppText>{t.nextInstallment} <Money value={o.first_payment} /></AppText>
              <AppText>{t.interest} <Money value={o.total_interest} /></AppText>
              {o.key !== "installment" ? <AppText>{t.saved} <Money value={o.saved} /></AppText> : null}
            </Card>
          ))}
          <AppText kind="caption" tone="secondary">{t.loanAssumptions}</AppText>
        </View>
      ) : null}
    </View>
  );
}
