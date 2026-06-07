import { Config } from "./config";

// Type of messages from Extension to Webview
export class ExtMessageType {
  public static readonly CONFIG = "CONFIG";
  public static readonly DATA = "DATA";
  public static readonly RELOAD = "RELOAD";

  public static isCONFIG(msg: ExtMessage): msg is ExtConfigMessage {
    return msg.type === ExtMessageType.CONFIG;
  }

  public static isDATA(msg: ExtMessage): msg is ExtDataMessage {
    return msg.type === ExtMessageType.DATA;
  }

  public static isRELOAD(msg: ExtMessage): msg is ExtReloadMessage {
    return msg.type === ExtMessageType.RELOAD;
  }
}

export type ExtMessage = ExtConfigMessage | ExtDataMessage | ExtReloadMessage;

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

// Type of messages from Webview to Extension
export class WebviewMessageType {
  public static readonly CONFIG = "CONFIG";
  public static readonly DATA = "DATA";
  public static readonly WRITE_WAV = "WRITE_WAV";
  public static readonly ERROR = "RELOAD";
  public static readonly SAVE_ANALYZE_UI = "SAVE_ANALYZE_UI";

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
}

export type WebviewMessage =
  | WebviewConfigMessage
  | WebviewDataMessage
  | WebviewWriteWavMessage
  | WebviewErrorMessage
  | WebviewSaveAnalyzeUiMessage;

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

// Type of post message funtion
export type PostMessage = (message: WebviewMessage) => void;
