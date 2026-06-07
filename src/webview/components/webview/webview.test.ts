import { ExtMessageType, WebviewMessageType } from "../../../message";
import { IAudioDecoder } from "../../decoders/audioDecoderInterface";
import Webview from "./webview";
import {
  waitVSCodeMessageForAction,
  postMessageFromWebview,
  postMessageFromExt,
  createAudioContext,
  wait,
} from "../../../__mocks__/helper";
import PlayerSettingsService from "../../services/playerSettingsService";

describe("webview", () => {
  let webview: Webview;

  beforeAll(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterAll(() => {
    webview.dispose();
  });

  test("request config after init", async () => {
    const createDecoder = async () => {
      return new Promise<IAudioDecoder>((resolve) => {
        resolve({
          numChannels: 1,
          sampleRate: 44100,
          fileSize: 500001,
          format: "s16",
          encoding: "pcm_s16le",
          bitDepth: 16,
          duration: 1,
          samples: [new Float32Array(44100)],
          length: 44100,
          readAudioInfo: () => {},
          decode: () => {},
          dispose: () => {},
        } as IAudioDecoder);
      });
    };

    const msg = await waitVSCodeMessageForAction(() => {
      webview = new Webview(
        postMessageFromWebview,
        createAudioContext,
        createDecoder,
      );
    });
    expect(msg.type).toBe(WebviewMessageType.CONFIG);
  });

  test("root layout includes workspace strip, wave band, settings overlay, and FAB", () => {
    expect(document.getElementById("stickyHeaderChrome")).not.toBeNull();
    expect(document.getElementById("transportDock")).not.toBeNull();
    expect(document.getElementById("transportChrome")).toBeNull();
    expect(document.getElementById("liveMonitoringBar")).toBeNull();
    expect(document.getElementById("infoTable")).toBeNull();
    expect(document.getElementById("workspaceStrip")).not.toBeNull();
    expect(document.getElementById("graphDeck")).not.toBeNull();
    expect(document.getElementById("waveBand")).not.toBeNull();
    expect(document.getElementById("settingsDock")).not.toBeNull();
    expect(document.getElementById("metaPopoverMount")).not.toBeNull();
    expect(document.getElementById("settingsOverlayMount")).not.toBeNull();
    expect(document.getElementById("settingsFab")).not.toBeNull();
    expect(document.querySelector(".settingsDock__fabRingBar")).not.toBeNull();
    expect(document.querySelector(".js-settingsFabPercent")).not.toBeNull();
    expect(document.querySelector(".js-openSettings")).not.toBeNull();
    expect(document.getElementById("settingsSheet")).toBeNull();
  });

  test("request data after getting config", async () => {
    const msg = await waitVSCodeMessageForAction(() => {
      postMessageFromExt({
        type: ExtMessageType.CONFIG,
        data: {
          autoAnalyze: false,
          playerDefault: {
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
          },
          analyzeDefault: {
            waveformVisible: undefined,
            waveformVerticalScale: undefined,
            spectrogramVisible: undefined,
            spectrogramVerticalScale: undefined,
            windowSizeIndex: undefined,
            minAmplitude: undefined,
            maxAmplitude: undefined,
            minFrequency: undefined,
            maxFrequency: undefined,
            spectrogramAmplitudeRange: undefined,
            frequencyScale: undefined,
            melFilterNum: undefined,
          },
        },
      });
    });
    expect(msg).toEqual({
      type: WebviewMessageType.DATA,
      data: { start: 0, end: 500000 },
    });
  });

  test("request next data after getting data", async () => {
    const msg = await waitVSCodeMessageForAction(() => {
      postMessageFromExt({
        type: ExtMessageType.DATA,
        data: {
          start: 0,
          end: 500000,
          wholeLength: 500001,
          samples: new Uint8Array(500000),
        },
      });
    });
    expect(msg).toEqual({
      type: WebviewMessageType.DATA,
      data: { start: 500000, end: 3500000 },
    });
  });

  test("init audio meta popover after finish receiving data", async () => {
    postMessageFromExt({
      type: ExtMessageType.DATA,
      data: {
        start: 500000,
        end: 3500000,
        wholeLength: 500001,
        samples: new Uint8Array(1),
      },
    });
    await wait(100);
    expect(document.getElementById("audioMeta")?.innerHTML).not.toBe("");
    expect(
      document.querySelector(".js-audioMeta-encoding .audioMeta__value")
        ?.textContent,
    ).toBe("pcm_s16le");
    const fab = document.getElementById("settingsFab") as HTMLButtonElement;
    expect(fab.disabled).toBe(false);
    expect(fab.getAttribute("aria-busy")).toBe("false");
    expect(fab.getAttribute("title")).toBe("Audio file info");
  });

  test("init player after finish receiving data", async () => {
    expect(document.getElementById("player")?.innerHTML).not.toBe("");
  });

  test("init wave band after finish receiving data", async () => {
    const waveBand = document.getElementById("waveBand");
    expect(
      waveBand?.querySelectorAll(".waveBand__channel").length,
    ).toBeGreaterThan(0);
  });

  test("reload webview", async () => {
    const msg = await waitVSCodeMessageForAction(() => {
      postMessageFromExt({ type: ExtMessageType.RELOAD });
    });
    expect(msg).toEqual({ type: WebviewMessageType.CONFIG });
  });

  test("audio meta is empty after reload", async () => {
    expect(document.getElementById("audioMeta")?.innerHTML).toBe("");
  });

  test("transport dock mount is present after reload", async () => {
    expect(document.getElementById("transportDock")).not.toBeNull();
  });

  test("wave band channels cleared after reload", async () => {
    expect(
      document.querySelector("#waveBand .waveBand__channels")?.innerHTML,
    ).toBe("");
  });
});

describe("webview error handling", () => {
  let webview: Webview;

  beforeAll(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterAll(() => {
    webview.dispose();
  });

  test("send error message", async () => {
    const readAudioInfo: () => void = () => {
      throw new Error("error in webview");
    };
    const createDecoder = async () => {
      return new Promise<IAudioDecoder>((resolve) => {
        resolve({
          numChannels: 1,
          sampleRate: 44100,
          fileSize: 500001,
          format: "s16",
          encoding: "pcm_s16le",
          bitDepth: 16,
          duration: 1,
          samples: [new Float32Array(44100)],
          length: 44100,
          readAudioInfo: readAudioInfo,
          decode: () => {},
          dispose: () => {},
        } as IAudioDecoder);
      });
    };

    // init webview
    await waitVSCodeMessageForAction(() => {
      webview = new Webview(
        postMessageFromWebview,
        createAudioContext,
        createDecoder,
      );
    });
    // get config
    await waitVSCodeMessageForAction(() => {
      postMessageFromExt({
        type: ExtMessageType.CONFIG,
        data: {
          autoAnalyze: false,
          playerDefault: {
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
          },
          analyzeDefault: {
            waveformVisible: undefined,
            waveformVerticalScale: undefined,
            spectrogramVisible: undefined,
            spectrogramVerticalScale: undefined,
            windowSizeIndex: undefined,
            minAmplitude: undefined,
            maxAmplitude: undefined,
            minFrequency: undefined,
            maxFrequency: undefined,
            spectrogramAmplitudeRange: undefined,
            frequencyScale: undefined,
            melFilterNum: undefined,
          },
        },
      });
    });
    // get data
    await waitVSCodeMessageForAction(() => {
      postMessageFromExt({
        type: ExtMessageType.DATA,
        data: {
          start: 0,
          end: 500000,
          wholeLength: 500001,
          samples: new Uint8Array(500000),
        },
      });
    });
    // decode after receiving data
    const msg = await waitVSCodeMessageForAction(() => {
      postMessageFromExt({
        type: ExtMessageType.DATA,
        data: {
          start: 500000,
          end: 3500000,
          wholeLength: 500001,
          samples: new Uint8Array(1),
        },
      });
    });

    expect(msg).toEqual({
      type: WebviewMessageType.ERROR,
      data: { message: "error in webview" },
    });
  });
});
