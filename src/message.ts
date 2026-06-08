import { Config } from "./config";
import type { SequenceFeatureProfileWire } from "./shared/sequenceFeatureCompute";
import type { StftSpectrogramWire } from "./shared/stftEssentiaCompute";

// Type of messages from Extension to Webview
export class ExtMessageType {
  public static readonly CONFIG = "CONFIG";
  public static readonly DATA = "DATA";
  public static readonly RELOAD = "RELOAD";
  public static readonly SEQUENCE_FEATURES = "SEQUENCE_FEATURES";
  public static readonly STFT_RESULT = "STFT_RESULT";

  public static isCONFIG(msg: ExtMessage): msg is ExtConfigMessage {
    return msg.type === ExtMessageType.CONFIG;
  }

  public static isDATA(msg: ExtMessage): msg is ExtDataMessage {
    return msg.type === ExtMessageType.DATA;
  }

  public static isRELOAD(msg: ExtMessage): msg is ExtReloadMessage {
    return msg.type === ExtMessageType.RELOAD;
  }

  public static isSequenceFeatures(
    msg: ExtMessage,
  ): msg is ExtSequenceFeaturesMessage {
    return msg.type === ExtMessageType.SEQUENCE_FEATURES;
  }

  public static isStftResult(msg: ExtMessage): msg is ExtStftResultMessage {
    return msg.type === ExtMessageType.STFT_RESULT;
  }
}

export type ExtMessage =
  | ExtConfigMessage
  | ExtDataMessage
  | ExtReloadMessage
  | ExtSequenceFeaturesMessage
  | ExtStftResultMessage;

export class ExtConfigMessage {
  type = ExtMessageType.CONFIG;
  data: Config;
}

export class ExtDataMessage {
  type = ExtMessageType.DATA;
  data: ExtDataMessageData;
}

export interface ExtDataMessageData {
  samples: ArrayBufferLike;
  start: number;
  end: number;
  wholeLength: number;
}

export class ExtReloadMessage {
  type = ExtMessageType.RELOAD;
}

export interface ExtSequenceFeaturesMessageData {
  requestId: string;
  profile?: SequenceFeatureProfileWire;
  error?: string;
}

export class ExtSequenceFeaturesMessage {
  type = ExtMessageType.SEQUENCE_FEATURES;
  data: ExtSequenceFeaturesMessageData;
}

export interface ExtStftResultMessageData {
  requestId: string;
  cacheKey?: string;
  wire?: StftSpectrogramWire;
  error?: string;
}

export class ExtStftResultMessage {
  type = ExtMessageType.STFT_RESULT;
  data: ExtStftResultMessageData;
}

// Type of messages from Webview to Extension
export class WebviewMessageType {
  public static readonly CONFIG = "CONFIG";
  public static readonly DATA = "DATA";
  public static readonly WRITE_WAV = "WRITE_WAV";
  public static readonly ERROR = "RELOAD";
  public static readonly SAVE_ANALYZE_UI = "SAVE_ANALYZE_UI";
  public static readonly ANALYZE_SEQUENCE_FEATURES = "ANALYZE_SEQUENCE_FEATURES";
  public static readonly ANALYZE_STFT = "ANALYZE_STFT";

  public static isCONFIG(msg: WebviewMessage): msg is WebviewConfigMessage {
    return msg.type === WebviewMessageType.CONFIG;
  }

  public static isDATA(msg: WebviewMessage): msg is WebviewDataMessage {
    return msg.type === WebviewMessageType.DATA;
  }

  public static isWriteWav(msg: WebviewMessage): msg is WebviewWriteWavMessage {
    return msg.type === WebviewMessageType.WRITE_WAV;
  }

  public static isERROR(msg: WebviewMessage): msg is WebviewErrorMessage {
    return msg.type === WebviewMessageType.ERROR;
  }

  public static isSaveAnalyzeUi(
    msg: WebviewMessage,
  ): msg is WebviewSaveAnalyzeUiMessage {
    return msg.type === WebviewMessageType.SAVE_ANALYZE_UI;
  }

  public static isAnalyzeSequenceFeatures(
    msg: WebviewMessage,
  ): msg is WebviewAnalyzeSequenceFeaturesMessage {
    return msg.type === WebviewMessageType.ANALYZE_SEQUENCE_FEATURES;
  }

  public static isAnalyzeStft(
    msg: WebviewMessage,
  ): msg is WebviewAnalyzeStftMessage {
    return msg.type === WebviewMessageType.ANALYZE_STFT;
  }
}

export type WebviewMessage =
  | WebviewConfigMessage
  | WebviewDataMessage
  | WebviewWriteWavMessage
  | WebviewErrorMessage
  | WebviewSaveAnalyzeUiMessage
  | WebviewAnalyzeSequenceFeaturesMessage
  | WebviewAnalyzeStftMessage;

export class WebviewConfigMessage {
  type = WebviewMessageType.CONFIG;
}

export class WebviewDataMessage {
  type = WebviewMessageType.DATA;
  data: WebviewDataMessageData;
}

export interface WebviewDataMessageData {
  start: number;
  end: number;
}

export class WebviewWriteWavMessage {
  type = WebviewMessageType.WRITE_WAV;
  data: WebviewWriteWavMessageData;
}

export type WriteWavDestination = "source_dir" | "workspace_root";

export interface WebviewWriteWavMessageData {
  filename: string;
  samples: ArrayBufferLike;
  destination?: WriteWavDestination;
}

export class WebviewErrorMessage {
  type = WebviewMessageType.ERROR;
  data: WebviewErrorMessageData;
}

export interface WebviewErrorMessageData {
  message: string;
}

export class WebviewSaveAnalyzeUiMessage {
  type = WebviewMessageType.SAVE_ANALYZE_UI;
  data: Record<string, unknown>;
}

export interface WebviewAnalyzeSequenceFeaturesMessageData {
  requestId: string;
  samples: ArrayBufferLike;
  sampleRate: number;
  hopSec: number;
}

export class WebviewAnalyzeSequenceFeaturesMessage {
  type = WebviewMessageType.ANALYZE_SEQUENCE_FEATURES;
  data: WebviewAnalyzeSequenceFeaturesMessageData;
}

export interface StftSettingsWireMessage {
  windowSize: number;
  windowType: string;
  hopSize: number;
  minTime: number;
  maxTime: number;
  minFrequency: number;
  maxFrequency: number;
}

export interface WebviewAnalyzeStftMessageData {
  requestId: string;
  cacheKey: string;
  channel: number;
  samples: ArrayBufferLike;
  sampleRate: number;
  settings: StftSettingsWireMessage;
}

export class WebviewAnalyzeStftMessage {
  type = WebviewMessageType.ANALYZE_STFT;
  data: WebviewAnalyzeStftMessageData;
}

// Type of post message funtion
export type PostMessage = (message: WebviewMessage) => void;
