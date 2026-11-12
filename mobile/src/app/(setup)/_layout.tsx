import { Redirect, Stack } from "expo-router";
import { allows, destinationFor } from "@/auth/routes";
import { usePhase } from "@/auth/use-session";

export default function SetupLayout() {
  const phase = usePhase();
  const destination = destinationFor(phase);
  if (!allows(phase, "setup")) return destination ? <Redirect href={destination} /> : null;
  return <Stack screenOptions={{ headerShown: false }} />;
}
