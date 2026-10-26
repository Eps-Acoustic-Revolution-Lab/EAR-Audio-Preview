# @ear-audio/level-meter

Standalone EAR audio visualization SDK, ESM with TypeScript declarations. MIT licensed. No VS Code host or player is required.

```sh
npm install @ear-audio/level-meter @ear-audio/theme
```

```js
import { createPcmSource } from "@ear-audio/core";
import { createLevelMeter } from "@ear-audio/level-meter";
import "@ear-audio/theme/styles.css";
const source = createPcmSource({ sampleRate: 48000 });
const view = createLevelMeter(document.querySelector("#visualization"), {
  source,
});
source.push({ left: new Float32Array(2048), right: new Float32Array(2048) });
// When no longer needed:
view.dispose();
source.dispose();
```

The host owns audio playback. This view only reads an analysis source. `setOptions`, `resize`, `reset`, `suspend`, `resume`, and idempotent `dispose` are available on the returned view. Mount in an element with a definite width and height.

See the repository native ESM example for installed-tarball consumption and browser import maps. Packages are experimental version 0.1.0.
