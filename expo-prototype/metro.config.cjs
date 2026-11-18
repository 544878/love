const path = require("node:path");
const { createHash } = require("node:crypto");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const cloudConfig = createHash("sha256").update(process.env.VITE_CLOUD_API_URL ?? "").digest("hex");
config.cacheVersion = `${config.cacheVersion}:${cloudConfig}`;
config.watchFolders.push(path.resolve(__dirname, "../src"));

module.exports = config;
