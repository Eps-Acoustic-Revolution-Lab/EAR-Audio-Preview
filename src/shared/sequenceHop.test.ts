import { computeAdaptiveSequenceHopSec } from "./sequenceHop";

describe("computeAdaptiveSequenceHopSec", () => {
  const sr = 44100;

  test("short clip gets fine hop (~250+ frames)", () => {
    const hop = computeAdaptiveSequenceHopSec(5.5, sr);
    const frames = Math.floor(5.5 / hop);
    expect(frames).toBeGreaterThanOrEqual(200);
    expect(frames).toBeLessThanOrEqual(400);
  });

  test("long track caps frame count", () => {
    const hop = computeAdaptiveSequenceHopSec(300, sr);
    const frames = Math.floor(300 / hop);
    expect(frames).toBeLessThanOrEqual(3600);
    expect(frames).toBeGreaterThanOrEqual(2500);
  });

  test("respects minimum hop in samples", () => {
    const hop = computeAdaptiveSequenceHopSec(0.05, sr);
    expect(hop).toBeGreaterThanOrEqual(256 / sr);
  });
});
