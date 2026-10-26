# Native ESM consumer

From the repository root, run `npm run sdk:pack`. In this directory run:

```sh
npm install --ignore-scripts ../../artifacts/sdk-tarballs/*.tgz
npm run serve
```

Open http://localhost:8080. This uses installed packages and an import map; no bundler, source alias, extension host, or development-server transforms are involved. Select a local audio file and press Play / pause. The host owns the playback connection; the SDK adds its own analysis branch. Dispose views tears down the analysis branch without disconnecting playback.

For a single view install only its package, core, its declared DSP dependencies, and the optional theme. A normal registry install resolves dependencies automatically; local tarball consumption needs the dependency tarballs supplied together. Bundlers resolve the package exports directly and do not need the import map.

SDK checks from the repository root:

- `npm run sdk:check`: builds, packs, installs all tarballs in a temporary consumer, checks DOM-free ESM imports and strict TypeScript declarations.
- `npm run sdk:check:consumers`: builds a real minimum meter consumer with Vite 6.4.3 and Webpack 5.90.3, recording output sizes under `artifacts/sdk/consumer-builds.json`. It installs Vite in a temporary directory and uses the repository Webpack tooling; SDK imports resolve only from installed tarballs.
- Browser and audio-graph acceptance live in `bench/sdkAcceptance.mjs` and `bench/sdkAudioAcceptance.mjs`; they require Playwright and a browser. Use `EAR_PLAYWRIGHT_MODULE` for an existing external Playwright installation.

For module selection, PCM input, shared-source ownership and troubleshooting, see the [SDK integration guide](../../packages/README.md).
