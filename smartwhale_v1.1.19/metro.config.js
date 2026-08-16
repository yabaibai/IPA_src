const { getDefaultConfig } = require('expo/metro-config');
const { withDevkit } = require('miaoda-expo-devkit/metro');

const config = getDefaultConfig(__dirname);

config.resolver = config.resolver ?? {};
config.resolver.unstable_enableSymlinks = false;

config.resolver.assetExts = [
  ...(config.resolver.assetExts || []),
  'zip',
];

// 显式启用 expo asset plugin（确保 require() 的 png/webp 在 dev Metro 下正确解析）
config.transformer = config.transformer ?? {};
config.transformer.assetPlugins = [
  'expo-asset/tools/hashAssetFiles',
];

module.exports = withDevkit(config);
