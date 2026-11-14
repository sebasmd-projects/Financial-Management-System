import { StyleSheet, View } from "react-native";
import { type Provider } from "@core/sync";
import { es } from "@/i18n/es";
import { space } from "@/theme/tokens";
import { AppText, Card, Notice } from "@/ui/primitives";
import { fill } from "./logic";

const w = es.sync.wizard;

/**
 * La dirección de reenvío, tal como la devuelve crear o rotar: se muestra UNA vez y solo en memoria. La app no tiene portapapeles (nada
 * financiero en disco ni en otras apps): la dirección es texto seleccionable, con una pulsación larga el sistema ofrece copiarla.
 */
export function AddressBlock({ address }: { address: string }) {
  return (
    <Card>
      <AppText kind="titleS" accessibilityRole="header">
        {w.step2}
      </AppText>
      <Notice tone="secondary">{w.addressOnce}</Notice>
      <AppText kind="label" tone="secondary">
        {w.addressLabel}
      </AppText>
      <AppText selectable style={styles.address}>
        {address}
      </AppText>
      <AppText kind="caption" tone="secondary">
        {w.addressSecret}
      </AppText>
    </Card>
  );
}

/** El filtro paso a paso para el proveedor, el código de confirmación de Gmail y el monto mínimo de las alertas (plan §3.1). */
export function Guide({ provider, code }: { provider: Provider; code: string | null }) {
  const steps = w.steps[provider] ?? w.steps.other;
  return (
    <View style={styles.group}>
      <AppText kind="titleS" accessibilityRole="header">
        {w.step3}
      </AppText>
      <AppText kind="bodyS" tone="secondary">
        {w.senderTip}
      </AppText>
      {steps.map((step, index) => (
        <AppText key={step}>{`${index + 1}. ${step}`}</AppText>
      ))}
      {provider === "gmail" ? (
        <Card>
          <AppText accessibilityLiveRegion="polite">{code ? fill(w.codeShown, { code }) : w.codeWaiting}</AppText>
        </Card>
      ) : null}
      <AppText kind="titleS" accessibilityRole="header">
        {w.step4}
      </AppText>
      <AppText kind="label">{w.minTitle}</AppText>
      <AppText>{w.minBody}</AppText>
      <AppText kind="label">{w.minWhere}</AppText>
      <AppText>{`• ${w.minBancolombia}`}</AppText>
      <AppText>{`• ${w.minOthers}`}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[8] },
  address: { fontFamily: "monospace", fontSize: 16 },
});
