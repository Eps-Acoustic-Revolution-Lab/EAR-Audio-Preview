import {
  MockAudioBuffer,
  postMessageFromWebview,
} from "../../../__mocks__/helper";
import { AnalyzeDefault, PlayerDefault } from "../../../config";
import AnalyzeService from "../../services/analyzeService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import PlayerSettingsService from "../../services/playerSettingsService";
import SettingTab from "./settingTabComponent";

const settingsDockHtml = `
  <div id="settingsDock">
    <button
      type="button"
      class="settingsDock__fab js-settingsFab"
      id="settingsFab"
      aria-expanded="false"
      aria-controls="settingsSheet"
      aria-haspopup="dialog"
      title="Options"
    ></button>
    <div class="settingsDock__backdrop js-settingsBackdrop" id="settingsBackdrop" hidden></div>
    <div
      class="settingsDock__sheet js-settingsSheet settingsDock__sheet--animating"
      id="settingsSheet"
      role="dialog"
      aria-modal="true"
      hidden
    >
      <div id="settingTab"></div>
    </div>
  </div>
`;

describe("settingTabComponent", () => {
  let playerSettingService: PlayerSettingsService;
  let analyzeService: AnalyzeService;
  let analyzeSettingsService: AnalyzeSettingsService;
  let settingTabComponent: SettingTab;
  beforeAll(() => {
    document.body.innerHTML = settingsDockHtml;
    const audioBuffer = new MockAudioBuffer(
      44100,
      1,
      44100,
    ) as unknown as AudioBuffer;
    analyzeService = new AnalyzeService(audioBuffer);
    const analyzeDefault = {} as AnalyzeDefault;
    analyzeSettingsService = AnalyzeSettingsService.fromDefaultSetting(
      analyzeDefault,
      audioBuffer,
    );
    const playerDefault = {} as PlayerDefault;
    playerSettingService = PlayerSettingsService.fromDefaultSetting(
      playerDefault,
      audioBuffer,
    );
    settingTabComponent = new SettingTab(
      "#settingTab",
      playerSettingService,
      analyzeService,
      analyzeSettingsService,
      audioBuffer,
      postMessageFromWebview,
    );
  });

  afterAll(() => {
    analyzeService.dispose();
    analyzeSettingsService.dispose();
    settingTabComponent.dispose();
  });

  test("FAB toggles settings sheet visibility", () => {
    const fab = document.getElementById("settingsFab") as HTMLButtonElement;
    const sheet = document.getElementById("settingsSheet") as HTMLElement;
    expect(fab).toBeTruthy();
    expect(sheet.hasAttribute("hidden")).toBe(true);

    fab.click();
    expect(sheet.hasAttribute("hidden")).toBe(false);
    expect(fab.getAttribute("aria-expanded")).toBe("true");

    fab.click();
    expect(sheet.hasAttribute("hidden")).toBe(true);
    expect(fab.getAttribute("aria-expanded")).toBe("false");
  });

  test("Save button triggers spectrogram re-analyze", () => {
    const spy = jest.spyOn(analyzeService, "analyze");
    const saveBtn = document.querySelector(
      ".js-saveSpectrogram",
    ) as HTMLButtonElement;
    expect(saveBtn).toBeTruthy();
    saveBtn.click();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test("Escape closes the settings sheet when open", () => {
    const fab = document.getElementById("settingsFab") as HTMLButtonElement;
    const sheet = document.getElementById("settingsSheet") as HTMLElement;
    fab.click();
    expect(sheet.hasAttribute("hidden")).toBe(false);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(sheet.hasAttribute("hidden")).toBe(true);
  });

  test("Options tab content is visible by default", () => {
    const optionsContent = document.querySelector(
      ".js-settingTabContent-analyze",
    ) as HTMLElement;
    expect(optionsContent.style.display).toBe("block");
    const playerContent = document.querySelector(
      ".js-settingTabContent-player",
    ) as HTMLElement;
    expect(playerContent.style.display).toBe("none");
  });

  test("click player-button should show player content", () => {
    const playerButton = document.querySelector(
      ".js-settingTabButton-player",
    ) as HTMLButtonElement;
    playerButton.click();
    const playerContent = document.querySelector(
      ".js-settingTabContent-player",
    ) as HTMLElement;
    expect(playerContent.style.display).toBe("block");
  });

  test("click options-button should show options content", () => {
    const playerButton = document.querySelector(
      ".js-settingTabButton-player",
    ) as HTMLButtonElement;
    playerButton.click();
    const optionsButton = document.querySelector(
      ".js-settingTabButton-options",
    ) as HTMLButtonElement;
    optionsButton.click();
    const analyzeContent = document.querySelector(
      ".js-settingTabContent-analyze",
    ) as HTMLElement;
    expect(analyzeContent.style.display).toBe("block");
  });

  test("selected tab button should have active class", () => {
    const playerButton = document.querySelector(
      ".js-settingTabButton-player",
    ) as HTMLButtonElement;
    playerButton.click();
    expect(playerButton.classList.contains("settingTab__button--active")).toBe(
      true,
    );
    const optionsButton = document.querySelector(
      ".js-settingTabButton-options",
    ) as HTMLButtonElement;
    optionsButton.click();
    expect(optionsButton.classList.contains("settingTab__button--active")).toBe(
      true,
    );
  });

  test("active class should be removed when other tab button is clicked", () => {
    const playerButton = document.querySelector(
      ".js-settingTabButton-player",
    ) as HTMLButtonElement;
    playerButton.click();
    const optionsButton = document.querySelector(
      ".js-settingTabButton-options",
    ) as HTMLButtonElement;
    optionsButton.click();
    expect(playerButton.classList.contains("settingTab__button--active")).toBe(
      false,
    );
  });
});
