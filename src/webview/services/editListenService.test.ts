import { createAudioContext, waitEventForAction } from "../../__mocks__/helper";
import { AnalyzeDefault, PlayerDefault } from "../../config";
import { EventType } from "../events";
import AnalyzeSettingsService from "./analyzeSettingsService";
import EditExportSettingsService from "./editExportSettingsService";
import EditListenService from "./editListenService";
import PlayerService from "./playerService";
import PlayerSettingsService from "./playerSettingsService";

describe("EditListenService", () => {
  let audioBuffer: AudioBuffer;
  let analyzeSettings: AnalyzeSettingsService;
  let editExportSettings: EditExportSettingsService;
  let playerSettings: PlayerSettingsService;
  let playerService: PlayerService;
  let editListen: EditListenService;

  beforeEach(() => {
    const ctx = createAudioContext(44100);
    audioBuffer = ctx.createBuffer(2, 44100 * 10, 44100);
    analyzeSettings = AnalyzeSettingsService.fromDefaultSetting(
      {} as AnalyzeDefault,
      audioBuffer,
    );
    analyzeSettings.minTime = 0.5;
    analyzeSettings.maxTime = 2.5;
    editExportSettings = EditExportSettingsService.create(audioBuffer);
    editExportSettings.setRegion(1, 3);
    playerSettings = PlayerSettingsService.fromDefaultSetting(
      {} as PlayerDefault,
      audioBuffer,
    );
    playerService = new PlayerService(
      ctx,
      audioBuffer,
      playerSettings,
      analyzeSettings,
    );
    editListen = new EditListenService(
      audioBuffer,
      editExportSettings,
      playerSettings,
      analyzeSettings,
      playerService,
    );
  });

  afterEach(() => {
    editListen.leave();
    playerService.dispose();
    editListen.dispose();
  });

  test("enter syncs analyze range and activates player edit listen", () => {
    editListen.enter();
    expect(editListen.active).toBe(true);
    expect(analyzeSettings.minTime).toBeCloseTo(1);
    expect(analyzeSettings.maxTime).toBeCloseTo(3);
    expect(playerService.editListenActive).toBe(true);
  });

  test("leave restores analyze snapshot", () => {
    editListen.enter();
    analyzeSettings.minTime = 9;
    editListen.leave();
    expect(analyzeSettings.minTime).toBeCloseTo(0.5);
    expect(analyzeSettings.maxTime).toBeCloseTo(2.5);
    expect(playerService.editListenActive).toBe(false);
  });

  test("onRegionChanged updates analyze range and playback cue", () => {
    editListen.enter();
    editListen.onRegionChanged(0.2, 0.8);
    expect(analyzeSettings.minTime).toBeCloseTo(0.2);
    expect(analyzeSettings.maxTime).toBeCloseTo(0.8);
    expect(playerService.playbackPosition).toBeCloseTo(0.2);
  });

  test("listen mode change dispatches event", async () => {
    const detail = await waitEventForAction(
      () => {
        editExportSettings.listenMode = "processed";
      },
      editExportSettings,
      EventType.EE_UPDATE_LISTEN_MODE,
    );
    expect(detail.value).toBe("processed");
  });

  test("region change pauses playback without auto-resuming", async () => {
    editListen.enter();
    playerService.play();
    expect(playerService.isPlaying).toBe(true);

    const playSpy = jest.spyOn(playerService, "play");
    editExportSettings.setRegion(2, 4);
    await new Promise((r) => setTimeout(r, 0));

    expect(playerService.isPlaying).toBe(false);
    expect(playSpy).not.toHaveBeenCalled();
    playSpy.mockRestore();
  });

  test("listen mode change pauses playback without auto-resuming", async () => {
    editListen.enter();
    playerService.play();
    expect(playerService.isPlaying).toBe(true);

    const playSpy = jest.spyOn(playerService, "play");
    editExportSettings.listenMode = "processed";
    await new Promise((r) => setTimeout(r, 0));

    expect(playerService.isPlaying).toBe(false);
    expect(playSpy).not.toHaveBeenCalled();
    playSpy.mockRestore();
  });
});
