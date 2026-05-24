import LoudnessService, {
  formatDbTp,
  formatLufs,
  mergeSnapshots,
} from "./loudnessService";
import { MockAudioBuffer } from "../../__mocks__/helper";

function makeBuffer(
  sampleRate: number,
  channels: number,
  seconds: number,
  fill: (ch: number, i: number) => number,
): AudioBuffer {
  const length = Math.max(1, Math.round(sampleRate * seconds));
  const buf = new MockAudioBuffer(
    channels,
    length,
    sampleRate,
  ) as unknown as AudioBuffer;
  for (let ch = 0; ch < channels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = fill(ch, i);
    }
  }
  return buf;
}

describe("LoudnessService", () => {
  test("truePeakBuffer on full-scale sine is near 0 dBTP", async () => {
    const sr = 48000;
    const buf = makeBuffer(sr, 1, 0.05, (_ch, i) =>
      Math.sin((2 * Math.PI * 1000 * i) / sr),
    );
    const svc = new LoudnessService(buf);
    await svc.ensureReady();
    const ch0 = buf.getChannelData(0);
    const tp = svc.truePeakBuffer(ch0, sr);
    expect(Number.isFinite(tp)).toBe(true);
    expect(tp).toBeGreaterThan(-1);
    expect(tp).toBeLessThan(0.5);
  });

  test("truePeakFile stereo returns finite max", async () => {
    const sr = 44100;
    const buf = makeBuffer(
      sr,
      2,
      0.02,
      (ch, i) =>
        (ch === 0 ? 0.5 : -0.5) * Math.sin((2 * Math.PI * 440 * i) / sr),
    );
    const svc = new LoudnessService(buf);
    await svc.ensureReady();
    const tp = svc.truePeakFile();
    expect(Number.isFinite(tp.max)).toBe(true);
  });

  test("format helpers", () => {
    expect(formatLufs(-14.2)).toBe("-14.2 LUFS");
    expect(formatDbTp(0.3)).toBe("+0.3 dBTP");
    expect(formatLufs(Number.NaN)).toBe("—");
  });

  test("mergeSnapshots preserves per-frame true peak profile", () => {
    const profile = mergeSnapshots([
      {
        currentFrame: 1,
        currentTime: 0.1,
        currentMeasurements: [
          {
            momentaryLoudness: -20,
            shortTermLoudness: -18,
            integratedLoudness: -19,
            maximumMomentaryLoudness: -20,
            maximumShortTermLoudness: -18,
            loudnessRange: 4,
            maximumTruePeakLevel: -1,
          },
        ],
      },
      {
        currentFrame: 2,
        currentTime: 0.2,
        currentMeasurements: [
          {
            momentaryLoudness: -15,
            shortTermLoudness: -16,
            integratedLoudness: -17,
            maximumMomentaryLoudness: -15,
            maximumShortTermLoudness: -16,
            loudnessRange: 5,
            maximumTruePeakLevel: 0.4,
          },
        ],
      },
    ]);

    expect(profile.timeSec[0]).toBeCloseTo(0.1);
    expect(profile.timeSec[1]).toBeCloseTo(0.2);
    expect(profile.truePeakDbTp[0]).toBeCloseTo(-1);
    expect(profile.truePeakDbTp[1]).toBeCloseTo(0.4);
    expect(profile.maxTruePeakDbTp).toBe(0.4);
  });
});
