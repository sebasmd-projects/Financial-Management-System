import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useRouter } from "expo-router";
import { useFms, useSession } from "@/auth/use-session";
import { describeDevice, type Device } from "@/features/devices/logic";
import { es } from "@/i18n/es";
import { AppText, Button, Card, Notice, Screen, Title } from "@/ui/primitives";

/**
 * Teléfonos con la sesión abierta. Cerrar el propio equivale a cerrar sesión; cerrar otro, o «las demás», exige reautenticación
 * reciente (el cliente HTTP abre el aviso y repite la petición sola).
 */
export default function Devices() {
  const fms = useFms();
  const session = useSession();
  const router = useRouter();
  const t = es.devices;
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "negative" | "positive" } | null>(null);
  const [busy, setBusy] = useState(false);

  const [attempt, setAttempt] = useState(0);
  const load = () => setAttempt((n) => n + 1);

  useEffect(() => {
    let alive = true;
    void fms.get<{ devices: Device[] }>("/devices").then((result) => {
      if (!alive) return;
      if (result.ok) setDevices(result.data.devices);
      else setMessage({ text: result.status === 0 ? es.common.network : es.devices.failed, tone: "negative" });
    });
    return () => {
      alive = false;
    };
  }, [fms, attempt]);

  function confirm(title: string, action: () => Promise<void>) {
    Alert.alert(title, undefined, [
      { text: es.common.cancel, style: "cancel" },
      { text: t.yes, style: "destructive", onPress: () => void action() },
    ]);
  }

  async function revoke(device: Device) {
    if (device.current) return void session.logout();
    setBusy(true);
    const result = await fms.delete(`/devices/${device.id}`);
    setBusy(false);
    setMessage(result.ok ? null : { text: t.failed, tone: "negative" });
    load();
  }

  async function revokeOthers() {
    setBusy(true);
    const result = await fms.post<{ revoked: number }>("/devices/revoke-others", {});
    setBusy(false);
    setMessage(result.ok ? { text: t.revoked(result.data.revoked), tone: "positive" } : { text: t.failed, tone: "negative" });
    load();
  }

  const others = (devices ?? []).filter((device) => !device.current);

  return (
    <Screen>
      <Title>{t.title}</Title>
      <AppText tone="secondary">{t.intro}</AppText>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {devices === null && !message ? <AppText>{es.common.loading}</AppText> : null}
      {(devices ?? []).map((device) => {
        const view = describeDevice(device);
        return (
          <Card key={device.id}>
            <AppText kind="titleS">{view.title}</AppText>
            <AppText kind="caption" tone="secondary">
              {view.detail}
            </AppText>
            {device.current ? <AppText kind="label" tone="positive">{t.current}</AppText> : <Button label={t.revoke} kind="secondary" disabled={busy} onPress={() => confirm(t.confirmRevoke, () => revoke(device))} />}
          </Card>
        );
      })}
      {devices !== null && others.length === 0 ? <AppText tone="secondary">{t.none}</AppText> : null}
      <View style={{ gap: 8 }}>
        {others.length > 0 ? <Button label={t.revokeOthers} kind="danger" disabled={busy} onPress={() => confirm(t.confirmRevokeOthers, revokeOthers)} /> : null}
        <Button label={es.common.back} kind="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
