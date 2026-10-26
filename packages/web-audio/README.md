# @ear-audio/web-audio

Standalone EAR audio visualization SDK, ESM with TypeScript declarations. MIT licensed. No VS Code host or player is required.

`createAudioSource({ context, node, fftSize?, channelCount? })` attaches an analysis branch to a host-owned Web Audio graph. Connect the playback route yourself. Disposing the source removes its branch while preserving other connections. AudioContext and OfflineAudioContext are supported.

See the repository native ESM example for installed-tarball consumption and browser import maps. Packages are experimental version 0.1.0.

完整接入、生命周期和排错说明见仓库 [SDK 接入指南](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/packages/README.md)。当前使用本地 tarball 安装，尚未发布到 npm registry。
