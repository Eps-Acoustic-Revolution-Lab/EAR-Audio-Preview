# @ear-audio/theme

Standalone EAR audio visualization SDK, ESM with TypeScript declarations. MIT licensed. No VS Code host or player is required.

Import `@ear-audio/theme/styles.css` with your bundler or link its public CSS URL in native ESM applications. Tokens and component rules are scoped below `.ear-sdk`; there is no global VS Code reset. Override custom properties on `.ear-sdk` for your palette. `themeClassName` is also exported for integrations.

See the repository native ESM example for installed-tarball consumption and browser import maps. Packages are experimental version 0.1.0.

完整接入、生命周期和排错说明见仓库 [SDK 接入指南](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/packages/README.md)。当前使用本地 tarball 安装，尚未发布到 npm registry。
