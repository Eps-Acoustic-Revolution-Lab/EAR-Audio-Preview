import Service from "../service";
import { computeAdaptiveSequenceHopSec } from "../../shared/sequenceHop";
import {
  profileFromWire,
  type SequenceFeatureProfile,
  type SequenceAnalysisProgress,
} from "../../shared/sequenceFeatureCompute";
import {
  PostMessage,
  WebviewMessageType,
  type ExtSequenceFeaturesMessage,
} from "../../message";

export type { SequenceFeatureProfile, SequenceAnalysisProgress };

function monoDownmix(buffer: AudioBuffer): Float32Array {
  const ch0 = buffer.getChannelData(0);
  if (buffer.numberOfChannels < 2) {
    return ch0.slice();
  }
  const ch1 = buffer.getChannelData(1);
  const out = new Float32Array(ch0.length);
  for (let i = 0; i < out.length; i++) {
    out[i] = (ch0[i] + ch1[i]) * 0.5;
  }
  return out;
}

interface PendingRequest {
  resolve: (profile: SequenceFeatureProfile | null) => void;
  reject: (err: Error) => void;
  onProgress?: SequenceAnalysisProgress;
}

export default class SequenceFeatureService extends Service {
  private static _pending = new Map<string, PendingRequest>();

  private _audioBuffer: AudioBuffer;
  private _postMessage: PostMessage;
  private _profileCache: SequenceFeatureProfile | null = null;
  private _analyzePromise: Promise<SequenceFeatureProfile | null> | null =
    null;

  constructor(audioBuffer: AudioBuffer, postMessage: PostMessage) {
    super();
    this._audioBuffer = audioBuffer;
    this._postMessage = postMessage;
  }

  /** Called from webview message handler when extension returns features. */
  public static handleExtensionResponse(msg: ExtSequenceFeaturesMessage): void {
    const pending = SequenceFeatureService._pending.get(msg.data.requestId);
    if (!pending) {
      return;
    }
    SequenceFeatureService._pending.delete(msg.data.requestId);
    if (msg.data.error) {
      pending.reject(new Error(msg.data.error));
      return;
    }
    if (!msg.data.profile) {
      pending.resolve(null);
      return;
    }
    pending.resolve(profileFromWire(msg.data.profile));
  }

  public analyzeProfile(
    hopSec?: number,
    onProgress?: SequenceAnalysisProgress,
  ): Promise<SequenceFeatureProfile | null> {
    const effectiveHop =
      hopSec ??
      computeAdaptiveSequenceHopSec(
        this._audioBuffer.duration,
        this._audioBuffer.sampleRate,
      );
    if (this._profileCache) {
      return Promise.resolve(this._profileCache);
    }
    if (this._analyzePromise) {
      return this._analyzePromise;
    }

    this._analyzePromise = this._runAnalysis(effectiveHop, onProgress).finally(
      () => {
        this._analyzePromise = null;
      },
    );
    return this._analyzePromise;
  }

  private _runAnalysis(
    hopSec: number,
    onProgress?: SequenceAnalysisProgress,
  ): Promise<SequenceFeatureProfile | null> {
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `seq-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const mono = monoDownmix(this._audioBuffer);
    const samples = mono.buffer.slice(
      mono.byteOffset,
      mono.byteOffset + mono.byteLength,
    );

    return new Promise((resolve, reject) => {
      SequenceFeatureService._pending.set(requestId, {
        resolve: (profile) => {
          this._profileCache = profile;
          resolve(profile);
        },
        reject,
        onProgress,
      });

      this._postMessage({
        type: WebviewMessageType.ANALYZE_SEQUENCE_FEATURES,
        data: {
          requestId,
          samples,
          sampleRate: this._audioBuffer.sampleRate,
          hopSec,
        },
      });
    });
  }
}