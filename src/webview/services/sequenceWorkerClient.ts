import type {
  SequenceAnalysisProgress,
  SequenceFeatureProfileWire,
} from "../../shared/sequenceFeatureCompute";

export interface SequenceWorkerResources {
  sequenceWorkerUri?: string;
  essentiaWasmUri?: string;
}

/** One isolated job. Cancellation terminates synchronous WASM as well as JS work. */
export class SequenceWorkerClient {
  private _abort = new AbortController();
  private _cancel?: () => void;
  public dispose(): void {
    this._abort.abort();
    this._cancel?.();
  }
  public async analyze(
    samples: Float32Array,
    sampleRate: number,
    hopSec: number,
    resources: SequenceWorkerResources,
    onProgress?: SequenceAnalysisProgress,
    harmonic = false,
  ): Promise<SequenceFeatureProfileWire> {
    // Bound resource loading too; a blocked fetch must not strand the UI.
    const timer = setTimeout(() => this.dispose(), 10 * 60 * 1000);
    try {
      const response = await fetch(resources.sequenceWorkerUri, {
        signal: this._abort.signal,
      });
      if (!response.ok) {
        throw new Error(`Cannot load sequence worker: ${response.status}`);
      }
      const source = await response.text();
      if (this._abort.signal.aborted) {
        throw new Error("Sequence analysis cancelled");
      }
      const url = URL.createObjectURL(
        new Blob([source], { type: "text/javascript" }),
      );
      let worker: Worker;
      try {
        worker = new Worker(url);
      } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
      }
      return await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (
          profile?: SequenceFeatureProfileWire,
          error?: Error,
        ) => {
          if (settled) {
            return;
          }
          settled = true;
          worker.terminate();
          URL.revokeObjectURL(url);
          this._cancel = undefined;
          if (error) {
            reject(error);
          } else {
            resolve(profile);
          }
        };
        this._cancel = () =>
          finish(
            undefined,
            new Error("Sequence analysis cancelled or timed out"),
          );
        worker.onerror = () =>
          finish(undefined, new Error("Sequence analysis worker failed"));
        worker.onmessageerror = () =>
          finish(undefined, new Error("Invalid sequence worker reply"));
        worker.onmessage = (event) => {
          const reply = event.data;
          if (reply?.kind === "progress") {
            onProgress?.(reply.percent);
          } else if (reply?.kind === "result" && reply.profile) {
            finish(reply.profile);
          } else {
            finish(
              undefined,
              new Error(reply?.error || "Invalid sequence worker reply"),
            );
          }
        };
        try {
          worker.postMessage(
            {
              samples: samples.buffer,
              sampleRate,
              hopSec,
              wasmUri: resources.essentiaWasmUri,
              harmonic,
            },
            [samples.buffer],
          );
        } catch (error) {
          finish(
            undefined,
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
