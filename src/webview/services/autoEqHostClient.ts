import {
  WebviewMessageType,
  type ExtAutoEqResultMessage,
  type PostMessage,
} from "../../message";
import type { AutoEqHostRequest } from "./autoEqApiClient";

interface PendingAutoEq {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `autoeq-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Webview client for AutoEq API in Extension Host (CORS-safe). */
export default class AutoEqHostClient {
  private static _pending = new Map<string, PendingAutoEq>();

  constructor(private _postMessage: PostMessage) {}

  public static handleExtensionResponse(msg: ExtAutoEqResultMessage): void {
    const pending = AutoEqHostClient._pending.get(msg.data.requestId);
    if (!pending) {
      return;
    }
    AutoEqHostClient._pending.delete(msg.data.requestId);
    if (msg.data.error) {
      pending.reject(new Error(msg.data.error));
      return;
    }
    pending.resolve(msg.data.payload);
  }

  public request(req: AutoEqHostRequest): Promise<unknown> {
    const requestId = newRequestId();
    return new Promise((resolve, reject) => {
      AutoEqHostClient._pending.set(requestId, { resolve, reject });
      this._postMessage({
        type: WebviewMessageType.AUTOEQ_REQUEST,
        data: {
          requestId,
          endpoint: req.endpoint,
          body: req.body,
        },
      });
    });
  }
}
