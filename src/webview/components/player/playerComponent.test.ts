import { EventType } from "../../events";
import {
  createAudioContext,
  waitEventForAction,
} from "../../../__mocks__/helper";
import PlayerService from "../../services/playerService";
import PlayerSettingsService from "../../services/playerSettingsService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import { AnalyzeDefault } from "../../../config";
import PlayerComponent from "./playerComponent";

describe("playerComponent", () => {
  let playerService: PlayerService;
  let playerSettingService: PlayerSettingsService;
  let playerComponent: PlayerComponent;
  beforeAll(() => {
    document.body.innerHTML = '<div id="player"></div>';
    const audioContext = createAudioContext(44100);
    const audioBuffer = audioContext.createBuffer(2, 44100, 44100);
    const pd = {
      volumeUnitDb: undefined,
      initialVolumeDb: 0.0,
      initialVolume: 1.0,
      enableSpacekeyPlay: true,
      enableSeekToPlay: true,
      enableHpf: false,
      hpfFrequency: PlayerSettingsService.FILTER_FREQUENCY_HPF_DEFAULT,
      enableLpf: false,
      lpfFrequency: PlayerSettingsService.FILTER_FREQUENCY_LPF_DEFAULT,
      matchFilterFrequencyToSpectrogram: false,
    };
    playerSettingService = PlayerSettingsService.fromDefaultSetting(
      pd,
      audioBuffer,
    );
    const analyzeSettingsService = AnalyzeSettingsService.fromDefaultSetting(
      {} as AnalyzeDefault,
      audioBuffer,
    );
    playerService = new PlayerService(
      audioContext,
      audioBuffer,
      playerSettingService,
      analyzeSettingsService,
    );
    playerComponent = new PlayerComponent(
      "#player",
      playerService,
      playerSettingService,
      { seekOnly: true },
    );
  });

  afterAll(() => {
    playerComponent.dispose();
    playerService.dispose();
  });

  test("seek-only player should have single custom seek track", () => {
    expect(document.querySelector(".userInputSeekBar")).toBeTruthy();
    expect(document.querySelector(".progressFill")).toBeTruthy();
    expect(document.querySelector(".seekBar")).toBeNull();
    expect(document.querySelector(".playButton")).toBeNull();
    expect(document.querySelector(".volumeBar")).toBeNull();
  });

  test("dispatch update-seekbar event when user change user-input-seek-bar", async () => {
    const detail = await waitEventForAction(
      () => {
        const userinputSeekbar = <HTMLInputElement>(
          document.querySelector(".userInputSeekBar")
        );
        userinputSeekbar.value = "50";
        userinputSeekbar.dispatchEvent(new Event("change"));
      },
      playerService,
      EventType.UPDATE_SEEKBAR,
    );
    expect(detail.value).toBeGreaterThanOrEqual(50);
  });

  test("update progress fill when seekbar value is updated", () => {
    const progressFill = document.querySelector(".progressFill") as HTMLElement;
    playerService.dispatchEvent(
      new CustomEvent(EventType.UPDATE_SEEKBAR, {
        detail: {
          value: 50,
        },
      }),
    );
    expect(progressFill.style.transform).toBe("scaleX(0.5)");
  });
});
