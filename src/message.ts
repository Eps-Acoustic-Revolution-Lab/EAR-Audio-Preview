import { Config } from "./config";
import type { HeadphoneEqPersistedState } from "./webview/types/headphoneEq";
import type { SequenceFeatureProfileWire } from "./shared/sequenceFeatureCompute";
import type { StftSpectrogramWire } from "./shared/stftEssentiaCompute";

// Type of messages from Extension to Webview
export class ExtMessageType {
  public static readonly CONFIG = "CONFIG";
  public static readonly DATA = "DATA";
  public static readonly RELOAD = "RELOAD";
  public static readonly SEQUENCE_FEATURES = "SEQUENCE_FEATURES";
  public static readonly STFT_RESULT = "STFT_RESULT";
  public static readonly AUTOEQ_RESULT = "AUTOEQ_RESULT";
  public static readonly EQ_PRESET_OP_RESULT = "EQ_PRESET_OP_RESULT";

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

  public static isAutoEqResult(msg: ExtMessage): msg is ExtAutoEqResultMessage {
    return msg.type === ExtMessageType.AUTOEQ_RESULT;
  }

  public static isEqPresetOpResult(
    msg: ExtMessage,
  ): msg is ExtEqPresetOpResultMessage {
    return msg.type === ExtMessageType.EQ_PRESET_OP_RESULT;
  }
}

export type ExtMessage =
  | ExtConfigMessage
  | ExtDataMessage
  | ExtReloadMessage
  | ExtSequenceFeaturesMessage
  | ExtStftResultMessage
  | ExtAutoEqResultMessage
  | ExtEqPresetOpResultMessage;

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

export type AutoEqRequestEndpoint = "entries" | "targets" | "equalize";

export interface AutoEqEqualizeWireBody {
  name: string;
  source: string;
  rig: string;
  target: string;
  fs: number;
}

export interface WebviewAutoEqRequestMessageData {
  requestId: string;
  endpoint: AutoEqRequestEndpoint;
  body?: AutoEqEqualizeWireBody;
}

export class WebviewAutoEqRequestMessage {
  type = WebviewMessageType.AUTOEQ_REQUEST;
  data: WebviewAutoEqRequestMessageData;
}

export interface ExtAutoEqResultMessageData {
  requestId: string;
  endpoint: AutoEqRequestEndpoint;
  payload?: unknown;
  error?: string;
}

export class ExtAutoEqResultMessage {
  type = ExtMessageType.AUTOEQ_RESULT;
  data: ExtAutoEqResultMessageData;
}

export type EqPresetOp = "import" | "list" | "read" | "write_library";

export interface ExtEqPresetOpResultMessageData {
  requestId: string;
  payload?: unknown;
  error?: string;
}

export class ExtEqPresetOpResultMessage {
  type = ExtMessageType.EQ_PRESET_OP_RESULT;
  data: ExtEqPresetOpResultMessageData;
}

// Type of messages from Webview to Extension
export class WebviewMessageType {
  public static readonly CONFIG = "CONFIG";
  public static readonly DATA = "DATA";
  public static readonly WRITE_WAV = "WRITE_WAV";
  public static readonly ERROR = "ERROR";
  public static readonly SAVE_ANALYZE_UI = "SAVE_ANALYZE_UI";
  public static readonly ANALYZE_SEQUENCE_FEATURES =
    "ANALYZE_SEQUENCE_FEATURES";
  public static readonly ANALYZE_STFT = "ANALYZE_STFT";
  public static readonly SAVE_EQ_SETTINGS = "SAVE_EQ_SETTINGS";
  public static readonly WRITE_EQ_PROFILE = "WRITE_EQ_PROFILE";
  public static readonly AUTOEQ_REQUEST = "AUTOEQ_REQUEST";
  public static readonly EQ_PRESET_OP = "EQ_PRESET_OP";

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

  public static isSaveEqSettings(
    msg: WebviewMessage,
  ): msg is WebviewSaveEqSettingsMessage {
    return msg.type === WebviewMessageType.SAVE_EQ_SETTINGS;
  }

  public static isWriteEqProfile(
    msg: WebviewMessage,
  ): msg is WebviewWriteEqProfileMessage {
    return msg.type === WebviewMessageType.WRITE_EQ_PROFILE;
  }

  public static isAutoEqRequest(
    msg: WebviewMessage,
  ): msg is WebviewAutoEqRequestMessage {
    return msg.type === WebviewMessageType.AUTOEQ_REQUEST;
  }

  public static isEqPresetOp(
    msg: WebviewMessage,
  ): msg is WebviewEqPresetOpMessage {
    return msg.type === WebviewMessageType.EQ_PRESET_OP;
  }
}

export type WebviewMessage =
  | WebviewConfigMessage
  | WebviewDataMessage
  | WebviewWriteWavMessage
  | WebviewErrorMessage
  | WebviewSaveAnalyzeUiMessage
  | WebviewAnalyzeSequenceFeaturesMessage
  | WebviewAnalyzeStftMessage
  | WebviewSaveEqSettingsMessage
  | WebviewWriteEqProfileMessage
  | WebviewAutoEqRequestMessage
  | WebviewEqPresetOpMessage;

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

export class WebviewSaveEqSettingsMessage {
  type = WebviewMessageType.SAVE_EQ_SETTINGS;
  data: HeadphoneEqPersistedState;
}

export class WebviewWriteEqProfileMessage {
  type = WebviewMessageType.WRITE_EQ_PROFILE;
  data: HeadphoneEqPersistedState;
}

export interface WebviewEqPresetOpMessageData {
  requestId: string;
  op: EqPresetOp;
  payload?: unknown;
}

export class WebviewEqPresetOpMessage {
  type = WebviewMessageType.EQ_PRESET_OP;
  data: WebviewEqPresetOpMessageData;
}

// Type of post message funtion
export type PostMessage = (message: WebviewMessage) => void;
