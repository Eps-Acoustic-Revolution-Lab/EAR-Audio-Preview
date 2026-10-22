import LevelMeterComponent from "./levelMeterComponent";
import type PlayerService from "../../services/playerService";
import type AnalyzeSettingsService from "../../services/analyzeSettingsService";
import { FrequencyWeightedRms } from "../../utils/frequencyWeightedRms";

test("weighting is opt-in, changes RMS only and labels the estimate", () => {
  const container = document.createElement("div");
  const samples = Float32Array.from(
    { length: 2048 },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * 100 * i) / 48000),
  );
  const analyser = {
    fftSize: 2048,
    context: { sampleRate: 48000 },
    getFloatTimeDomainData: (out: Float32Array) => out.set(samples),
  };
  const player = Object.assign(new EventTarget(), {
    isPlaying: false,
    getAnalysers: () => ({ left: analyser, right: analyser }),
  });
  const settings = Object.assign(new EventTarget(), {
    liveMonitoringMode: "lr",
    liveLevelMeterReleaseDbPerSec: 20,
    hearingProtectionEnabled: false,
  });
  const meter = new LevelMeterComponent(
    container,
    player as unknown as PlayerService,
    settings as unknown as AnalyzeSettingsService,
  );
  const tick = (time: number) =>
    (meter as unknown as { _tick: (time: number) => void })._tick(time);
  const spy = jest.spyOn(FrequencyWeightedRms.prototype, "compute");
  const select = container.querySelector<HTMLSelectElement>(
    ".levelMeter__weighting",
  )!;
  expect(select.value).toBe("Z");
  tick(100);
  tick(200);
  expect(spy).not.toHaveBeenCalled();
  const peak = container.querySelector(".js-meterPeakL")!.textContent;
  select.value = "A";
  select.dispatchEvent(new Event("change"));
  expect(container.querySelector(".js-meterRmsL")!.textContent).toBe("RA —");
  tick(300);
  expect(spy).toHaveBeenCalledTimes(2);
  expect(container.querySelector(".js-meterPeakL")!.textContent).toBe(peak);
  expect(container.querySelector(".js-meterRmsL")!.textContent).toMatch(/^RA /);
  expect(container.querySelector(".js-meterRmsR")!.textContent).toBe(
    container.querySelector(".js-meterRmsL")!.textContent,
  );
  container
    .querySelector("#levelMeterInner")!
    .dispatchEvent(new MouseEvent("contextmenu"));
  tick(400);
  expect(container.querySelector(".js-meterLabelR")!.textContent).toBe("S");
  expect(
    Number(
      container.querySelector(".js-meterRmsR")!.textContent!.split(" ")[1],
    ),
  ).toBeLessThan(
    Number(
      container.querySelector(".js-meterRmsL")!.textContent!.split(" ")[1],
    ),
  );
  meter.dispose();
  spy.mockRestore();
});
