const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders.push(path.resolve(__dirname, "../src"));

module.exports = config;
