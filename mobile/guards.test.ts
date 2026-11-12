import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import config from "./app.config";

// Redes de seguridad sobre el TEXTO de la app (AGENTS.md: seguridad primero). ESLint dice lo mismo (`eslint.config.mjs`), pero un
// `// eslint-disable` lo apaga y esta prueba no: si alguien lo hace, falla aquí.
const ROOT = __dirname;
const SRC = join(ROOT, "src");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));
}
const rel = (path: string) => relative(ROOT, path).split("\\").join("/");
const isTest = (path: string) => /\.test\.(ts|tsx)$/.test(path);
const code = [...walk(SRC), join(ROOT, "app.config.ts")].filter((path) => /\.(ts|tsx)$/.test(path) && !isTest(path));
/** Sin comentarios. */
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
const read = (path: string) => strip(readFileSync(path, "utf8"));
const offenders = (test: (source: string, path: string) => boolean) => code.filter((path) => test(read(path), rel(path))).map(rel);
const importsOf = (source: string) => [...source.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g)].map((match) => match[1]);

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string>; workspaces?: unknown };

describe("nada financiero en disco", () => {
  it("ni AsyncStorage, MMKV, SQLite, archivos, portapapeles ni compartir: ni importados ni como dependencia directa", () => {
    const forbidden = /^(@react-native-async-storage\/|react-native-mmkv|expo-sqlite|expo-file-system|expo-sharing|expo-media-library|expo-document-picker|expo-image-picker|react-native-fs|realm|@op-engineering\/|react-native-sqlite|@react-native-clipboard|expo-clipboard)/;
    expect(offenders((source) => importsOf(source).some((name) => forbidden.test(name)))).toEqual([]);
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((name) => forbidden.test(name))).toEqual([]);
  });
  it("ni localStorage, sessionStorage, IndexedDB ni cookies", () => {
    expect(offenders((source) => /\b(localStorage|sessionStorage|indexedDB|AsyncStorage|document\.cookie)\b/.test(source))).toEqual([]);
  });
  it("el llavero solo lo toca token-store.ts y solo guarda el token", () => {
    expect(offenders((source, path) => path !== "src/auth/token-store.ts" && importsOf(source).includes("expo-secure-store"))).toEqual([]);
    const store = read(join(SRC, "auth/token-store.ts"));
    expect([...store.matchAll(/setItemAsync\(([^,]+),/g)].map((match) => match[1])).toEqual(["KEY"]);
    expect(store).toMatch(/WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
  });
  it("la biometría solo la toca biometric.ts y la captura de pantalla solo privacy-shield.tsx", () => {
    expect(offenders((source, path) => path !== "src/lock/biometric.ts" && importsOf(source).includes("expo-local-authentication"))).toEqual([]);
    expect(offenders((source, path) => path !== "src/lock/privacy-shield.tsx" && importsOf(source).includes("expo-screen-capture"))).toEqual([]);
    expect(read(join(SRC, "lock/privacy-shield.tsx"))).toMatch(/usePreventScreenCapture/);
  });
});

describe("nada de consola, analítica ni reportes de fallos", () => {
  it("nada en consola", () => {
    expect(offenders((source) => /\bconsole\s*\./.test(source))).toEqual([]);
  });
  it("ninguna dependencia de telemetría ni actualizaciones por aire", () => {
    const telemetry = /analytics|sentry|bugsnag|datadog|mixpanel|amplitude|posthog|segment|crashlytics|firebase|expo-updates|code-push|tracking-transparency/i;
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((name) => telemetry.test(name))).toEqual([]);
    expect(offenders((source) => importsOf(source).some((name) => telemetry.test(name)))).toEqual([]);
  });
  it("el código no carga nada de otro origen (solo el del sitio, de la configuración)", () => {
    expect(offenders((source) => /https?:\/\/(?!sebasmoralesd\.com|10\.0\.2\.2|localhost)/.test(source))).toEqual([]);
  });
});

describe("el dinero no pasa por Number", () => {
  it("ni parseFloat, Number(), toFixed, toLocaleString, NumberFormat ni parseInt", () => {
    expect(offenders((source) => /\bparseFloat\b|\bNumber\s*\(|\.toFixed\s*\(|\.toLocaleString\s*\(|\bNumberFormat\b|\bparseInt\b/.test(source))).toEqual([]);
  });
});

describe("rutas sin datos", () => {
  it("ni parámetros de ruta ni de búsqueda: los destinos son literales sin consulta", () => {
    expect(offenders((source) => /useLocalSearchParams|useGlobalSearchParams|useSearchParams|\bparams\s*:/.test(source))).toEqual([]);
    expect(offenders((source) => /(?:router\.(?:push|replace|navigate)\(|href=)\s*[{`]?\s*[`"'][^`"']*(?:\?|\$\{)/.test(source))).toEqual([]);
  });
  it("las peticiones salen todas por el cliente compartido (api/http.ts); nadie llama a fetch por su cuenta", () => {
    expect(offenders((source, path) => path !== "src/api/http.ts" && /\bfetch\s*\(/.test(source))).toEqual([]);
    const http = read(join(SRC, "api/http.ts"));
    expect(http).toMatch(/credentials:\s*"omit"/);
  });
  it("la clave de idempotencia sale de expo-crypto y no de Math.random ni de crypto.randomUUID", () => {
    expect(offenders((source) => /Math\.random|crypto\.randomUUID/.test(source))).toEqual([]);
    expect(read(join(SRC, "api/ids.ts"))).toMatch(/from "expo-crypto"/);
  });
});

describe("dependencias y configuración", () => {
  it("versiones exactas (sin ^ ni ~), sin workspaces y sin aplicaciones en la raíz del proyecto", () => {
    const entries = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(entries.filter(([, version]) => !/^\d+\.\d+\.\d+$/.test(version))).toEqual([]);
    expect(pkg.workspaces).toBeUndefined();
    const root = JSON.parse(readFileSync(join(ROOT, "../package.json"), "utf8")) as { workspaces?: unknown };
    expect(root.workspaces).toBeUndefined();
  });
  it("Android: paquete, sin copias de seguridad, sin actualizaciones por aire y permisos mínimos", () => {
    const expo = config;
    expect(expo.android?.package).toBe("com.sebasmoralesd.finanzas");
    expect(expo.android?.allowBackup).toBe(false);
    expect(expo.updates).toEqual({ enabled: false });
    expect(expo.android?.permissions).toEqual(["android.permission.USE_BIOMETRIC"]);
    expect(expo.android?.blockedPermissions).toEqual(expect.arrayContaining(["android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE", "android.permission.SYSTEM_ALERT_WINDOW"]));
    expect(JSON.stringify(expo.plugins)).toContain('"usesCleartextTraffic":false');
  });
});
