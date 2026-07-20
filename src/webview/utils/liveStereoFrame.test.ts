import {
  ensureStereoFrameBuffers,
  fetchMonitoringStereoFrame,
  StereoFrameBuffers,
} from "./liveStereoFrame";
import type PlayerService from "../services/playerService";
import type { LiveMonitoringMode } from "./liveMonitoring";

/**
 * Behavior anchors for the shared monitoring stereo frame: buffer reuse,
 * inactive-player null contract and the L/R/M/S monitoring matrix output.
 */

function makeFakePlayer(
  lSamples: number[],
  rSamples: number[],
  isPlaying = true,
  sampleRate = 48000,
): PlayerService {
  const fftSize = lSamples.length;
  const makeAnalyser = (samples: number[]) => ({
    fftSize,
    context: { sampleRate },
    getFloatTimeDomainData: (buf: Float32Array) => {
      buf.set(samples);
    },
  });
  return {
    getAnalysers: () => ({
      left: makeAnalyser(lSamples),
      right: makeAnalyser(rSamples),
    }),
    isPlaying,
  } as unknown as PlayerService;
}

describe("ensureStereoFrameBuffers", () => {
  test("reuses the same buffer set when fftSize matches", () => {
    const first = ensureStereoFrameBuffers(2048);
    expect(ensureStereoFrameBuffers(2048, first)).toBe(first);
  });

  test("reallocates all four buffers when fftSize changes", () => {
    const first = ensureStereoFrameBuffers(1024);
    const next = ensureStereoFrameBuffers(2048, first);
    expect(next).not.toBe(first);
    expect(next.bufL.length).toBe(2048);
    expect(next.bufR.length).toBe(2048);
    expect(next.mixL.length).toBe(2048);
    expect(next.mixR.length).toBe(2048);
  });
});

describe("fetchMonitoringStereoFrame", () => {
  test("returns null when analysers are unavailable", () => {
    const player = {
      getAnalysers: () => null,
      isPlaying: true,
    } as unknown as PlayerService;
    const frame = fetchMonitoringStereoFrame(
      player,
      "lr",
      ensureStereoFrameBuffers(4),
    );
    expect(frame).toBeNull();
  });

  test("returns null when playback is paused", () => {
    const player = makeFakePlayer([1, 0], [0, 1], false);
    const frame = fetchMonitoringStereoFrame(
      player,
      "lr",
      ensureStereoFrameBuffers(2),
    );
    expect(frame).toBeNull();
  });

  test("propagates fftSize and sampleRate from the analyser", () => {
    const player = makeFakePlayer([1, 0, 0, 0], [0, 1, 0, 0], true, 44100);
    const frame = fetchMonitoringStereoFrame(
      player,
      "lr",
      ensureStereoFrameBuffers(4),
    );
    expect(frame).not.toBeNull();
    expect(frame!.fftSize).toBe(4);
    expect(frame!.sampleRate).toBe(44100);
  });

  const l = [1, 0.5];
  const r = [0.5, -0.5];
  const cases: Array<{
    mode: LiveMonitoringMode;
    mixL: number[];
    mixR: number[];
  }> = [
    // lr: identity
    { mode: "lr", mixL: [1, 0.5], mixR: [0.5, -0.5] },
    // swap: channels exchanged
    { mode: "swap", mixL: [0.5, -0.5], mixR: [1, 0.5] },
    // l: left feeds both ears
    { mode: "l", mixL: [1, 0.5], mixR: [1, 0.5] },
    // r: right feeds both ears
    { mode: "r", mixL: [0.5, -0.5], mixR: [0.5, -0.5] },
    // m: (L+R)/2 on both
    { mode: "m", mixL: [0.75, 0], mixR: [0.75, 0] },
    // s: (L−R)/2 on left, (R−L)/2 on right
    { mode: "s", mixL: [0.25, 0.5], mixR: [-0.25, -0.5] },
  ];

  for (const { mode, mixL, mixR } of cases) {
    test(`monitoring matrix "${mode}" produces the documented mix`, () => {
      const player = makeFakePlayer(l, r);
      const buffers: StereoFrameBuffers = ensureStereoFrameBuffers(2);
      const frame = fetchMonitoringStereoFrame(player, mode, buffers);
      expect(frame).not.toBeNull();
      for (let i = 0; i < 2; i++) {
        expect(frame!.mixL[i]).toBeCloseTo(mixL[i], 6);
        expect(frame!.mixR[i]).toBeCloseTo(mixR[i], 6);
      }
    });
  }
});
