import { createPcmSource } from "./core";

describe("PCM analysis source", () => {
  test("copies mono input, retains a rolling window, and never detaches input", () => {
    const source = createPcmSource({ sampleRate: 48000, fftSize: 32 });
    const input = new Float32Array(32).fill(0.25);
    source.push({ left: input });
    input.fill(0.75);
    const data = new Float32Array(32);
    source.getAnalysers().right.getFloatTimeDomainData(data);
    expect(Array.from(data)).toEqual(Array(32).fill(0.25));
    expect(input.buffer.byteLength).toBe(128);
    source.push({ left: new Float32Array([1, 2]) });
    source.getAnalysers().left.getFloatTimeDomainData(data);
    expect(Array.from(data.slice(-3))).toEqual([0.25, 1, 2]);
  });
  test("computes measured stereo FFT peaks and silence", () => {
    const source = createPcmSource({ sampleRate: 48000, fftSize: 1024 });
    source.push({
      left: Float32Array.from({ length: 1024 }, (_, i) =>
        Math.sin((2 * Math.PI * 16 * i) / 1024),
      ),
      right: new Float32Array(1024),
    });
    const left = new Float32Array(512);
    const right = new Float32Array(512);
    source.getAnalysers().left.getFloatFrequencyData(left);
    source.getAnalysers().right.getFloatFrequencyData(right);
    expect(left[16]).toBeCloseTo(20 * Math.log10(0.21), 4);
    expect(Math.max(...right)).toBe(-Infinity);
    expect(left[15]).toBeLessThan(left[16]);
  });
  test("validates inputs and has idempotent independent lifecycle", () => {
    expect(() => createPcmSource({ sampleRate: NaN })).toThrow();
    expect(() => createPcmSource({ sampleRate: 48000, fftSize: 33 })).toThrow();
    const source = createPcmSource({ sampleRate: 48000, fftSize: 32 });
    expect(() => source.push({ left: new Float32Array([NaN]) })).toThrow();
    expect(() =>
      source.push({ left: new Float32Array(2), right: new Float32Array(1) }),
    ).toThrow();
    const listener = jest.fn();
    source.addEventListener("update-is-playing", listener);
    source.suspend();
    source.suspend();
    expect(source.isPlaying).toBe(false);
    source.resume();
    source.setFftSize(64);
    expect(source.getAnalysers().left.fftSize).toBe(64);
    source.dispose();
    source.dispose();
    source.resume();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(source.getAnalysers()).toBeNull();
    expect(() => source.push({ left: new Float32Array(0) })).toThrow();
  });
});

test("FFT requirements retain the largest active consumer lease", () => {
  const source = createPcmSource({ sampleRate: 48000, fftSize: 32 });
  const releaseLarge = source.acquireFftSize(1024);
  const releaseSmall = source.acquireFftSize(128);
  source.setFftSize(64);
  expect(source.getAnalysers().left.fftSize).toBe(1024);
  releaseLarge();
  expect(source.getAnalysers().left.fftSize).toBe(128);
  releaseSmall();
  releaseSmall();
  expect(source.getAnalysers().left.fftSize).toBe(64);
  source.dispose();
});
