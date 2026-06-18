import {
  WebviewMessageType,
  type ExtEqPresetOpResultMessage,
  type PostMessage,
} from "../../message";

type EqPresetOp =
  | "import"
  | "list"
  | "read"
  | "write_library";

interface PendingEqPreset {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `eqpreset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Webview client for workspace EQ preset file ops in Extension Host. */
export default class EqPresetHostClient {
  private static _pending = new Map<string, PendingEqPreset>();

  constructor(private _postMessage: PostMessage) {}

  public static handleExtensionResponse(
    msg: ExtEqPresetOpResultMessage,
  ): void {
    const pending = EqPresetHostClient._pending.get(msg.data.requestId);
    if (!pending) {
      return;
    }
    EqPresetHostClient._pending.delete(msg.data.requestId);
    if (msg.data.error) {
      pending.reject(new Error(msg.data.error));
      return;
    }
    pending.resolve(msg.data.payload);
  }

  private _request(op: EqPresetOp, payload?: unknown): Promise<unknown> {
    const requestId = newRequestId();
    return new Promise((resolve, reject) => {
      EqPresetHostClient._pending.set(requestId, { resolve, reject });
      this._postMessage({
        type: WebviewMessageType.EQ_PRESET_OP,
        data: { requestId, op, payload },
      });
    });
  }

  public importFile(): Promise<{ content: string; fileName: string }> {
    return this._request("import") as Promise<{
      content: string;
      fileName: string;
    }>;
  }

  public listWorkspacePresets(): Promise<{
    presets: Array<{ fileName: string; displayName: string }>;
    hasWorkspace: boolean;
  }> {
    return this._request("list") as Promise<{
      presets: Array<{ fileName: string; displayName: string }>;
      hasWorkspace: boolean;
    }>;
  }

  public readWorkspacePreset(fileName: string): Promise<unknown> {
    return this._request("read", { fileName });
  }

  public writeWorkspacePreset(profile: unknown): Promise<{ fileName: string }> {
    return this._request("write_library", { profile }) as Promise<{
      fileName: string;
    }>;
  }
}
