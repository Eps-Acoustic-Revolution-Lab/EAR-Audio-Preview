import {
  SequenceWorkerClient,
  type SequenceWorkerResources,
} from "./sequenceWorkerClient";
import { PageRpcClient } from "./pageRpcClient";
import Service from "../service";
import { computeAdaptiveSequenceHopSec } from "../../shared/sequenceHop";
import {
  profileFromWire,
  type SequenceFeatureProfile,
  type SequenceAnalysisProgress,
  type SequenceFeatureProfileWire,
} from "../../shared/sequenceFeatureCompute";
import {
  WebviewMessageType,
  ExtMessageType,
  type PostMessage,
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

export default class SequenceFeatureService extends Service {
  private _workers = new Set<SequenceWorkerClient>();
  private _requestIds = new Set<string>();
  private _harmonicCache: SequenceFeatureProfile | null = null;
  private _harmonicPromise: Promise<SequenceFeatureProfile | null> | null =
    null;
  private _profileCache: SequenceFeatureProfile | null = null;
  private _analyzePromise: Promise<SequenceFeatureProfile | null> | null = null;

  constructor(
    private _audioBuffer: AudioBuffer,
    private _rpc: PageRpcClient,
    private _send?: PostMessage,
    private _resources: SequenceWorkerResources = {},
  ) {
    super();
  }

  public analyzeProfile(
    hopSec?: number,
    onProgress?: SequenceAnalysisProgress,
  ): Promise<SequenceFeatureProfile | null> {
    if (this._isDisposed) {
      return Promise.resolve(null);
    }
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

    this._analyzePromise = this._runAnalysis(
      effectiveHop,
      false,
      onProgress,
    ).finally(() => {
      this._analyzePromise = null;
    });
    return this._analyzePromise;
  }

  public analyzeHarmonics(): Promise<SequenceFeatureProfile | null> {
    if (this._isDisposed) {
      return Promise.resolve(null);
    }
    if (this._harmonicCache) {
      return Promise.resolve(this._harmonicCache);
    }
    if (this._harmonicPromise) {
      return this._harmonicPromise;
    }
    this._harmonicPromise = this._runAnalysis(0.05, true)
      .then((profile) => {
        if (profile?.harmonic) {
          this._harmonicCache = profile;
        }
        return profile;
      })
      .finally(() => {
        this._harmonicPromise = null;
      });
    return this._harmonicPromise;
  }

  private async _runAnalysis(
    hopSec: number,
    harmonic = false,
    onProgress?: SequenceAnalysisProgress,
  ): Promise<SequenceFeatureProfile | null> {
    if (this._resources.sequenceWorkerUri && this._resources.essentiaWasmUri) {
      const worker = new SequenceWorkerClient();
      this._workers.add(worker);
      try {
        const value = await worker.analyze(
          monoDownmix(this._audioBuffer),
          this._audioBuffer.sampleRate,
          hopSec,
          this._resources,
          onProgress,
          harmonic,
        );
        if (this._isDisposed) {
          return null;
        }
        const profile = profileFromWire(value);
        if (!harmonic) {
          this._profileCache = profile;
        }
        return profile;
      } catch (error) {
        if (this._isDisposed) {
          return null;
        }
        if (harmonic) {
          throw error;
        }
        console.warn(
          "[sequenceFeatureService] Worker unavailable; using host fallback",
          error,
        );
      } finally {
        worker.dispose();
        this._workers.delete(worker);
      }
    }
    if (this._isDisposed) {
      return null;
    }
    if (harmonic) {
      throw new Error(
        "Harmonic analysis requires the background worker. Reload the audio editor and try again.",
      );
    }
    const mono = monoDownmix(this._audioBuffer);
    let requestId = "";
    return this._rpc
      .request(
        ExtMessageType.SEQUENCE_FEATURES,
        (id) => {
          requestId = id;
          this._requestIds.add(id);
          return {
            type: WebviewMessageType.ANALYZE_SEQUENCE_FEATURES,
            data: {
              requestId: id,
              samples: mono.buffer,
              sampleRate: this._audioBuffer.sampleRate,
              hopSec,
              ...(harmonic ? { harmonic: true } : {}),
            },
          };
        },
        10 * 60 * 1000,
        () => this._rpc.postCancellation(requestId, this._send),
        this._send,
      )
      .then((value) => {
        if (this._isDisposed || !value) {
          return null;
        }
        const profile = profileFromWire(value as SequenceFeatureProfileWire);
        if (!harmonic) {
          this._profileCache = profile;
        }
        return profile;
      })
      .catch((error) => {
        if (this._isDisposed) {
          return null;
        }
        throw error;
      })
      .finally(() => this._requestIds.delete(requestId));
  }

  public dispose(): void {
    super.dispose();
    for (const worker of this._workers) {
      worker.dispose();
    }
    this._workers.clear();
    for (const id of this._requestIds) {
      this._rpc.cancel(id);
    }
    this._requestIds.clear();
    this._profileCache = null;
    this._harmonicCache = null;
  }
}
