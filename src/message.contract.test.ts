import * as fs from "fs";
import * as path from "path";
import { ExtMessageType, WebviewMessageType } from "./message";

/**
 * Cross-process contract anchors: message-type strings, custom-editor
 * viewType/activation events and persisted-state keys. Any diff here is a
 * deliberate protocol change and must be reviewed as such.
 */

const repoRoot = path.join(__dirname, "..");

function readRepoFile(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

function staticStringValues(cls: Record<string, unknown>): string[] {
  return Object.values(cls).filter((v): v is string => typeof v === "string");
}

describe("message type contract", () => {
  test("Extension → Webview types are locked", () => {
    expect(staticStringValues(ExtMessageType as never).sort()).toEqual(
      [
        "AUTOEQ_RESULT",
        "CONFIG",
        "DATA",
        "EQ_PRESET_OP_RESULT",
        "RELOAD",
        "SEQUENCE_FEATURES",
        "STFT_RESULT",
      ].sort(),
    );
  });

  test("Webview → Extension types are locked", () => {
    expect(staticStringValues(WebviewMessageType as never).sort()).toEqual(
      [
        "ANALYZE_SEQUENCE_FEATURES",
        "ANALYZE_STFT",
        "AUTOEQ_REQUEST",
        "CONFIG",
        "DATA",
        "EQ_PRESET_OP",
        "ERROR",
        "SAVE_ANALYZE_UI",
        "SAVE_EQ_SETTINGS",
        "WRITE_EQ_PROFILE",
        "WRITE_WAV",
      ].sort(),
    );
  });

  test("type strings are unique within each direction", () => {
    const ext = staticStringValues(ExtMessageType as never);
    const webview = staticStringValues(WebviewMessageType as never);
    expect(new Set(ext).size).toBe(ext.length);
    expect(new Set(webview).size).toBe(webview.length);
  });

  test("no type string is reused across directions", () => {
    const ext = new Set(staticStringValues(ExtMessageType as never));
    const webview = staticStringValues(WebviewMessageType as never);
    const shared = webview.filter(
      (t) => ext.has(t) && t !== "CONFIG" && t !== "DATA",
    );
    // CONFIG/DATA intentionally mirror request/response pairs; nothing else may collide.
    expect(shared).toEqual([]);
  });
});

describe("custom editor contract", () => {
  const pkg = JSON.parse(readRepoFile("package.json"));

  test("viewType in package.json matches the provider constant", () => {
    const viewType = pkg.contributes.customEditors[0].viewType;
    expect(viewType).toBe("earAudioPreview.audioPreview");
    const editorSource = readRepoFile("src/audioPreviewEditor.ts");
    expect(editorSource).toContain(
      `private static readonly viewType = "${viewType}"`,
    );
  });

  test("activation event targets the custom editor", () => {
    expect(pkg.activationEvents).toEqual([
      "onCustomEditor:earAudioPreview.audioPreview",
    ]);
  });

  test("settings keys are locked", () => {
    expect(
      Object.keys(pkg.contributes.configuration.properties).sort(),
    ).toEqual(
      [
        "EarAudioPreview.analyzeDefault",
        "EarAudioPreview.autoAnalyze",
        "EarAudioPreview.cacheAnalyzeUi",
        "EarAudioPreview.headphoneEq.bypassByDefault",
        "EarAudioPreview.highResolutionSpectrogram",
        "EarAudioPreview.playerDefault",
      ].sort(),
    );
  });
});

describe("persisted state key contract", () => {
  test("globalState / workspace file keys are locked in the editor source", () => {
    const editorSource = readRepoFile("src/audioPreviewEditor.ts");
    expect(editorSource).toContain(
      'const analyzeUiCacheKey = "earAudioPreview.analyzeUiCache.v1"',
    );
    expect(editorSource).toContain(
      'const headphoneEqCacheKey = "earAudioPreview.headphoneEq.v1"',
    );
    expect(editorSource).toContain(
      'const workspaceEqFileName = "ear-headphone-eq.json"',
    );
  });

  test("workspace EQ preset directory name is locked", () => {
    const hostSource = readRepoFile("src/extensionHost/eqPresetHost.ts");
    expect(hostSource).toContain(
      'export const workspaceEqPresetsDir = "ear-eq-presets"',
    );
  });
});
