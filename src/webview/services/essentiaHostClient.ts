import {
  WebviewMessageType,
  type ExtStftResultMessage,
  type PostMessage,
  type StftSettingsWireMessage,
} from "../../message";
import {
  stftWireToSpectrogram,
  type StftSettingsWire,
} from "../../shared/stftEssentiaCompute";

interface PendingStft {
  resolve: (spectrogram: number[][] | null) => void;
  reject: (err: Error) => void;
}

function stftCacheKey(
  ch: number,
  sampleRate: number,
  dataLength: number,
  settings: StftSettingsWire,
): string {
  return JSON.stringify({
    ch,
    sampleRate,
    dataLength,
    windowSize: settings.windowSize,
    windowType: settings.windowType,
    hopSize: settings.hopSize,
    minTime: settings.minTime,
    maxTime: settings.maxTime,
  });
}

/** Webview client for Essentia STFT in Extension Host (CSP-safe). */
export default class EssentiaHostClient {
  private static _pending = new Map<string, PendingStft>();
  private static _cache = new Map<string, number[][]>();

  constructor(private _postMessage: PostMessage) {}

  public static handleExtensionResponse(msg: ExtStftResultMessage): void {
    const pending = EssentiaHostClient._pending.get(msg.data.requestId);
    if (!pending) {
      return;
    }
    EssentiaHostClient._pending.delete(msg.data.requestId);
    if (msg.data.error) {
      pending.reject(new Error(msg.data.error));
      return;
    }
    if (!msg.data.wire || !msg.data.cacheKey) {
      pending.resolve(null);
      return;
    }
    const spectrogram = stftWireToSpectrogram(msg.data.wire);
    EssentiaHostClient._cache.set(msg.data.cacheKey, spectrogram);
    pending.resolve(spectrogram);
  }

  public static clearCache(): void {
    EssentiaHostClient._cache.clear();
  }

  public getCached(
    ch: number,
    sampleRate: number,
    dataLength: number,
    settings: StftSettingsWire,
  ): number[][] | undefined {
    return EssentiaHostClient._cache.get(
      stftCacheKey(ch, sampleRate, dataLength, settings),
    );
  }

  public requestStft(
    ch: number,
    channelData: Float32Array,
    sampleRate: number,
    settings: StftSettingsWire,
  ): Promise<number[][] | null> {
    const cacheKey = stftCacheKey(ch, sampleRate, channelData.length, settings);
    const cached = EssentiaHostClient._cache.get(cacheKey);
    if (cached) {
      return Promise.resolve(cached);
    }

    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `stft-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const samples = channelData.buffer.slice(
      channelData.byteOffset,
      channelData.byteOffset + channelData.byteLength,
    );

    return new Promise((resolve, reject) => {
      EssentiaHostClient._pending.set(requestId, { resolve, reject });
      this._postMessage({
        type: WebviewMessageType.ANALYZE_STFT,
        data: {
          requestId,
          cacheKey,
          channel: ch,
          samples,
          sampleRate,
          settings: settings as StftSettingsWireMessage,
        },
      });
    });
  }
}

export type { StftSettingsWire };
