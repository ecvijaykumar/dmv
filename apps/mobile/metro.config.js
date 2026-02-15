const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.watchFolders = [projectRoot];

const defaults = config.resolver.sourceExts || [];
config.resolver.sourceExts = Array.from(new Set([...defaults, "cjs"]));

config.resolver.blockList = [
  /.*\/\.git\/.*/,
  /.*\/aclImdb\/.*/,
  /.*\/cpp\/.*/,
  /.*\/python\/.*/,
  /.*\/ios\/.*/,
  /.*\/web\/.*/
];

module.exports = config;
