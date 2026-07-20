/**
 * Behavior anchors for the loudness AudioWorklet loader: CSP-safe module-URL
 * path, library blob-loader fallback, and one-shot registration per context.
 * Module state is reset between tests because the loader keeps module-level
 * `_moduleUrl` / WeakSet caches.
 */

type LoaderModule = typeof import("./loudnessWorkletLoader");
type WorkletMock = typeof import("loudness-worklet");

function makeFakeContext(): {
  ctx: BaseAudioContext;
  addModuleCalls: string[];
} {
  const addModuleCalls: string[] = [];
  const ctx = {
    audioWorklet: {
      addModule: async (url: string) => {
        addModuleCalls.push(url);
      },
    },
  } as unknown as BaseAudioContext;
  return { ctx, addModuleCalls };
}

describe("loadLoudnessWorkletModule", () => {
  let loader: LoaderModule;
  let workletMock: WorkletMock;
  let fallbackSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    /* eslint-disable @typescript-eslint/no-var-requires */
    loader = require("./loudnessWorkletLoader");
    workletMock = require("loudness-worklet");
    /* eslint-enable @typescript-eslint/no-var-requires */
    fallbackSpy = jest.spyOn(workletMock.LoudnessWorkletNode, "loadModule");
  });

  afterEach(() => {
    fallbackSpy.mockRestore();
  });

  test("uses audioWorklet.addModule with the configured extension URI", async () => {
    const { ctx, addModuleCalls } = makeFakeContext();
    loader.setLoudnessWorkletModuleUrl(
      "vscode-webview://dist/loudness.worklet.js",
    );
    await loader.loadLoudnessWorkletModule(ctx);
    expect(addModuleCalls).toEqual([
      "vscode-webview://dist/loudness.worklet.js",
    ]);
    expect(fallbackSpy).not.toHaveBeenCalled();
  });

  test("falls back to the library blob loader when no URL is configured", async () => {
    const { ctx, addModuleCalls } = makeFakeContext();
    await loader.loadLoudnessWorkletModule(ctx);
    expect(addModuleCalls).toEqual([]);
    expect(fallbackSpy).toHaveBeenCalledTimes(1);
    expect(fallbackSpy).toHaveBeenCalledWith(ctx);
  });

  test("registers the worklet at most once per BaseAudioContext", async () => {
    const { ctx, addModuleCalls } = makeFakeContext();
    loader.setLoudnessWorkletModuleUrl("vscode-webview://dist/l.js");
    await loader.loadLoudnessWorkletModule(ctx);
    await loader.loadLoudnessWorkletModule(ctx);
    expect(addModuleCalls.length).toBe(1);
  });

  test("distinct contexts each get their own registration", async () => {
    const a = makeFakeContext();
    const b = makeFakeContext();
    loader.setLoudnessWorkletModuleUrl("vscode-webview://dist/l.js");
    await loader.loadLoudnessWorkletModule(a.ctx);
    await loader.loadLoudnessWorkletModule(b.ctx);
    expect(a.addModuleCalls.length).toBe(1);
    expect(b.addModuleCalls.length).toBe(1);
  });

  test("getLoudnessWorkletModuleUrl reflects the configured value", () => {
    expect(loader.getLoudnessWorkletModuleUrl()).toBeNull();
    loader.setLoudnessWorkletModuleUrl("u://x");
    expect(loader.getLoudnessWorkletModuleUrl()).toBe("u://x");
  });
});
