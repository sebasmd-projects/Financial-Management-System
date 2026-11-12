// eslint-disable-next-line @typescript-eslint/no-require-imports
const { patchBuildGradle } = require("./release-signing") as { patchBuildGradle: (source: string) => string };

const template = `apply plugin: "com.android.application"

android {
    namespace 'com.sebasmoralesd.finanzas'
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }
}
`;

describe("plugin de firma de release", () => {
  const patched = patchBuildGradle(template);
  it("el release usa la llave propia y la de depuración queda solo para debug", () => {
    const release = /release \{\s+\/\/ Caution[\s\S]*?minifyEnabled/.exec(patched)?.[0] ?? "";
    expect(release).toContain("signingConfig signingConfigs.release");
    expect(release).not.toContain("signingConfigs.debug");
    expect(patched).toContain("debug {\n            signingConfig signingConfigs.debug");
  });
  it("lee mobile/keystore.properties y se niega a construir un release sin él", () => {
    expect(patched).toContain('new File(rootProject.projectDir.parentFile, "keystore.properties")');
    expect(patched).toContain("throw new GradleException");
  });
  it("es idempotente", () => {
    expect(patchBuildGradle(patched)).toBe(patched);
  });
  it("si no reconoce la plantilla, falla en vez de dejar la llave de depuración", () => {
    expect(() => patchBuildGradle("android {\n  buildTypes { release { } }\n}")).toThrow(/no reconozco/);
  });
});
