import GoniometerComponent from "../../webview/components/liveMeters/goniometerComponent";
import { createPcmSource } from "../core";
import { createSettings } from "../settings";
import { createLevelMeter } from "./levelMeter";
import { createSpectrum } from "./spectrum";
import { createStereoField } from "./stereoField";
import { createPhaseCorrelation } from "./phaseCorrelation";
import { createDescriptors } from "./descriptors";
import { createLivePanel } from "./livePanel";
import { mountView } from "./shared";

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test.each([
  createLevelMeter,
  createSpectrum,
  createStereoField,
  createPhaseCorrelation,
  createDescriptors,
  createLivePanel,
])(
  "%p mounts the original components and independently controls lifecycle",
  (create) => {
    const source = createPcmSource({ sampleRate: 48000 });
    source.push({ left: new Float32Array(2048) });
    const container = document.createElement("div");
    document.body.append(container);
    const view = create(container, { source });
    expect(container.querySelector(".ear-sdk")).not.toBeNull();
    view.suspend();
    view.setOptions({
      liveSpectrumMode: "cqt",
      liveSoundFieldMode: "lissajous",
    });
    source.suspend();
    source.resume();
    view.resize();
    jest.advanceTimersByTime(50);
    view.reset();
    view.resume();
    view.dispose();
    view.dispose();
    expect(container.children).toHaveLength(0);
    expect(source.getAnalysers()).not.toBeNull();
    source.dispose();
    container.remove();
  },
);

test("level weighting can be changed through API and survives reset", () => {
  const source = createPcmSource({ sampleRate: 48000 });
  const container = document.createElement("div");
  const meter = createLevelMeter(container, { source, weighting: "A" });
  expect(container.querySelector<HTMLSelectElement>("select").value).toBe("A");
  meter.setOptions({ weighting: "C" });
  meter.reset();
  expect(container.querySelector<HTMLSelectElement>("select").value).toBe("C");
  meter.dispose();
  source.dispose();
});

test("settings validation is atomic and invalid creation does not leave a mount", () => {
  const settings = createSettings();
  expect(() =>
    settings.setOptions({
      liveSpectrumMode: "cqt",
      liveAnalysisFftSize: 111 as 2048,
    }),
  ).toThrow();
  expect(settings.liveSpectrumMode).toBe("fft");
  const source = createPcmSource({ sampleRate: 48000 });
  const container = document.createElement("div");
  expect(() =>
    createSpectrum(container, {
      source,
      settings: { liveAnalysisFftSize: 111 as 2048 },
    }),
  ).toThrow();
  expect(container.children).toHaveLength(0);
  source.dispose();
});

test("failed view factory releases its FFT lease and removes its mount", () => {
  const source = createPcmSource({ sampleRate: 48000, fftSize: 512 });
  const container = document.createElement("div");
  expect(() =>
    mountView(container, { source }, () => {
      throw new Error("factory");
    }),
  ).toThrow("factory");
  expect(container.children).toHaveLength(0);
  expect(source.getAnalysers().left.fftSize).toBe(512);
  source.dispose();
});

test("comparison descriptors retain track identity and paused precomputed PCM", () => {
  const source = createPcmSource({ sampleRate: 48000 });
  const container = document.createElement("div");
  const samples = Float32Array.from({ length: 2048 }, (_, i) =>
    Math.sin((2 * Math.PI * 1000 * i) / 48000),
  );
  const unsubscribe = jest.fn();
  const view = createDescriptors(container, {
    source,
    comparison: {
      subscribe: () => unsubscribe,
      snapshot: () => ({
        revision: 1,
        time: 0,
        tracks: [
          {
            id: "a",
            revision: "1",
            name: "Reference",
            color: "#ff0000",
            sampleRate: 48000,
            left: samples,
            right: samples,
            frequencies: new Float64Array(),
            spectrumDb: new Float32Array(),
            phaseRho: new Float32Array(),
            broadbandRho: 1,
            weighting: "none",
          },
        ],
      }),
    },
  });
  expect(container.textContent).toContain("Reference · Centroid");
  expect(container.textContent).not.toContain("Playback paused");
  view.dispose();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  source.dispose();
});

