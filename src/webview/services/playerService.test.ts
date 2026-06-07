import { EventType } from "../events";
import {
  createAudioContext,
  wait,
  waitEventForAction,
} from "../../__mocks__/helper";
import PlayerService from "./playerService";
import { AnalyzeDefault, PlayerDefault } from "../../config";
import PlayerSettingsService from "./playerSettingsService";
import AnalyzeSettingsService from "./analyzeSettingsService";

describe("playerService", () => {
  let playerService: PlayerService;
  let playerSettingService: PlayerSettingsService;
  beforeAll(() => {
    const audioContext = createAudioContext(44100);
    const audioBuffer = audioContext.createBuffer(1, 44100 * 10, 44100);
    const pd = {} as PlayerDefault;
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
  });

  afterAll(() => {
    playerService.dispose();
  });

  test("play", async () => {
    const detail = await waitEventForAction(
      () => {
        playerService.play();
      },
      playerService,
      EventType.UPDATE_IS_PLAYING,
    );

    expect(detail.value).toBe(true);
  });

  test("tick", async () => {
    const detail = await waitEventForAction(
      () => {
        playerService.tick();
      },
      playerService,
      EventType.UPDATE_SEEKBAR,
    );

    expect(detail.value).toBeDefined();
  });

  test("pause", async () => {
    const detail = await waitEventForAction(
      () => {
        playerService.pause();
      },
      playerService,
      EventType.UPDATE_IS_PLAYING,
    );

    expect(detail.value).toBe(false);
  });

  test("pause does not move fixed playback cue; play restarts from cue", async () => {
    const cueSec = 2.5;
    playerService.setPlaybackPosition(cueSec);

    const startOffsets: number[] = [];
    const ctx = playerService.audioContext;
    const origCreateBufferSource = ctx.createBufferSource.bind(ctx);
    jest.spyOn(ctx, "createBufferSource").mockImplementation(() => {
      const source = origCreateBufferSource();
      const origStart = source.start.bind(source);
      jest
        .spyOn(source, "start")
        .mockImplementation((when?: number, offset?: number) => {
          startOffsets.push(offset ?? 0);
          origStart(when, offset);
        });
      return source;
    });

    playerService.play();
    await wait(30);
    playerService.pause();

    expect(playerService.playbackPosition).toBe(cueSec);

    playerService.play();
    expect(startOffsets.length).toBeGreaterThanOrEqual(2);
    expect(startOffsets[startOffsets.length - 1]).toBeCloseTo(cueSec, 5);

    jest.restoreAllMocks();
  });

  test("hearing protection mutes output without changing user volume", async () => {
    playerService.volume = 1;
    const detail = await waitEventForAction(
      () => {
        playerService.setHearingProtectionActive(true);
      },
      playerService,
      EventType.UPDATE_HEARING_PROTECTION,
    );
    expect(detail.active).toBe(true);
    expect(playerService.volume).toBe(1);
    expect(playerService.hearingProtectionActive).toBe(true);
    playerService.setHearingProtectionActive(false);
    expect(playerService.hearingProtectionActive).toBe(false);
  });

  test("setEditListenState toggles edit listen mode", () => {
    playerService.setEditListenState({
      active: true,
      mode: "dry",
      regionStart: 1,
      regionEnd: 5,
    });
    expect(playerService.editListenActive).toBe(true);
    playerService.setEditListenState({ active: false });
    expect(playerService.editListenActive).toBe(false);
  });
});
