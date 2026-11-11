import { headers } from "next/headers";
import { THEME_INIT_SCRIPT } from "./storage";

export async function ThemeScript() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
