import { SafeAreaView } from "react-native-safe-area-context";
import { View } from "react-native";
import { NotificationCenter } from "@/features/notifications/center";
import { es } from "@/i18n/es";
import { useTheme } from "@/theme/use-theme";
import { Title } from "@/ui/primitives";

export default function Notifications() {
  const c = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <Title>{es.notif.title}</Title>
      </View>
      <NotificationCenter />
    </SafeAreaView>
  );
}
