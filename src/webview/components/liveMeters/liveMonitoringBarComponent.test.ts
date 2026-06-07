import { MockAudioBuffer } from "../../../__mocks__/helper";
import { EventType } from "../../events";
import AnalyzeService from "../../services/analyzeService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import { AnalyzeDefault } from "../../../config";
import LiveMonitoringBarComponent from "./liveMonitoringBarComponent";

function click(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent(EventType.CLICK));
}

describe("liveMonitoringBarComponent", () => {
  let analyzeService: AnalyzeService;
  let analyzeSettingsService: AnalyzeSettingsService;
  let bar: LiveMonitoringBarComponent;

  beforeAll(() => {
    document.body.innerHTML = '<div id="transportMonitorMount"></div>';
    const audioBuffer = new MockAudioBuffer(
      44100,
      2,
      44100,
    ) as unknown as AudioBuffer;
    analyzeService = new AnalyzeService(audioBuffer);
    const analyzeDefault = {} as AnalyzeDefault;
    analyzeSettingsService = AnalyzeSettingsService.fromDefaultSetting(
      analyzeDefault,
      audioBuffer,
    );
    bar = new LiveMonitoringBarComponent(
      "#transportMonitorMount",
      analyzeSettingsService,
    );
  });

  afterAll(() => {
    analyzeService.dispose();
    analyzeSettingsService.dispose();
    bar.dispose();
  });

  test("SW⇄LR selects swap mode (mutually exclusive with LR)", () => {
    const swapBtn = document.querySelector(
      ".js-lm-swap-mode",
    ) as HTMLButtonElement;
    const lrBtn = document.querySelector(".js-lm-lr") as HTMLButtonElement;
    expect(analyzeSettingsService.liveMonitoringMode).toBe("lr");
    click(swapBtn);
    expect(analyzeSettingsService.liveMonitoringMode).toBe("swap");
    expect(swapBtn.classList.contains("earEqPill--active")).toBe(true);
    expect(lrBtn.classList.contains("earEqPill--active")).toBe(false);
    click(lrBtn);
    expect(analyzeSettingsService.liveMonitoringMode).toBe("lr");
  });

  test("band RESET clears solo mask and band active UI", () => {
    analyzeSettingsService.monitorBandSoloMask = 0b011;
    click(document.querySelector(".js-lm-bands-reset") as HTMLButtonElement);
    expect(analyzeSettingsService.monitorBandSoloMask).toBe(0);
    const bands = document.querySelectorAll(".js-lm-band");
    expect(
      [...bands].every(
        (b) => !(b as HTMLElement).classList.contains("earEqPill--active"),
      ),
    ).toBe(true);
  });

  test("band toggle flips bitmask and active class", () => {
    analyzeSettingsService.resetMonitorBandSolo();
    const b1 = document.querySelector(
      '.js-lm-band[data-band="1"]',
    ) as HTMLButtonElement;
    click(b1);
    expect((analyzeSettingsService.monitorBandSoloMask >> 1) & 1).toBe(1);
    expect(b1.classList.contains("earEqPill--active")).toBe(true);
    click(b1);
    expect(analyzeSettingsService.monitorBandSoloMask & (1 << 1)).toBe(0);
  });
});
