/** Minimal analyser contract shared by browser audio and pushed PCM. */
export interface AnalysisAnalyser {
  readonly fftSize: number;
  readonly frequencyBinCount: number;
  readonly context: { readonly sampleRate: number };
  getFloatTimeDomainData(destination: Float32Array): void;
  getFloatFrequencyData(destination: Float32Array): void;
}
export interface AnalysisSource extends EventTarget {
  readonly sampleRate: number;
  readonly isPlaying: boolean;
  getAnalysers(): { left: AnalysisAnalyser; right: AnalysisAnalyser } | null;
  setFftSize(size: number): void;
  acquireFftSize(size: number): () => void;
  suspend(): void;
  resume(): void;
  dispose(): void;
}
export interface PcmFrame {
  left: Float32Array;
  right?: Float32Array;
}
export interface PcmSource extends AnalysisSource {
  push(frame: PcmFrame): void;
}
export function validateFftSize(size: number): void {
  if (
    !Number.isInteger(size) ||
    size < 32 ||
    size > 32768 ||
    (size & (size - 1)) !== 0
  ) {
    throw new RangeError("fftSize must be a power of two between 32 and 32768");
  }
}
export function validateSampleRate(sampleRate: number): void {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError("sampleRate must be finite and positive");
  }
}
interface FftTables {
  window: Float64Array;
  cosine: Float64Array;
  sine: Float64Array;
}
// Input validation limits this cache to 11 sizes, under 1.6 MiB in total.
const fftTables = new Map<number, FftTables>();
function tablesForSize(size: number): FftTables {
  let table = fftTables.get(size);
  if (!table) {
    const window = new Float64Array(size);
    const cosine = new Float64Array(size);
    const sine = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      const phase = (2 * Math.PI * i) / size;
      window[i] = 0.42 - 0.5 * Math.cos(phase) + 0.08 * Math.cos(2 * phase);
    }
    for (let span = 2; span <= size; span *= 2) {
      for (let j = 0; j < span / 2; j++) {
        const phase = (-2 * Math.PI * j) / span;
        const index = span / 2 - 1 + j;
        cosine[index] = Math.cos(phase);
        sine[index] = Math.sin(phase);
      }
    }
    table = { window, cosine, sine };
    fftTables.set(size, table);
  }
  return table;
}
/** Blackman-windowed FFT with Web Audio AnalyserNode normalization (1/N). */
function spectrum(samples: Float32Array): Float32Array {
  const size = samples.length;
  const table = tablesForSize(size);
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    real[i] = samples[i] * table.window[i];
  }
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      const value = real[i];
      real[i] = real[j];
      real[j] = value;
    }
  }
  for (let span = 2; span <= size; span *= 2) {
    for (let start = 0; start < size; start += span) {
      for (let j = 0; j < span / 2; j++) {
        const index = span / 2 - 1 + j;
        const a = start + j;
        const b = a + span / 2;
        const re =
          real[b] * table.cosine[index] - imaginary[b] * table.sine[index];
        const im =
          real[b] * table.sine[index] + imaginary[b] * table.cosine[index];
        real[b] = real[a] - re;
        imaginary[b] = imaginary[a] - im;
        real[a] += re;
        imaginary[a] += im;
      }
    }
  }
  return Float32Array.from(
    { length: size / 2 },
    (_, i) => 20 * Math.log10(Math.hypot(real[i], imaginary[i]) / size),
  );
}
/** PCM is copied on push. Each consumer reads the same latest complete window. */
export function createPcmSource(options: {
  sampleRate: number;
  fftSize?: number;
}): PcmSource {
  validateSampleRate(options.sampleRate);
  let size = options.fftSize ?? 2048;
  validateFftSize(size);
  let samples = [new Float32Array(size), new Float32Array(size)];
  let spectra: Float32Array[] = [];
  let active = true;
  let disposed = false;
  const source = new EventTarget() as PcmSource;
  const assertAlive = () => {
    if (disposed) {
      throw new Error("Source is disposed");
    }
  };
  const analysers = samples.map(
    (_, channel): AnalysisAnalyser => ({
      get fftSize() {
        return size;
      },
      get frequencyBinCount() {
        return size / 2;
      },
      context: { sampleRate: options.sampleRate },
      getFloatTimeDomainData(destination) {
        assertAlive();
        destination.set(samples[channel].subarray(0, destination.length));
      },
      getFloatFrequencyData(destination) {
        assertAlive();
        if (!spectra[channel]) {
          spectra[channel] = spectrum(samples[channel]);
        }
        destination.set(spectra[channel].subarray(0, destination.length));
      },
    }),
  );
  Object.defineProperties(source, {
    sampleRate: { value: options.sampleRate },
    isPlaying: { get: () => active && !disposed },
  });
  source.getAnalysers = () =>
    disposed ? null : { left: analysers[0], right: analysers[1] };
  source.push = ({ left, right = left }) => {
    assertAlive();
    if (
      !(left instanceof Float32Array) ||
      !(right instanceof Float32Array) ||
      left.length !== right.length ||
      !left.every(Number.isFinite) ||
      !right.every(Number.isFinite)
    ) {
      throw new TypeError(
        "PCM channels must be finite Float32Arrays of equal length",
      );
    }
    if (!active) {
      return;
    }
    [left, right].forEach((input, channel) => {
      const count = Math.min(size, input.length);
      samples[channel].copyWithin(0, count);
      samples[channel].set(input.subarray(input.length - count), size - count);
    });
    spectra = [];
    source.dispatchEvent(new Event("frame"));
  };
  source.setFftSize = (next) => {
    assertAlive();
    validateFftSize(next);
    if (next === size) {
      return;
    }
    samples = samples.map((old) => {
      const nextSamples = new Float32Array(next);
      const count = Math.min(next, old.length);
      nextSamples.set(old.subarray(old.length - count), next - count);
      return nextSamples;
    });
    size = next;
    spectra = [];
  };
  const setActive = (next: boolean) => {
    if (disposed || active === next) {
      return;
    }
    active = next;
    source.dispatchEvent(new Event("update-is-playing"));
  };
  source.suspend = () => setActive(false);
  source.resume = () => setActive(true);
  source.dispose = () => {
    if (disposed) {
      return;
    }
    setActive(false);
    disposed = true;
    samples = [];
    spectra = [];
  };
  installFftSizeLeases(source, size);
  return source;
}

/** Consumer leases prevent a smaller view from lowering another view's FFT size. */
export function installFftSizeLeases(
  source: AnalysisSource,
  initialSize: number,
): void {
  const apply = source.setFftSize.bind(source);
  let baseSize = initialSize;
  const requests = new Map<object, number>();
  const update = () => apply(Math.max(baseSize, ...requests.values()));
  source.setFftSize = (size) => {
    validateFftSize(size);
    baseSize = size;
    update();
  };
  source.acquireFftSize = (size) => {
    validateFftSize(size);
    const token = {};
    requests.set(token, size);
    update();
    return () => {
      if (requests.delete(token) && source.getAnalysers()) {
        update();
      }
    };
  };
}
