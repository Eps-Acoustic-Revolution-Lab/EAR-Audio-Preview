import { MockAudioBuffer } from "../../../__mocks__/helper";
import { AnalyzeDefault, PlayerDefault } from "../../../config";
import AnalyzeService from "../../services/analyzeService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import PlayerSettingsService from "../../services/playerSettingsService";
import { EventType } from "../../events";
import { setActiveWorkspacePane } from "../../workspacePane";
import SettingTab from "./settingTabComponent";

describe("settingTabComponent", () => {
  let playerSettingService: PlayerSettingsService;
  let analyzeService: AnalyzeService;
  let analyzeSettingsService: AnalyzeSettingsService;
  let settingTabComponent: SettingTab;

  beforeAll(() => {
    document.body.innerHTML = '<div id="settingTab"></div>';
    document.documentElement.dataset.workspacePane = "stft";
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
    );
  });

  afterAll(() => {
    analyzeService.dispose();
    analyzeSettingsService.dispose();
    settingTabComponent.dispose();
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

  test("Playback section is always visible", () => {
    const playback = document.querySelector(
      ".js-settingTabContent-player .panelGroup__title",
    ) as HTMLElement;
    expect(playback).toBeTruthy();
    expect(playback.textContent).toBe("Playback");

    setActiveWorkspacePane("loudness");
    expect(
      document.querySelector(".js-settingTabContent-player .panelGroup"),
    ).not.toBeNull();

    setActiveWorkspacePane("stft");
  });

  test("Save footer is visible only on STFT pane", () => {
    const footer = document.querySelector(
      ".js-settingTabFooter",
    ) as HTMLElement;

    setActiveWorkspacePane("stft");
    expect(footer.hasAttribute("hidden")).toBe(false);

    setActiveWorkspacePane("liveSpec");
    expect(footer.hasAttribute("hidden")).toBe(true);

    document.dispatchEvent(
      new CustomEvent(EventType.WORKSPACE_ACTIVE_PANE, {
        detail: { pane: "stft" },
      }),
    );
  });
});
