import SpectralDescriptorLane from "./spectralDescriptorLane";
import type { LiveComparisonInput, LivePlayback } from "./liveAnalysisInput";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";

it("is opt-in, renders comparison measurements safely, and removes its UI on disposal", () => {
  const container = document.createElement("div");
  const tone = Float32Array.from({ length: 4096 }, (_, i) =>
    Math.sin((2 * Math.PI * 1000 * i) / 48000),
  );
  const snapshot = jest.fn(() => ({
    revision: 1,
    time: 0,
    tracks: [
      {
        id: "a",
        revision: "1",
        name: "<b>tone</b>",
        color: "red",
        left: tone,
        right: tone,
        sampleRate: 48000,
      },
    ],
  }));
  const lane = new SpectralDescriptorLane(
    container,
    {} as LivePlayback,
    {} as AnalyzeSettingsService,
    { snapshot } as unknown as LiveComparisonInput,
  );
  lane.update();
  expect(snapshot).not.toHaveBeenCalled();
  const details = container.querySelector("details")!;
  details.open = true;
  lane.update();
  expect(container.textContent).toContain("Centroid 1000 Hz");
  expect(container.querySelector("b")).toBeNull();
  lane.dispose();
  expect(container.children).toHaveLength(0);
});

it("applies the single-file monitoring matrix before FFT and clears on pause", () => {
  const container = document.createElement("div");
  const tone = Float32Array.from({ length: 4096 }, (_, i) =>
    Math.sin((2 * Math.PI * 1000 * i) / 48000),
  );
  const read = jest.fn((out: Float32Array) => out.set(tone));
  const analyser = {
    fftSize: 4096,
    context: { sampleRate: 48000 },
    getFloatTimeDomainData: read,
  };
  const player = {
    isPlaying: true,
    getAnalysers: () => ({ left: analyser, right: analyser }),
  };
  const settings = { liveMonitoringMode: "lr" };
  const lane = new SpectralDescriptorLane(
    container,
    player as unknown as LivePlayback,
    settings as AnalyzeSettingsService,
  );
  container.querySelector("details")!.open = true;
  lane.update(true);
  expect(container.textContent).toContain("Centroid 1000 Hz");
  const count = read.mock.calls.length;
  lane.update();
  expect(read).toHaveBeenCalledTimes(count);
  settings.liveMonitoringMode = "s";
  lane.update(true);
  expect(container.textContent).toContain("Live · Centroid —");
  player.isPlaying = false;
  lane.update(true);
  expect(container.textContent).toContain("Playback paused · Centroid —");
  lane.dispose();
});

it("refreshes filtered tracks even when the published revision stays unchanged", () => {
  const container = document.createElement("div");
  const tone = Float32Array.from({ length: 4096 }, (_, i) =>
    Math.sin((2 * Math.PI * 1000 * i) / 48000),
  );
  const track = {
    id: "a",
    revision: "1",
    name: "Track A",
    color: "red",
    left: tone,
    right: tone,
    sampleRate: 48000,
  };
  let tracks = [track];
  const lane = new SpectralDescriptorLane(
    container,
    {} as LivePlayback,
    {} as AnalyzeSettingsService,
    {
      snapshot: () => ({ revision: 1, time: 0, tracks }),
    } as unknown as LiveComparisonInput,
  );
  container.querySelector("details")!.open = true;
  lane.update();
  expect(container.textContent).toContain("Track A");
  tracks = [];
  lane.update();
  expect(container.textContent).not.toContain("Track A");
  expect(container.textContent).toContain("No tracks");
  tracks = [track];
  lane.update();
  expect(container.textContent).toContain("Track A");
  lane.dispose();
});
