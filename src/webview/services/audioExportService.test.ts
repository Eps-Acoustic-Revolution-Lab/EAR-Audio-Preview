import {
  applyChannelMode,
  applyOfflineFilters,
  bufferRms,
  extractRegion,
} from "./audioExportService";
import { createAudioContext, MockAudioBuffer } from "../../__mocks__/helper";

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

describe("audioExportService", () => {
  beforeAll(() => {
    const ctx = createAudioContext(44100);
    globalThis.AudioContext = function mockAudioContext() {
      return ctx;
    } as unknown as typeof AudioContext;
  });

  test("extractRegion slices without overrun", () => {
    const sr = 1000;
    const buf = makeBuffer(sr, 1, 1, (_ch, i) => i / sr);
    const slice = extractRegion(buf, 0.2, 0.5);
    expect(slice.numberOfChannels).toBe(1);
    expect(slice.length).toBe(300);
    expect(slice.getChannelData(0)[0]).toBeCloseTo(0.2, 2);
  });

  test("extractRegion clamps invalid bounds", () => {
    const buf = makeBuffer(44100, 2, 1, () => 0.5);
    const slice = extractRegion(buf, -1, 999);
    expect(slice.duration).toBeCloseTo(1, 3);
  });

  test("mono_mix reduces stereo to one channel", () => {
    const buf = makeBuffer(44100, 2, 0.01, (ch) => (ch === 0 ? 1 : -1));
    const out = applyChannelMode(buf, "mono_mix");
    expect(out.numberOfChannels).toBe(1);
    expect(out.getChannelData(0)[0]).toBeCloseTo(0, 5);
  });

  test("fake_stereo duplicates mono to L/R", () => {
    const buf = makeBuffer(44100, 1, 0.01, () => 0.42);
    const out = applyChannelMode(buf, "fake_stereo");
    expect(out.numberOfChannels).toBe(2);
    expect(out.getChannelData(0)[0]).toBeCloseTo(0.42, 5);
    expect(out.getChannelData(1)[0]).toBeCloseTo(0.42, 5);
  });

  test("mono_left and mono_right pick channels", () => {
    const buf = makeBuffer(44100, 2, 0.01, (ch) => (ch === 0 ? 0.25 : 0.75));
    const left = applyChannelMode(buf, "mono_left");
    const right = applyChannelMode(buf, "mono_right");
    expect(left.getChannelData(0)[0]).toBeCloseTo(0.25, 5);
    expect(right.getChannelData(0)[0]).toBeCloseTo(0.75, 5);
  });

  const hasOffline = typeof globalThis.OfflineAudioContext === "function";

  (hasOffline ? test : test.skip)(
    "HPF attenuates low-frequency energy",
    async () => {
      const sr = 48000;
      const seconds = 0.5;
      const buf = makeBuffer(sr, 1, seconds, (_ch, i) => {
        const t = i / sr;
        return 0.5 * Math.sin(2 * Math.PI * 80 * t) + 0.1;
      });
      const dryRms = bufferRms(buf);
      const filtered = await applyOfflineFilters(buf, {
        enableHpf: true,
        hpfHz: 200,
        enableLpf: false,
        lpfHz: 10000,
      });
      const wetRms = bufferRms(filtered);
      expect(wetRms).toBeLessThan(dryRms * 0.35);
    },
  );
});
