// Metro necesita ver `../core` (dinero, fechas y cliente compartidos con la web). `core/` no tiene dependencias propias.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../core")];
// `core/` queda fuera de esta carpeta: sus importaciones (helpers de Babel) se resuelven en los node_modules de la app, no en los de la web.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
module.exports = config;
