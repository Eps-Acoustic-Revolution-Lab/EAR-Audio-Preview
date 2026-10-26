import { SequenceWorkerClient } from "./sequenceWorkerClient";

const resources = {
  sequenceWorkerUri: "worker.js",
  essentiaWasmUri: "runtime.wasm",
};
describe("sequence worker webview resource loading", () => {
  const binary = new ArrayBuffer(8);
  let worker: {
    postMessage: jest.Mock;
    terminate: jest.Mock;
    onmessage?: (event: unknown) => void;
  };
  beforeEach(() => {
    worker = { postMessage: jest.fn(), terminate: jest.fn() };
    global.Worker = jest.fn(() => worker) as unknown as typeof Worker;
    URL.createObjectURL = jest.fn(() => "blob:worker");
    URL.revokeObjectURL = jest.fn();
    global.fetch = jest.fn(async (uri) =>
      uri === "worker.js"
        ? { ok: true, text: async () => "worker source" }
        : { ok: true, arrayBuffer: async () => binary },
    ) as jest.Mock;
  });
  async function flush() {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
  }
  it("loads WASM in the webview and transfers its bytes without a worker resource fetch", async () => {
    const samples = new Float32Array(2);
    const pending = new SequenceWorkerClient().analyze(
      samples,
      48000,
      0.05,
      resources,
    );
    await flush();
    const message = worker.postMessage.mock.calls[0];
    worker.onmessage({ data: { kind: "result", profile: { hopSec: 0.05 } } });
    await pending;
    expect(fetch).toHaveBeenCalledWith(
      "runtime.wasm",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(message[0].wasmBinary).toBe(binary);
    expect(message[0].wasmUri).toBeUndefined();
    expect(message[1]).toEqual([samples.buffer, binary]);
  });
  it("reports WASM loading failure before constructing a worker", async () => {
    (fetch as jest.Mock).mockImplementation(async (uri) =>
      uri === "worker.js"
        ? { ok: true, text: async () => "source" }
        : { ok: false, status: 408 },
    );
    const client = new SequenceWorkerClient();
    const pending = client.analyze(new Float32Array(2), 48000, 0.05, resources);
    const assertion = expect(pending).rejects.toThrow(
      "Cannot load analysis WASM: 408",
    );
    await flush();
    if (worker.postMessage.mock.calls.length) {
      worker.onmessage({ data: { kind: "error", error: "old protocol" } });
    }
    await assertion;
    expect(Worker).not.toHaveBeenCalled();
  });
  it("does not start work after cancellation during binary loading", async () => {
    let resolveBinary: (value: ArrayBuffer) => void;
    (fetch as jest.Mock).mockImplementation(async (uri) =>
      uri === "worker.js"
        ? { ok: true, text: async () => "source" }
        : {
            ok: true,
            arrayBuffer: () =>
              new Promise((resolve) => {
                resolveBinary = resolve;
              }),
          },
    );
    const client = new SequenceWorkerClient();
    const pending = client.analyze(new Float32Array(2), 48000, 0.05, resources);
    const assertion = expect(pending).rejects.toThrow("cancelled");
    await flush();
    client.dispose();
    resolveBinary?.(binary);
    await assertion;
    expect(Worker).not.toHaveBeenCalled();
  });
});
