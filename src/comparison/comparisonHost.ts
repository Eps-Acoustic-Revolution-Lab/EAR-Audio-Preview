import { ComparisonAnalysisHost } from "../extensionHost/comparisonAnalysisHost";
import { hostAnalysisTasks } from "../extensionHost/analysisTaskQueue";
import { comparisonTrackLimit } from "./limits";
import { handleComparisonEqRequest } from "./comparisonEqHost";
import * as vscode from "vscode";
import { getNonce } from "../util";
import {
  ComparisonFile,
  ComparisonRequest,
  ComparisonResponse,
} from "./protocol";
import { analyzeSequenceFeaturesInHost } from "../extensionHost/sequenceFeatureHost";
import type { HeadphoneEqPersistedState } from "../webview/types/headphoneEq";
import { ExtMessageType } from "../message";

const supported = ["wav", "mp3", "ogg", "aac", "flac", "opus", "m4a", "sph"];
const chunkSize = 3_000_000;
interface HostFile {
  info: ComparisonFile;
  uri: vscode.Uri;
  bytes?: Uint8Array;
  watcher: vscode.FileSystemWatcher;
}

export class ComparisonHost implements vscode.Disposable {
  private _panels = new Set<vscode.WebviewPanel>();
  private _append = new Map<
    vscode.WebviewPanel,
    (uris: readonly vscode.Uri[]) => Promise<void>
  >();
  constructor(private readonly _context: vscode.ExtensionContext) {}
  public async open(resources: readonly vscode.Uri[] = []): Promise<void> {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showErrorMessage(
        "Audio comparison requires a trusted workspace.",
      );
      return;
    }
    const uris = resources.length
      ? resources
      : await vscode.window.showOpenDialog({
          canSelectMany: true,
          filters: { audio: supported },
          title: "Compare up to eight audio files",
        });
    if (!uris?.length) {
      return;
    }
    const unique = [
      ...new Map(uris.map((uri) => [uri.toString(), uri])).values(),
    ];
    if (unique.length > comparisonTrackLimit) {
      void vscode.window.showErrorMessage("Select at most eight audio files.");
      return;
    }
    // The single-file editor entry joins the most recent open comparison.
    if (unique.length === 1 && this._append.size) {
      const [existingPanel, append] = [...this._append.entries()].pop();
      try {
        await append(unique);
        existingPanel.reveal();
      } catch (error) {
        void vscode.window.showErrorMessage(String(error));
      }
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "earAudioPreview.comparison",
      "Audio Comparison",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this._context.extensionUri],
      },
    );
    // Keep the owner reference: VS Code may reject panel.webview after disposal.
    const webview = panel.webview;
    this._panels.add(panel);
    const files = new Map<string, HostFile>();
    const analysis = new ComparisonAnalysisHost();
    const sequenceJobs = new Map<string, AbortController>();
    let counter = 0,
      ready = false,
      disposed = false;
    let listener: vscode.Disposable | undefined;
    const cleanup = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      listener?.dispose();
      hostAnalysisTasks.cancel(webview);
      analysis.dispose();
      sequenceJobs.forEach((job) => job.abort());
      sequenceJobs.clear();
      files.forEach((f) => f.watcher.dispose());
      files.clear();
      this._panels.delete(panel);
      this._append.delete(panel);
    };
    panel.onDidDispose(cleanup);
    const post = (message: ComparisonResponse) => {
      if (!disposed) {
        void webview.postMessage(message);
      }
    };
    try {
      let headphoneEq =
        this._context.globalState.get<HeadphoneEqPersistedState>(
          "earAudioPreview.headphoneEq.v1",
        ) ?? { bypassed: true, profile: null };
      const folder = vscode.workspace.getWorkspaceFolder(unique[0]);
      if (folder) {
        try {
          headphoneEq = JSON.parse(
            new TextDecoder().decode(
              await vscode.workspace.fs.readFile(
                vscode.Uri.joinPath(
                  folder.uri,
                  ".vscode",
                  "ear-headphone-eq.json",
                ),
              ),
            ),
          );
        } catch {
          /* Use the globally saved profile when there is no workspace override. */
        }
      }
      if (disposed) {
        return;
      }
      const publish = (initial: boolean) =>
        post({
          type: "compare.files",
          files: [...files.values()].map((f) => f.info),
          initial,
          onboardingSeen: this._context.globalState.get<boolean>(
            "earAudioPreview.comparisonOnboardingSeen.v1",
            false,
          ),
          headphoneEq,
          sequenceWorkerUri: webview
            .asWebviewUri(
              vscode.Uri.joinPath(
                this._context.extensionUri,
                "dist",
                "sequenceWorker.js",
              ),
            )
            .toString(),
          essentiaWasmUri: webview
            .asWebviewUri(
              vscode.Uri.joinPath(
                this._context.extensionUri,
                "dist",
                "essentia-wasm.web.wasm",
              ),
            )
            .toString(),
          workerUri: webview
            .asWebviewUri(
              vscode.Uri.joinPath(
                this._context.extensionUri,
                "dist",
                "comparisonWorker.js",
              ),
            )
            .toString(),
          loudnessWorkerUri: webview
            .asWebviewUri(
              vscode.Uri.joinPath(
                this._context.extensionUri,
                "dist",
                "comparisonLoudnessWorker.js",
              ),
            )
            .toString(),
          loudnessWorkletUri: webview
            .asWebviewUri(
              vscode.Uri.joinPath(
                this._context.extensionUri,
                "dist",
                "loudness.worklet.js",
              ),
            )
            .toString(),
        });
      const add = async (urisToAdd: readonly vscode.Uri[]) => {
        const existing = new Set([...files.values()].map((f) => f.info.uri));
        const additions = [
          ...new Map(urisToAdd.map((uri) => [uri.toString(), uri])).values(),
        ].filter((uri) => !existing.has(uri.toString()));
        if (files.size + additions.length > comparisonTrackLimit) {
          throw new Error(
            "A comparison supports at most eight files. Remove a file before adding more.",
          );
        }
        for (const uri of additions) {
          const ext = uri.path.split(".").pop()?.toLowerCase() ?? "";
          if (!supported.includes(ext)) {
            throw new Error("Unsupported audio file: " + uri.path);
          }
        }
        for (const uri of additions) {
          const id = `track-${++counter}`;
          const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(
              vscode.Uri.joinPath(uri, ".."),
              uri.path.split("/").pop(),
            ),
          );
          const info = {
            id,
            uri: uri.toString(),
            name: uri.path.split("/").pop(),
            ext: uri.path.split(".").pop().toLowerCase(),
            revision: 1,
          };
          files.set(id, { info, uri, watcher });
          watcher.onDidChange(() => post({ type: "compare.changed", id }));
          watcher.onDidDelete(() => post({ type: "compare.changed", id }));
        }
      };
      await add(unique);
      if (disposed) {
        return;
      }
      this._append.set(panel, async (more) => {
        if (!disposed) {
          await add(more);
          if (ready) {
            publish(false);
          }
        }
      });
      listener = webview.onDidReceiveMessage(
        async (message: ComparisonRequest) => {
          try {
            if (
              !message ||
              typeof message.type !== "string" ||
              !vscode.workspace.isTrusted
            ) {
              return;
            }
            switch (message.type) {
              case "compare.eq": {
                const response = await handleComparisonEqRequest(
                  message.message,
                  this._context,
                  folder,
                );
                if (response) {
                  post({ type: "compare.eqResult", message: response });
                }
                break;
              }
              case "compare.onboardingSeen":
                await this._context.globalState.update(
                  "earAudioPreview.comparisonOnboardingSeen.v1",
                  true,
                );
                break;
              case "compare.ready":
                if (!ready) {
                  ready = true;
                  publish(true);
                }
                break;
              case "compare.add": {
                const selected = await vscode.window.showOpenDialog({
                  canSelectMany: true,
                  filters: { audio: supported },
                });
                if (selected && !disposed) {
                  await add(selected);
                  publish(false);
                }
                break;
              }
              case "compare.read": {
                const file = files.get(message.id);
                if (!file || file.info.revision !== message.revision) {
                  post({
                    type: "compare.failure",
                    id: message.id,
                    revision: message.revision,
                    message: "Audio read was cancelled or superseded",
                  });
                  return;
                }
                if (
                  !Number.isSafeInteger(message.offset) ||
                  message.offset < 0
                ) {
                  throw new Error("Invalid audio read offset");
                }
                if (!file.bytes) {
                  const bytes = await vscode.workspace.fs.readFile(file.uri);
                  if (file.info.revision !== message.revision) {
                    post({
                      type: "compare.failure",
                      id: message.id,
                      revision: message.revision,
                      message: "Audio read was superseded",
                    });
                    return;
                  }
                  file.bytes = bytes;
                }
                if (disposed) {
                  return;
                }
                if (!files.has(message.id)) {
                  post({
                    type: "compare.failure",
                    id: message.id,
                    revision: message.revision,
                    message: "Audio read was cancelled by removal",
                  });
                  return;
                }
                const offset = Math.min(message.offset, file.bytes.length);
                const samples = file.bytes.slice(
                  offset,
                  offset + chunkSize,
                ).buffer;
                post({
                  type: "compare.data",
                  id: message.id,
                  revision: message.revision,
                  offset,
                  length: file.bytes.length,
                  samples,
                });
                if (offset + samples.byteLength >= file.bytes.length) {
                  file.bytes = undefined;
                }
                break;
              }
              case "compare.remove": {
                const file = files.get(message.id);
                file?.watcher.dispose();
                files.delete(message.id);
                break;
              }
              case "compare.reload": {
                const file = files.get(message.id);
                if (file) {
                  file.bytes = undefined;
                  file.info.revision++;
                  publish(false);
                }
                break;
              }
              case "compare.confirm": {
                const accepted = await vscode.window.showWarningMessage(
                  "Compare files with different or uncertain sample rates?",
                  { modal: true, detail: message.detail },
                  "Continue comparison",
                );
                post({
                  type: "compare.confirmed",
                  requestId: message.requestId,
                  accepted: accepted === "Continue comparison",
                });
                break;
              }
              case "compare.analysis": {
                const { job, revision } = message;
                const requestId = `compare-analysis-${job.id}`;
                await hostAnalysisTasks.run(
                  webview,
                  requestId,
                  async (cancelled) => {
                    const shouldCancel = () =>
                      cancelled() ||
                      disposed ||
                      files.get(job.trackId)?.info.revision !== revision;
                    try {
                      if (shouldCancel()) {
                        return;
                      }
                      const reply = await analysis.analyze(job, shouldCancel);
                      if (reply && !shouldCancel()) {
                        post({ type: "compare.analysisResult", reply });
                      }
                    } catch (error) {
                      if (!shouldCancel()) {
                        post({
                          type: "compare.analysisResult",
                          reply: {
                            id: job.id,
                            trackId: job.trackId,
                            audioRevision: job.audioRevision,
                            settingsRevision: job.settingsRevision,
                            time: job.time,
                            error: String(error),
                          },
                        });
                      }
                    }
                  },
                );
                break;
              }
              case "compare.cancelAnalysis":
                hostAnalysisTasks.cancel(
                  webview,
                  `compare-analysis-${message.id}`,
                );
                break;
              case "compare.sequence": {
                const job = new AbortController();
                sequenceJobs.set(message.requestId, job);
                await hostAnalysisTasks.run(
                  webview,
                  message.requestId,
                  async (queueCancelled) => {
                    const shouldCancel = () =>
                      queueCancelled() ||
                      job.signal.aborted ||
                      disposed ||
                      files.get(message.trackId)?.info.revision !==
                        message.revision;
                    try {
                      if (shouldCancel()) {
                        return;
                      }
                      const profile = await analyzeSequenceFeaturesInHost(
                        new Float32Array(message.samples as ArrayBuffer),
                        message.sampleRate,
                        message.hopSec,
                        undefined,
                        shouldCancel,
                      );
                      if (shouldCancel()) {
                        return;
                      }
                      post({
                        type: "compare.sequenceResult",
                        message: {
                          type: ExtMessageType.SEQUENCE_FEATURES,
                          data: {
                            requestId: message.requestId,
                            profile: profile ?? undefined,
                          },
                        },
                      });
                    } catch (error) {
                      if (shouldCancel()) {
                        return;
                      }
                      post({
                        type: "compare.sequenceResult",
                        message: {
                          type: ExtMessageType.SEQUENCE_FEATURES,
                          data: {
                            requestId: message.requestId,
                            error: String(error),
                          },
                        },
                      });
                    }
                  },
                );
                sequenceJobs.delete(message.requestId);
                break;
              }
              case "compare.cancelSequence":
                hostAnalysisTasks.cancel(webview, message.requestId);
                sequenceJobs.get(message.requestId)?.abort();
                break;
              case "compare.export": {
                try {
                  const target = await vscode.window.showSaveDialog({
                    saveLabel: "Export mix",
                    filters: { wav: ["wav"] },
                    defaultUri: vscode.Uri.joinPath(
                      unique[0],
                      "..",
                      "comparison.wav",
                    ),
                  });
                  if (target) {
                    await vscode.workspace.fs.writeFile(
                      target,
                      new Uint8Array(message.samples),
                    );
                  }
                  post({
                    type: "compare.exported",
                    requestId: message.requestId,
                    path: target?.fsPath,
                  });
                } catch (error) {
                  post({
                    type: "compare.exported",
                    requestId: message.requestId,
                    error: String(error),
                  });
                }
                break;
              }
              case "compare.error":
                void vscode.window.showErrorMessage(message.message);
                break;
            }
          } catch (error) {
            post({
              type: "compare.failure",
              id:
                "id" in message && typeof message.id === "string"
                  ? message.id
                  : undefined,
              revision: "revision" in message ? message.revision : undefined,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        },
      );
      const nonce = getNonce();
      const script = webview.asWebviewUri(
        vscode.Uri.joinPath(
          this._context.extensionUri,
          "dist",
          "comparison.js",
        ),
      );
      webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'wasm-unsafe-eval' 'nonce-${nonce}' blob: ${webview.cspSource}; worker-src ${webview.cspSource} blob:; connect-src ${webview.cspSource} data:;"><title>Audio Comparison</title></head><body><div id="root"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
    } catch (error) {
      cleanup();
      panel.dispose();
      throw error;
    }
  }
  public dispose(): void {
    for (const panel of this._panels) {
      panel.dispose();
    }
    this._panels.clear();
  }
}
