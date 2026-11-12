import { SafeAreaView } from "react-native-safe-area-context";
import { View } from "react-native";
import { MovementsList } from "@/features/movements/list";
import { ScopeSwitcher } from "@/features/scope/switcher";
import { es } from "@/i18n/es";
import { useTheme } from "@/theme/use-theme";
import { Title } from "@/ui/primitives";

export default function Movements() {
  const c = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 8 }}>
        <Title>{es.movements.title}</Title>
        <ScopeSwitcher />
      </View>
      <MovementsList />
    </SafeAreaView>
  );
}
