import { Redirect, Stack } from "expo-router";
import { allows, destinationFor } from "@/auth/routes";
import { usePhase } from "@/auth/use-session";

export default function AppLayout() {
  const phase = usePhase();
  const destination = destinationFor(phase);
  if (!allows(phase, "app")) return destination ? <Redirect href={destination} /> : null;
  return <Stack screenOptions={{ headerShown: false }} />;
}
