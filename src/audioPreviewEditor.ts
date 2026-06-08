import * as path from "path";
import * as vscode from "vscode";
import { Disposable, disposeAll } from "./dispose";
import { getNonce } from "./util";
import { AnalyzeDefault, PlayerDefault } from "./config";
import {
  ExtMessage,
  ExtMessageType,
  WebviewMessage,
  WebviewMessageType,
} from "./message";
import { analyzeSequenceFeaturesInHost } from "./extensionHost/sequenceFeatureHost";
import { analyzeStftInHost } from "./extensionHost/stftHost";

const analyzeUiCacheKey = "earAudioPreview.analyzeUiCache.v1";

class AudioPreviewDocument extends Disposable implements vscode.CustomDocument {
  static async create(
    uri: vscode.Uri,
    backupId: string | undefined,
  ): Promise<AudioPreviewDocument | PromiseLike<AudioPreviewDocument>> {
    // If we have a backup, read that. Otherwise read the resource from the workspace
    const dataFile =
      typeof backupId === "string" ? vscode.Uri.parse(backupId) : uri;
    const data = await AudioPreviewDocument.readFile(dataFile);
    return new AudioPreviewDocument(uri, data);
  }

  private static async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    if (uri.scheme === "untitled") {
      return new Uint8Array();
    }
    return vscode.workspace.fs.readFile(uri);
  }

  private readonly _uri: vscode.Uri;
  private _documentData: Uint8Array;
  public get documentData() {
    return this._documentData;
  }
  private _fsWatcher: vscode.FileSystemWatcher;

  private constructor(uri: vscode.Uri, initialContent: Uint8Array) {
    super();
    this._uri = uri;
    this._documentData = initialContent;
    this._fsWatcher = vscode.workspace.createFileSystemWatcher(
      uri.fsPath,
      true,
      false,
      true,
    );
    this.onDidChange = this._fsWatcher.onDidChange;
  }

  public get uri() {
    return this._uri;
  }

  public onDidChange: vscode.Event<vscode.Uri>;

  public async reload() {
    this._documentData = await AudioPreviewDocument.readFile(this.uri);
  }

  private readonly _onDidDispose = this._register(
    new vscode.EventEmitter<void>(),
  );
  public readonly onDidDispose = this._onDidDispose.event;

  /**
   * Called by VS Code when there are no more references to the document.
   *
   * This happens when all editors for it have been closed.
   */
  dispose(): void {
    this._onDidDispose.fire();
    super.dispose();
  }
}

