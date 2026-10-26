# @ear-audio/phase-correlation

Standalone EAR audio visualization SDK, ESM with TypeScript declarations. MIT licensed. No VS Code host or player is required.

```sh
npm install @ear-audio/phase-correlation @ear-audio/theme
```

```js
import { createPcmSource } from "@ear-audio/core";
import { createPhaseCorrelation } from "@ear-audio/phase-correlation";
import "@ear-audio/theme/styles.css";
const source = createPcmSource({ sampleRate: 48000 });
const view = createPhaseCorrelation(document.querySelector("#visualization"), {
  source,
});
source.push({ left: new Float32Array(2048), right: new Float32Array(2048) });
// When no longer needed:
view.dispose();
source.dispose();
```

The host owns audio playback. This view only reads an analysis source. `setOptions`, `resize`, `reset`, `suspend`, `resume`, and idempotent `dispose` are available on the returned view. Mount in an element with a definite width and height.

See the repository native ESM example for installed-tarball consumption and browser import maps. Packages are experimental version 0.1.0.
