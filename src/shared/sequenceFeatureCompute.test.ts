import {
  computeSequenceFeatures,
  profileToWire,
  profileFromWire,
  SequenceFeatureProfile,
} from "./sequenceFeatureCompute";
import type { EssentiaInstance } from "./essentiaTypes";

/**
 * Behavior anchors for the F0 / onset-flux frame loop:
 * frame-center timing, confidence gating (NaN convention), flux convention
 * and the wire round-trip used across the extension-host boundary.
 */

interface PitchScript {
  pitch: number;
  pitchConfidence: number;
}

function makeEssentia(pitchScript: PitchScript[], flux: number) {
  let pitchCall = 0;
  const essentia: EssentiaInstance = {
    arrayToVector: (arr: Float32Array) => arr,
    vectorToArray: (vec: unknown) => vec as Float32Array,
    Windowing: (frame: unknown) => ({ frame }),
    Spectrum: (frame: unknown) => ({ spectrum: frame }),
    PitchYinFFT: () => pitchScript[pitchCall++ % pitchScript.length],
    Flux: () => ({ flux }),
    delete: () => undefined,
    shutdown: () => undefined,
  };
  return essentia;
}

describe("computeSequenceFeatures", () => {
  const sampleRate = 1000;
  const frameSize = 2048; // module-internal constant, anchored here
  const hopSize = 512;
  const hopSec = hopSize / sampleRate;
  // len=3072 → centers 1024, 1536, 2048 → 3 frames
  const data = new Float32Array(3072);

  test("timeSec follows center/sampleRate with frameSize/2 lead-in", async () => {
    const essentia = makeEssentia([{ pitch: 440, pitchConfidence: 0.9 }], 1.5);
    const profile = await computeSequenceFeatures(
      essentia,
      data,
      sampleRate,
      hopSec,
    );
    expect(profile.timeSec.length).toBe(3);
    expect(profile.timeSec[0]).toBeCloseTo(frameSize / 2 / sampleRate, 6);
    expect(profile.timeSec[1]).toBeCloseTo(
      (frameSize / 2 + hopSize) / sampleRate,
      6,
    );
    expect(profile.timeSec[2]).toBeCloseTo(
      (frameSize / 2 + 2 * hopSize) / sampleRate,
      6,
    );
    expect(profile.sampleRate).toBe(sampleRate);
    expect(profile.hopSec).toBe(hopSec);
  });

  test("f0 gating: confidence < 0.5 or pitch <= 0 yields NaN, confidence kept raw", async () => {
    const essentia = makeEssentia(
      [
        { pitch: 440, pitchConfidence: 0.9 },
        { pitch: 440, pitchConfidence: 0.3 },
        { pitch: 0, pitchConfidence: 0.9 },
      ],
      1.5,
    );
    const profile = await computeSequenceFeatures(
      essentia,
      data,
      sampleRate,
      hopSec,
    );
    expect(profile.f0Hz[0]).toBeCloseTo(440, 6);
    expect(Number.isNaN(profile.f0Hz[1])).toBe(true);
    expect(Number.isNaN(profile.f0Hz[2])).toBe(true);
    expect(Array.from(profile.f0Confidence)).toEqual(
      Array.from(new Float32Array([0.9, 0.3, 0.9])),
    );
  });

  test("onset flux: first frame is 0, later frames take essentia flux", async () => {
    const essentia = makeEssentia([{ pitch: 440, pitchConfidence: 0.9 }], 1.5);
    const profile = await computeSequenceFeatures(
      essentia,
      data,
      sampleRate,
      hopSec,
    );
    expect(profile.onsetFlux[0]).toBe(0);
    expect(profile.onsetFlux[1]).toBeCloseTo(1.5, 6);
    expect(profile.onsetFlux[2]).toBeCloseTo(1.5, 6);
  });

  test("empty result when data is shorter than one frame", async () => {
    const essentia = makeEssentia([{ pitch: 440, pitchConfidence: 0.9 }], 1.5);
    const profile = await computeSequenceFeatures(
      essentia,
      new Float32Array(1024),
      sampleRate,
      hopSec,
    );
    expect(profile.timeSec.length).toBe(0);
    expect(profile.f0Hz.length).toBe(0);
  });
});

describe("profileToWire / profileFromWire", () => {
  test("round-trip preserves every array element and scalar", () => {
    const profile: SequenceFeatureProfile = {
      timeSec: new Float32Array([0.1, 0.2, 0.3]),
      f0Hz: new Float32Array([440, NaN, 220]),
      f0Confidence: new Float32Array([0.9, 0.2, 0.7]),
      onsetFlux: new Float32Array([0, 1.5, 0.25]),
      sampleRate: 48000,
      hopSec: 0.02,
    };
    const back = profileFromWire(profileToWire(profile));
    expect(Array.from(back.timeSec)).toEqual(Array.from(profile.timeSec));
    expect(back.f0Hz[0]).toBe(440);
    expect(Number.isNaN(back.f0Hz[1])).toBe(true);
    expect(back.f0Hz[2]).toBe(220);
    expect(Array.from(back.f0Confidence)).toEqual(
      Array.from(profile.f0Confidence),
    );
    expect(Array.from(back.onsetFlux)).toEqual(Array.from(profile.onsetFlux));
    expect(back.sampleRate).toBe(48000);
    expect(back.hopSec).toBe(0.02);
  });

  test("wire buffers are copies, not views over the source buffer", () => {
    const profile: SequenceFeatureProfile = {
      timeSec: new Float32Array([1]),
      f0Hz: new Float32Array([2]),
      f0Confidence: new Float32Array([3]),
      onsetFlux: new Float32Array([4]),
      sampleRate: 44100,
      hopSec: 0.01,
    };
    const wire = profileToWire(profile);
    profile.timeSec[0] = 99;
    expect(new Float32Array(wire.timeSec)[0]).toBe(1);
  });
});
