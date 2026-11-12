// Plugin de configuración: firma el APK de release con TU llave (mobile/keystore.properties), nunca con la de depuración que
// `expo prebuild` deja por defecto. Si el texto de build.gradle cambia en otra versión de Expo y no se reconoce, FALLA: es mejor
// que el prebuild se rompa a que un APK salga firmado con la llave de depuración (que cualquiera tiene).
const { withAppBuildGradle } = require("expo/config-plugins");

const PROPS = `// --- Firma de release (plugins/release-signing.js): mobile/keystore.properties, fuera de git ---
def keystorePropertiesFile = new File(rootProject.projectDir.parentFile, "keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.withInputStream { keystoreProperties.load(it) }
}
`;

const RELEASE_CONFIG = `        release {
            if (keystorePropertiesFile.exists()) {
                def configured = new File(keystoreProperties['storeFile'])
                storeFile configured.isAbsolute() ? configured : new File(keystorePropertiesFile.parentFile, configured.path)
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
`;

const GUARD = `
// Un APK de release sin tu llave no se construye (en vez de salir firmado con otra).
gradle.taskGraph.whenReady { graph ->
    def releaseTask = graph.allTasks.any { it.path.startsWith(":app:") && it.name.toLowerCase().contains("release") && (it.name.startsWith("assemble") || it.name.startsWith("bundle") || it.name.startsWith("package")) }
    if (releaseTask && !keystorePropertiesFile.exists()) {
        throw new GradleException("Falta mobile/keystore.properties: sin tu llave no se firma el APK de release (mobile/README.md, «Compilar el APK»).")
    }
}
`;

/** Devuelve el build.gradle con la firma de release puesta; lanza si no reconoce la plantilla. Idempotente. */
function patchBuildGradle(contents) {
  if (contents.includes("plugins/release-signing.js")) return contents;
  const anchorAndroid = /^android \{/m;
  const anchorSigning = /signingConfigs \{\n(\s+)debug \{/;
  const anchorRelease = /(release \{[^}]*?)signingConfig signingConfigs\.debug/;
  if (!anchorAndroid.test(contents) || !anchorSigning.test(contents) || !anchorRelease.test(contents)) {
    throw new Error("release-signing: no reconozco android/app/build.gradle de esta versión de Expo; revisa plugins/release-signing.js");
  }
  let out = contents.replace(anchorAndroid, `${PROPS}\nandroid {`);
  out = out.replace(anchorSigning, (match) => `signingConfigs {\n${RELEASE_CONFIG}        debug {`);
  out = out.replace(anchorRelease, "$1signingConfig signingConfigs.release");
  return out + GUARD;
}

module.exports = (config) => withAppBuildGradle(config, (mod) => {
  mod.modResults.contents = patchBuildGradle(mod.modResults.contents);
  return mod;
});
module.exports.patchBuildGradle = patchBuildGradle;