test("CQT retains the native 32768 sample tap and releases independent FFT leases", () => {
  const source = createPcmSource({ sampleRate: 48000, fftSize: 512 });
  const container = document.createElement("div");
  const cqt = createSpectrum(container, {
    source,
    settings: { liveSpectrumMode: "cqt" },
  });
  const meter = createLevelMeter(container, { source });
  expect(source.getAnalysers().left.fftSize).toBe(32768);
  meter.dispose();
  expect(source.getAnalysers().left.fftSize).toBe(32768);
  cqt.setOptions({ liveSpectrumMode: "fft", liveAnalysisFftSize: 1024 });
  expect(source.getAnalysers().left.fftSize).toBe(1024);
  cqt.dispose();
  expect(source.getAnalysers().left.fftSize).toBe(512);
  source.dispose();
});

test("suspended spectrum ignores settings and playback restarts until resumed", () => {
  const source = createPcmSource({ sampleRate: 48000 });
  source.push({ left: new Float32Array(2048) });
  const container = document.createElement("div");
  const view = createSpectrum(container, { source });
  view.suspend();
  const raf = jest.spyOn(window, "requestAnimationFrame");
  view.setOptions({ liveSpectrumMode: "cqt" });
  source.suspend();
  source.resume();
  container
    .querySelector(".ear-sdk")
    .dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
  expect(raf).not.toHaveBeenCalled();
  view.resume();
  expect(raf).toHaveBeenCalled();
  view.dispose();
  source.dispose();
  raf.mockRestore();
});

test("prototype settings are rejected and disposed meter updates are inert", () => {
  const settings = createSettings();
  expect(() => settings.setOptions(JSON.parse('{"__proto__":1}'))).toThrow(
    "Unknown setting",
  );
  const source = createPcmSource({ sampleRate: 48000 });
  const container = document.createElement("div");
  const view = createLevelMeter(container, { source });
  view.dispose();
  expect(() => view.setOptions({ weighting: "A" })).not.toThrow();
  source.dispose();
});

test("stereo field resumes from the latest comparison snapshot without another publication", () => {
  const source = createPcmSource({ sampleRate: 48000 });
  const container = document.createElement("div");
  let redraw: () => void;
  let revision = 1;
  const track = {
    id: "a",
    revision: "1",
    name: "Reference",
    color: "#ff0000",
    sampleRate: 48000,
    left: new Float32Array(2048).fill(0.5),
    right: new Float32Array(2048).fill(0.25),
    frequencies: new Float64Array(),
    spectrumDb: new Float32Array(),
    phaseRho: new Float32Array(),
    broadbandRho: 1,
    weighting: "none" as const,
  };
  const updatedTracks: string[] = [];
  const original = GoniometerComponent.prototype as unknown as {
    _updateAudioData(frame?: typeof track): void;
  };
  const update = jest.spyOn(original, "_updateAudioData");
  update.mockImplementation((frame) => {
    if (frame) {
      updatedTracks.push(frame.name);
    }
  });
  const view = createStereoField(container, {
    source,
    comparison: {
      snapshot: () => ({
        revision,
        time: revision,
        tracks: [{ ...track, name: `Track ${revision}` }],
      }),
      subscribe: (callback) => {
        redraw = callback;
        return () => undefined;
      },
    },
  });
  const mount = container.querySelector<HTMLElement>(".goniometerPane");
  Object.defineProperties(mount, {
    clientWidth: { value: 400 },
    clientHeight: { value: 300 },
  });
  redraw();
  expect(updatedTracks).toEqual(["Track 1"]);
  view.suspend();
  revision = 2;
  redraw();
  expect(updatedTracks).toEqual(["Track 1"]);
  view.resume();
  expect(updatedTracks).toEqual(["Track 1", "Track 2"]);
  view.resize();
  expect(updatedTracks).toEqual(["Track 1", "Track 2"]);
  view.dispose();
  source.dispose();
  update.mockRestore();
});
