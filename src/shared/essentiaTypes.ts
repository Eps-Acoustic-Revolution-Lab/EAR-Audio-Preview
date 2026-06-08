/* eslint-disable @typescript-eslint/naming-convention */
/** Minimal Essentia.js surface used for sequence feature extraction. */
export type EssentiaInstance = {
  arrayToVector(arr: Float32Array): unknown;
  vectorToArray(vec: unknown): Float32Array;
  Windowing(
    frame: unknown,
    normalized?: boolean,
    size?: number,
    type?: string,
    zeroPadding?: number,
    zeroPhase?: boolean,
  ): { frame: unknown };
  Spectrum(frame: unknown, size?: number): { spectrum: unknown };
  PitchYinFFT(
    spectrum: unknown,
    frameSize?: number,
    interpolate?: boolean,
    maxFrequency?: number,
    minFrequency?: number,
    sampleRate?: number,
    tolerance?: number,
  ): { pitch: number; pitchConfidence: number };
  Flux(
    spectrum: unknown,
    halfRectify?: boolean,
    norm?: string,
  ): { flux: number };
  delete(): void;
  shutdown(): void;
};
/* eslint-enable @typescript-eslint/naming-convention */
