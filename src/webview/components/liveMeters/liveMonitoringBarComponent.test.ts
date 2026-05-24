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
    document.body.innerHTML = '<div id="liveMonitoringBar"></div>';
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
      "#liveMonitoringBar",
      analyzeSettingsService,
    );
  });

  afterAll(() => {
    analyzeService.dispose();
    analyzeSettingsService.dispose();
    bar.dispose();
  });

  test("level meter checkbox reflects and updates showLevelMeter", () => {
    const cb = document.querySelector(
      ".js-lm-showLevelMeter",
    ) as HTMLInputElement;
    expect(cb.checked).toBe(false);
    cb.checked = true;
    cb.dispatchEvent(new Event(EventType.CHANGE));
    expect(analyzeSettingsService.showLevelMeter).toBe(true);
    analyzeSettingsService.dispatchEvent(
      new CustomEvent(EventType.AS_UPDATE_SHOW_LEVEL_METER, {
        detail: { value: false },
      }),
    );
    expect(cb.checked).toBe(false);
  });

  test("SW⇄LR selects swap mode (mutually exclusive with LR)", () => {
    const swapBtn = document.querySelector(
      ".js-lm-swap-mode",
    ) as HTMLButtonElement;
    const lrBtn = document.querySelector(".js-lm-lr") as HTMLButtonElement;
    expect(analyzeSettingsService.liveMonitoringMode).toBe("lr");
    click(swapBtn);
    expect(analyzeSettingsService.liveMonitoringMode).toBe("swap");
    expect(swapBtn.classList.contains("liveMonitoringBar__btn--active")).toBe(
      true,
    );
    expect(lrBtn.classList.contains("liveMonitoringBar__btn--active")).toBe(
      false,
    );
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
        (b) =>
          !(b as HTMLElement).classList.contains(
            "liveMonitoringBar__btn--active",
          ),
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
    expect(b1.classList.contains("liveMonitoringBar__btn--active")).toBe(true);
    click(b1);
    expect(analyzeSettingsService.monitorBandSoloMask & (1 << 1)).toBe(0);
  });
});