export class AudioPreviewEditorProvider
  implements vscode.CustomReadonlyEditorProvider
{
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      AudioPreviewEditorProvider.viewType,
      new AudioPreviewEditorProvider(context),
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      },
    );
  }

  private static readonly viewType = "earAudioPreview.audioPreview";

  private readonly webviews = new WebviewCollection();

  constructor(private readonly _context: vscode.ExtensionContext) {}

  private buildWebviewConfig(document: AudioPreviewDocument): {
    autoAnalyze: boolean;
    playerDefault: PlayerDefault;
    analyzeDefault: AnalyzeDefault;
    fileExt: string;
    fileName: string;
  } {
    const config = vscode.workspace.getConfiguration("EarAudioPreview");
    const fileExt = document.uri.fsPath.split(".").pop()?.toLowerCase() ?? "";
    const workspaceAnalyze =
      (config.get("analyzeDefault") as AnalyzeDefault) ??
      ({} as AnalyzeDefault);
    let analyzeDefault = { ...workspaceAnalyze } as AnalyzeDefault;
    if (config.get("cacheAnalyzeUi") !== false) {
      const cached =
        this._context.globalState.get<Record<string, unknown>>(
          analyzeUiCacheKey,
        );
      if (cached && typeof cached === "object") {
        analyzeDefault = { ...analyzeDefault, ...cached } as AnalyzeDefault;
      }
    }
    if (analyzeDefault.highResolutionSpectrogram === undefined) {
      analyzeDefault.highResolutionSpectrogram =
        config.get<boolean>("highResolutionSpectrogram") === true;
    }
    return {
      autoAnalyze: !!config.get("autoAnalyze"),
      playerDefault: (config.get("playerDefault") ?? {}) as PlayerDefault,
      analyzeDefault,
      fileExt,
      fileName: path.basename(document.uri.fsPath),
    };
  }

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: { backupId?: string },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: vscode.CancellationToken,
  ): Promise<AudioPreviewDocument> {
    const document: AudioPreviewDocument = await AudioPreviewDocument.create(
      uri,
      openContext.backupId,
    );

    const listeners: vscode.Disposable[] = [];

    listeners.push(
      document.onDidChange(async () => {
        await document.reload();
        for (const webviewPanel of this.webviews.get(document.uri)) {
          this.postMessage(webviewPanel.webview, {
            type: ExtMessageType.RELOAD,
          });
        }
      }),
    );

    document.onDidDispose(() => disposeAll(listeners));

    return document;
  }

  async resolveCustomEditor(
    document: AudioPreviewDocument,
    webviewPanel: vscode.WebviewPanel,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // Add the webview to our internal set of active webviews
    this.webviews.add(document.uri, webviewPanel);

    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // Wait for the webview to be properly ready before we init
    webviewPanel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
      try {
        await this.onReceiveMessage(msg, webviewPanel, document);
      } catch (err) {
        vscode.window.showErrorMessage(err.message);
      }
    });
  }

  private async onReceiveMessage(
    msg: WebviewMessage,
    webviewPanel: vscode.WebviewPanel,
    document: AudioPreviewDocument,
  ) {
    switch (msg.type) {
      case WebviewMessageType.CONFIG: {
        const data = {
          ...this.buildWebviewConfig(document),
          loudnessWorkletUri: webviewPanel.webview
            .asWebviewUri(
              vscode.Uri.joinPath(
                this._context.extensionUri,
                "dist",
                "loudness.worklet.js",
              ),
            )
            .toString(),
          essentiaWasmUri: webviewPanel.webview
            .asWebviewUri(
              vscode.Uri.joinPath(
                this._context.extensionUri,
                "dist",
                "essentia-wasm.web.wasm",
              ),
            )
            .toString(),
        };
        this.postMessage(webviewPanel.webview, {
          type: ExtMessageType.CONFIG,
          data,
        });
        break;
      }

      case WebviewMessageType.SAVE_ANALYZE_UI:
        if (WebviewMessageType.isSaveAnalyzeUi(msg)) {
          const cfg = vscode.workspace.getConfiguration("EarAudioPreview");
          if (cfg.get("cacheAnalyzeUi") !== false) {
            await this._context.globalState.update(analyzeUiCacheKey, msg.data);
          }
        }
        break;

      case WebviewMessageType.DATA:
        if (WebviewMessageType.isDATA(msg)) {
          if (!vscode.workspace.isTrusted) {
            throw new Error("Cannot play audio in untrusted workspaces");
          }

          /*
          postMessage performs serialization and deserialization when transferring data.
          Therefore, if you send Uint8Array directly, the data may change.
          To prevent this, use ArrayBuffer, which is capable of serialization and deserialization, to send data.

          Create a new Uint8Array with a copy of the slice to get a buffer of only the sliced range
          */
          const dd = document.documentData;
          const samples = new Uint8Array(dd.slice(msg.data.start, msg.data.end))
            .buffer;

          this.postMessage(webviewPanel.webview, {
            type: ExtMessageType.DATA,
            data: {
              samples: samples,
              start: msg.data.start,
              end: msg.data.end,
              wholeLength: dd.length,
            },
          });
        }
        break;

      case WebviewMessageType.WRITE_WAV:
        if (WebviewMessageType.isWriteWav(msg)) {
          const content = new Uint8Array(msg.data.samples);
          const destination = msg.data.destination ?? "workspace_root";
          let wavUri: vscode.Uri;
          if (destination === "source_dir") {
            wavUri = vscode.Uri.joinPath(
              vscode.Uri.file(path.dirname(document.uri.fsPath)),
              msg.data.filename,
            );
          } else {
            const dir = vscode.workspace.getWorkspaceFolder(document.uri);
            if (!dir) {
              vscode.window.showErrorMessage(
                "No workspace folder available for export.",
              );
              break;
            }
            wavUri = vscode.Uri.joinPath(dir.uri, msg.data.filename);
          }
          await vscode.workspace.fs.writeFile(wavUri, content);
          vscode.window.showInformationMessage(
            `Success! Wav file written to: ${wavUri.fsPath}`,
          );
        }
        break;

      case WebviewMessageType.ERROR:
        if (WebviewMessageType.isERROR(msg)) {
          vscode.window.showErrorMessage(msg.data.message);
        }
        break;

      case WebviewMessageType.ANALYZE_SEQUENCE_FEATURES:
        if (WebviewMessageType.isAnalyzeSequenceFeatures(msg)) {
          const { requestId, samples, sampleRate, hopSec } = msg.data;
          const buf = samples as ArrayBuffer;
          const mono = new Float32Array(buf, 0, buf.byteLength / 4);
          try {
            const profile = await analyzeSequenceFeaturesInHost(
              mono,
              sampleRate,
              hopSec,
            );
            this.postMessage(webviewPanel.webview, {
              type: ExtMessageType.SEQUENCE_FEATURES,
              data: { requestId, profile: profile ?? undefined },
            });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : String(err);
            this.postMessage(webviewPanel.webview, {
              type: ExtMessageType.SEQUENCE_FEATURES,
              data: { requestId, error: message },
            });
          }
        }
        break;

      case WebviewMessageType.ANALYZE_STFT:
        if (WebviewMessageType.isAnalyzeStft(msg)) {
          const { requestId, cacheKey, samples, sampleRate, settings } =
            msg.data;
          const buf = samples as ArrayBuffer;
          const channelData = new Float32Array(buf, 0, buf.byteLength / 4);
          try {
            const wire = await analyzeStftInHost(
              channelData,
              sampleRate,
              settings,
            );
            this.postMessage(webviewPanel.webview, {
              type: ExtMessageType.STFT_RESULT,
              data: {
                requestId,
                cacheKey,
                wire: wire ?? undefined,
              },
            });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : String(err);
            this.postMessage(webviewPanel.webview, {
              type: ExtMessageType.STFT_RESULT,
              data: { requestId, cacheKey, error: message },
            });
          }
        }
        break;
    }
  }

  private postMessage(webview: vscode.Webview, message: ExtMessage) {
    webview.postMessage(message);
  }

  /**
   * Get the static HTML used for in our editor's webviews.
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    // Local path to script and css for the webview
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._context.extensionUri,
        "dist",
        "audioPreview.js",
      ),
    );

    // Use a nonce to whitelist which scripts can be run
    const nonce = getNonce();

    return /* html */ `
            <!DOCTYPE html>
			<html lang="en">
            <head>
                <meta charset="UTF-8">
                
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'wasm-unsafe-eval' 'nonce-${nonce}' blob: ${webview.cspSource}; worker-src ${webview.cspSource} blob:; connect-src data: ${webview.cspSource} https://*.vscode-cdn.net;">
                
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                
                <title>Wav Preview</title>
            </head>
            <body>
                <div id="root"></div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
			</html>
        `;
  }
}

/**
 * Tracks all webviews.
 */
class WebviewCollection {
  private readonly _webviews = new Set<{
    readonly resource: string;
    readonly webviewPanel: vscode.WebviewPanel;
  }>();

  /**
   * Get all known webviews for a given uri.
   */
  public *get(uri: vscode.Uri): Iterable<vscode.WebviewPanel> {
    const key = uri.toString();
    for (const entry of this._webviews) {
      if (entry.resource === key) {
        yield entry.webviewPanel;
      }
    }
  }

  /**
   * Add a new webview to the collection.
   */
  public add(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel) {
    const entry = { resource: uri.toString(), webviewPanel };
    this._webviews.add(entry);

    webviewPanel.onDidDispose(() => {
      this._webviews.delete(entry);
    });
  }
}
