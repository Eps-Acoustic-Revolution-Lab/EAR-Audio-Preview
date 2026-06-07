import {
  createAudioContext,
  MockAudioBuffer,
  waitEventForAction,
} from "../../__mocks__/helper";
import { EventType } from "../events";
import { PlayerDefault } from "../../config";
import EditExportSettingsService from "./editExportSettingsService";
import PlayerSettingsService from "./playerSettingsService";

describe("EditExportSettingsService", () => {
  let audioBuffer: AudioBuffer;

  beforeEach(() => {
    const ctx = createAudioContext(44100);
    audioBuffer = ctx.createBuffer(2, 44100, 44100);
  });

  test("defaults to full-file region", () => {
    const svc = EditExportSettingsService.create(audioBuffer);
    expect(svc.regionStartSec).toBe(0);
    expect(svc.regionEndSec).toBeCloseTo(audioBuffer.duration);
    expect(svc.listenMode).toBe("dry");
    expect(svc.channelMode).toBe("as_is");
    expect(svc.destination).toBe("source_dir");
  });

  test("listenMode defaults to dry and can switch to processed", () => {
    const svc = EditExportSettingsService.create(audioBuffer);
    svc.listenMode = "processed";
    expect(svc.listenMode).toBe("processed");
    svc.listenMode = "invalid" as "dry";
    expect(svc.listenMode).toBe("dry");
  });

  test("regionStartSec clamps and keeps valid range", () => {
    const svc = EditExportSettingsService.create(audioBuffer);
    svc.regionStartSec = 0.5;
    expect(svc.regionStartSec).toBe(0.5);
    expect(svc.regionEndSec).toBeCloseTo(audioBuffer.duration);
  });

  test("invalid region resets to full file", () => {
    const svc = EditExportSettingsService.create(audioBuffer);
    svc.setRegion(2, 1);
    expect(svc.regionStartSec).toBe(0);
    expect(svc.regionEndSec).toBeCloseTo(audioBuffer.duration);
  });

  test("importFromAnalyzer copies analyzer selection", () => {
    const svc = EditExportSettingsService.create(audioBuffer);
    svc.importFromAnalyzer(0.25, 0.75);
    expect(svc.regionStartSec).toBeCloseTo(0.25);
    expect(svc.regionEndSec).toBeCloseTo(0.75);
  });

  test("selectAll resets region", () => {
    const svc = EditExportSettingsService.create(audioBuffer);
    svc.setRegion(0.1, 0.2);
    svc.selectAll();
    expect(svc.regionStartSec).toBe(0);
    expect(svc.regionEndSec).toBeCloseTo(audioBuffer.duration);
  });

  test("EE_UPDATE_REGION_START event is sent", async () => {
    const svc = EditExportSettingsService.create(audioBuffer);
    const detail = await waitEventForAction(
      () => {
        svc.regionStartSec = 0.3;
      },
      svc,
      EventType.EE_UPDATE_REGION_START,
    );
    expect(detail.value).toBeCloseTo(0.3);
  });

  test("applyPlayerFilterSync skips dispatch when values unchanged", () => {
    const buf = new MockAudioBuffer(2, 44100, 44100) as unknown as AudioBuffer;
    const player = PlayerSettingsService.fromDefaultSetting(
      {} as PlayerDefault,
      buf,
    );
    const svc = EditExportSettingsService.create(buf);
    svc.syncFiltersFromPlayer = true;
    svc.enableHpf = player.enableHpf;
    svc.hpfHz = player.hpfFrequency;
    svc.enableLpf = player.enableLpf;
    svc.lpfHz = player.lpfFrequency;

    const listener = jest.fn();
    svc.addEventListener(EventType.EE_UPDATE_ENABLE_HPF, listener);
    svc.applyPlayerFilterSync(player);
    expect(listener).not.toHaveBeenCalled();
  });

  test("applyPlayerFilterSync copies player filter settings when enabled", () => {
    const buf = new MockAudioBuffer(2, 44100, 44100) as unknown as AudioBuffer;
    const playerDefaults: PlayerDefault = {
      volumeUnitDb: false,
      initialVolumeDb: 0,
      initialVolume: 100,
      enableSpacekeyPlay: true,
      enableSeekToPlay: true,
      enableHpf: true,
      hpfFrequency: 250,
      enableLpf: true,
      lpfFrequency: 8000,
      matchFilterFrequencyToSpectrogram: false,
    };
    const player = PlayerSettingsService.fromDefaultSetting(playerDefaults, buf);
    const svc = EditExportSettingsService.create(buf);
    svc.syncFiltersFromPlayer = true;
    svc.applyPlayerFilterSync(player);
    expect(svc.enableHpf).toBe(true);
    expect(svc.hpfHz).toBeCloseTo(250);
    expect(svc.enableLpf).toBe(true);
    expect(svc.lpfHz).toBeCloseTo(8000);
  });
});
