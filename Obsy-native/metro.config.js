// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow `require('../../assets/board/index.html')` — the pre-built tldraw board
// bundle is shipped as a bundled asset and loaded by the Topic Board WebView.
config.resolver.assetExts.push('html');

// The `board-web/` sub-project is a standalone Vite app with its own
// node_modules (duplicate React, etc.). Keep Metro from crawling it to avoid
// haste module-name collisions. Use a plain RegExp (not metro-config's internal
// exclusionList helper, which isn't exposed via package "exports").
const boardWeb = /[\\/]board-web[\\/].*/;
const existing = config.resolver.blockList;
config.resolver.blockList = existing
    ? Array.isArray(existing)
        ? [...existing, boardWeb]
        : [existing, boardWeb]
    : boardWeb;

module.exports = config;
