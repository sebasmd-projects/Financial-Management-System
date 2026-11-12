import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { clearQuickAdd } from "@/features/quick-add/store";
import { QuickAddSheet } from "@/features/quick-add/sheet";
import { es } from "@/i18n/es";
import { useTheme } from "@/theme/use-theme";
import { AppText, Button } from "@/ui/primitives";

/** Hoja «Nuevo movimiento». El borrador viene en memoria (no en la ruta); cerrar sin guardar lo descarta. */
export default function QuickAdd() {
  const c = useTheme();
  const router = useRouter();
  const close = () => {
    clearQuickAdd();
    if (router.canGoBack()) router.back();
    else router.replace("/home");
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8 }}>
        <AppText kind="titleL" accessibilityRole="header">
          {es.quick.title}
        </AppText>
        <Button label={es.common.close} kind="ghost" onPress={close} />
      </View>
      <QuickAddSheet onClose={close} />
    </SafeAreaView>
  );
}
