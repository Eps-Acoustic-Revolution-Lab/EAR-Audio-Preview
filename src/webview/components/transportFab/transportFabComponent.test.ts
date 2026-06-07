import { MockAudioBuffer } from "../../../__mocks__/helper";
import { EventType } from "../../events";
import { createAudioContext } from "../../../__mocks__/helper";
import PlayerService from "../../services/playerService";
import PlayerSettingsService from "../../services/playerSettingsService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import { AnalyzeDefault } from "../../../config";
import TransportFabComponent from "./transportFabComponent";

describe("transportFabComponent", () => {
  let transportFab: TransportFabComponent;
  let playerService: PlayerService;

  beforeAll(() => {
    document.body.innerHTML = '<div id="transportDock"></div>';
    const audioContext = createAudioContext(44100);
    const audioBuffer = new MockAudioBuffer(
      44100,
      2,
      44100,
    ) as unknown as AudioBuffer;
    const playerSettings = PlayerSettingsService.fromDefaultSetting(
      {
        volumeUnitDb: false,
        initialVolumeDb: 0,
        initialVolume: 1,
        enableSpacekeyPlay: false,
        enableSeekToPlay: true,
        enableHpf: false,
        hpfFrequency: PlayerSettingsService.FILTER_FREQUENCY_HPF_DEFAULT,
        enableLpf: false,
        lpfFrequency: PlayerSettingsService.FILTER_FREQUENCY_LPF_DEFAULT,
        matchFilterFrequencyToSpectrogram: false,
      },
      audioBuffer,
    );
    const analyzeSettings = AnalyzeSettingsService.fromDefaultSetting(
      {} as AnalyzeDefault,
      audioBuffer,
    );
    playerService = new PlayerService(
      audioContext,
      audioBuffer,
      playerSettings,
      analyzeSettings,
    );
    transportFab = new TransportFabComponent(
      "#transportDock",
      playerService,
      playerSettings,
      analyzeSettings,
    );
    transportFab.setLoading(false);
  });

  afterAll(() => {
    transportFab.dispose();
    playerService.dispose();
  });

  test("renders knob and expand chip", () => {
    expect(document.querySelector(".earEqKnob")).toBeTruthy();
    expect(document.querySelector(".js-transportExpand")).toBeTruthy();
  });

  test("expand chip opens popover", async () => {
    const chip = document.querySelector(
      ".js-transportExpand",
    ) as HTMLButtonElement;
    chip.click();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    const popover = document.getElementById("transportPopover");
    expect(popover?.classList.contains("transportPopover--open")).toBe(true);
    transportFab.close();
  });

  test("panel play toggles playback", () => {
    if (playerService.isPlaying) {
      playerService.pause();
    }
    const play = document.querySelector(
      ".js-transportPanelPlay",
    ) as HTMLButtonElement;
    play.dispatchEvent(new MouseEvent(EventType.CLICK));
    expect(playerService.isPlaying).toBe(true);
    play.dispatchEvent(new MouseEvent(EventType.CLICK));
    expect(playerService.isPlaying).toBe(false);
  });
});
