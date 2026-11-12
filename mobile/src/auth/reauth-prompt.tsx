import { useEffect, useState } from "react";
import { Modal, View } from "react-native";
import { es } from "@/i18n/es";
import { AppText, Button, Field, Notice, Screen, Title } from "@/ui/primitives";
import { reauth } from "./runtime";
import { useAllauth, useReauthOpen } from "./use-session";
import type { ReauthOutcome } from "./allauth";

/**
 * El aviso de reautenticación. Contraseña o código TOTP/de recuperación; lo escrito vive solo en este componente y se borra al
 * cerrar. Confirmar resuelve la petición que lo abrió (que se repite sola); cancelar la deja fallar.
 */
export function ReauthPrompt() {
  const open = useReauthOpen();
  return (
    <Modal visible={open} animationType="fade" onRequestClose={() => reauth.settle(false)} statusBarTranslucent>
      {open ? <Form /> : null}
    </Modal>
  );
}

function Form() {
  const allauth = useAllauth();
  const t = es.reauth;
  const [mode, setMode] = useState<"password" | "code">("password");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ReauthOutcome | null>(null);

  useEffect(() => () => setValue(""), []);

  async function submit() {
    if (!value.trim() || busy) return;
    setBusy(true);
    const outcome = await (mode === "password" ? allauth.reauthenticateWithPassword(value) : allauth.reauthenticateWithCode(value.trim()));
    setBusy(false);
    if (outcome === "ok") {
      setValue("");
      reauth.settle(true);
    } else {
      setProblem(outcome);
    }
  }

  const message = problem === null ? null : problem === "too_many" ? t.too_many : problem === "network" ? es.common.network : problem === "wrong" ? t.wrong : es.common.generic;

  return (
    <Screen>
      <Title>{t.title}</Title>
      <AppText tone="secondary">{t.intro}</AppText>
      <Field
        key={mode}
        label={mode === "password" ? t.password : t.code}
        value={value}
        onChangeText={setValue}
        secureTextEntry={mode === "password"}
        keyboardType={mode === "code" ? "number-pad" : "default"}
        autoComplete="off"
        importantForAutofill="no"
        textContentType={mode === "password" ? "password" : "none"}
        onSubmitEditing={() => void submit()}
        autoFocus
      />
      {message ? <Notice>{message}</Notice> : null}
      <View style={{ gap: 8 }}>
        <Button label={t.submit} busy={busy} onPress={() => void submit()} />
        <Button
          label={mode === "password" ? t.useCode : t.usePassword}
          kind="secondary"
          onPress={() => {
            setMode(mode === "password" ? "code" : "password");
            setValue("");
            setProblem(null);
          }}
        />
        <Button label={es.common.cancel} kind="ghost" onPress={() => reauth.settle(false)} />
      </View>
    </Screen>
  );
}
