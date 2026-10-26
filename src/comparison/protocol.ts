import type {
  AnalysisJob,
  AnalysisReply,
} from "../webview/comparison/analysisProtocol";
/** Comparison panels have their own protocol; single-file IPC stays compatible. */
import type { HeadphoneEqPersistedState } from "../webview/types/headphoneEq";
import type {
  ExtSequenceFeaturesMessage,
  WebviewAutoEqRequestMessage,
  WebviewEqPresetOpMessage,
  WebviewSaveEqSettingsMessage,
  WebviewWriteEqProfileMessage,
  ExtAutoEqResultMessage,
  ExtEqPresetOpResultMessage,
} from "../message";
export type ComparisonEqRequest =
  | WebviewAutoEqRequestMessage
  | WebviewEqPresetOpMessage
  | WebviewSaveEqSettingsMessage
  | WebviewWriteEqProfileMessage;
export type ComparisonEqResponse =
  | ExtAutoEqResultMessage
  | ExtEqPresetOpResultMessage;
export interface ComparisonFile {
  id: string;
  uri: string;
  name: string;
  ext: string;
  revision: number;
}

export type ComparisonRequest =
  | { type: "compare.analysis"; job: AnalysisJob; revision: number }
  | { type: "compare.cancelAnalysis"; id: number }
  | { type: "compare.eq"; message: ComparisonEqRequest }
  | { type: "compare.ready" }
  | { type: "compare.onboardingSeen" }
  | { type: "compare.add" }
  | { type: "compare.read"; id: string; revision: number; offset: number }
  | { type: "compare.remove"; id: string }
  | { type: "compare.reload"; id: string }
  | { type: "compare.confirm"; requestId: string; detail: string }
  | {
      type: "compare.sequence";
      trackId: string;
      revision: number;
      requestId: string;
      samples: ArrayBufferLike;
      sampleRate: number;
      hopSec: number;
    }
  | { type: "compare.cancelSequence"; requestId: string }
  | { type: "compare.export"; requestId: string; samples: ArrayBuffer }
  | { type: "compare.error"; message: string };

export type ComparisonResponse =
  | { type: "compare.analysisResult"; reply: AnalysisReply }
  | { type: "compare.eqResult"; message: ComparisonEqResponse }
  | {
      type: "compare.files";
      files: ComparisonFile[];
      initial: boolean;
      onboardingSeen?: boolean;
      workerUri: string;
      sequenceWorkerUri?: string;
      essentiaWasmUri?: string;
      loudnessWorkerUri: string;
      loudnessWorkletUri: string;
      headphoneEq?: HeadphoneEqPersistedState;
    }
  | {
      type: "compare.data";
      id: string;
      revision: number;
      offset: number;
      length: number;
      samples: ArrayBuffer;
    }
  | { type: "compare.changed"; id: string }
  | { type: "compare.confirmed"; requestId: string; accepted: boolean }
  | { type: "compare.sequenceResult"; message: ExtSequenceFeaturesMessage }
  | {
      type: "compare.exported";
      requestId: string;
      path?: string;
      error?: string;
    }
  | {
      type: "compare.failure";
      id?: string;
      revision?: number;
      message: string;
    };
