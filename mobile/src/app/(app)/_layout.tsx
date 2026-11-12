import { Redirect, Stack } from "expo-router";
import { usePushWhenReady } from "@/auth/use-push";
import { allows, destinationFor } from "@/auth/routes";
import { usePhase } from "@/auth/use-session";
import { useLoadHouseholds } from "@/features/scope/switcher";

export default function AppLayout() {
  const phase = usePhase();
  const destination = destinationFor(phase);
  usePushWhenReady();
  useLoadHouseholds();
  if (!allows(phase, "app")) return destination ? <Redirect href={destination} /> : null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="quick-add" options={{ presentation: "modal" }} />
    </Stack>
  );
}
