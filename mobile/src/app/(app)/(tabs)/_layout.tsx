import { Pressable, StyleSheet, Text } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { paths } from "@/features/common/paths";
import { useResource } from "@/features/common/use-resource";
import type { NotificationList } from "@/features/notifications/logic";
import { startQuickAdd } from "@/features/quick-add/store";
import { es } from "@/i18n/es";
import { type } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

/** Barra inferior de 5 posiciones (diseño §1.2): Resumen, Movimientos, «+», Avisos, Más. */
export default function TabsLayout() {
  const c = useTheme();
  const router = useRouter();
  const unread = useResource<NotificationList>(paths.notifications(true)).data?.unread ?? 0;
  const t = es.tabs;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textSecondary,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarLabelStyle: type.caption,
        tabBarIcon: () => null,
        tabBarIconStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t.summary, tabBarAccessibilityLabel: t.summary }} />
      <Tabs.Screen name="movements" options={{ title: t.movements, tabBarAccessibilityLabel: t.movements }} />
      <Tabs.Screen
        name="add"
        options={{
          title: "+",
          tabBarAccessibilityLabel: t.add,
          tabBarButton: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.add}
              onPress={() => {
                startQuickAdd();
                router.push("/quick-add");
              }}
              style={[styles.add, { backgroundColor: c.primary }]}
            >
              <Text style={[type.titleL, { color: c.onPrimary }]}>+</Text>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen name="notifications" options={{ title: t.notifications, tabBarAccessibilityLabel: unread > 0 ? `${t.notifications}, ${unread} sin leer` : t.notifications, tabBarBadge: unread > 0 ? (unread > 9 ? "9+" : unread) : undefined }} />
      <Tabs.Screen name="more" options={{ title: t.more, tabBarAccessibilityLabel: t.more }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  add: { width: 52, height: 52, borderRadius: 26, alignSelf: "center", alignItems: "center", justifyContent: "center" },
});
