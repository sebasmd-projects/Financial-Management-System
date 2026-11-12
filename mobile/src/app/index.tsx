import { Redirect } from "expo-router";
import { destinationFor } from "@/auth/routes";
import { usePhase } from "@/auth/use-session";

/** `/`: a donde toque según la sesión. La pantalla principal está en `(app)/home`; esta ruta solo redirige. */
export default function Index() {
  const destination = destinationFor(usePhase());
  return destination ? <Redirect href={destination} /> : null;
}
