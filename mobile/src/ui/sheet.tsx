import { type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { es } from "@/i18n/es";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";
import { AppText, Button } from "./primitives";

/** Hoja inferior. Se cierra con «Cerrar», tocando fuera o con el botón atrás de Android. */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const c = useTheme();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel={es.common.close} accessibilityRole="button" style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.border }]}>
        <AppText kind="titleM" accessibilityRole="header">
          {title}
        </AppText>
        <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
        <Button label={es.common.close} kind="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { maxHeight: "85%", padding: space[16], gap: space[12], borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1 },
  body: { gap: space[8], paddingBottom: space[8] },
});
