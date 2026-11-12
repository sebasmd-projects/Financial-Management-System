// Tras `expo prebuild`: el release NO puede quedar firmado con la llave de depuración. Lo ejecuta CI y se puede correr a mano.
import { readFileSync } from "node:fs";

const gradle = readFileSync(new URL("../android/app/build.gradle", import.meta.url), "utf8");
const release = /buildTypes \{[\s\S]*?\n        release \{([\s\S]*?)\n        \}/.exec(gradle)?.[1];
const manifest = readFileSync(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
const problems = [];
if (!release) problems.push("no encuentro el bloque release de build.gradle");
else if (!/signingConfig signingConfigs\.release/.test(release) || /signingConfig signingConfigs\.debug/.test(release)) problems.push("el release no usa signingConfigs.release");
if (!/applicationId 'com\.sebasmoralesd\.finanzas'/.test(gradle)) problems.push("applicationId inesperado");
if (!/android:allowBackup="false"/.test(manifest)) problems.push("allowBackup no es false");
if (!/android:usesCleartextTraffic="false"/.test(manifest)) problems.push("usesCleartextTraffic no es false");
if (/READ_EXTERNAL_STORAGE"\/>|WRITE_EXTERNAL_STORAGE"\/>|SYSTEM_ALERT_WINDOW"\/>/.test(manifest)) problems.push("permisos de más en el manifiesto");
if (problems.length > 0) {
  process.stderr.write(`prebuild: ${problems.join("; ")}\n`);
  process.exit(1);
}
process.stdout.write("prebuild: firma de release, copia de seguridad y permisos como se esperaba\n");
