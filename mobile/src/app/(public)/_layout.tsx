import { Redirect, Stack } from "expo-router";
import { allows, destinationFor } from "@/auth/routes";
import { usePhase } from "@/auth/use-session";

export default function PublicLayout() {
  const phase = usePhase();
  const destination = destinationFor(phase);
  if (!allows(phase, "public") && !allows(phase, "otp")) return destination ? <Redirect href={destination} /> : null;
  return <Stack screenOptions={{ headerShown: false }} />;
}
