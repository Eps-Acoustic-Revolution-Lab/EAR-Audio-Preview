import { SequenceWorkerClient } from "./sequenceWorkerClient";

const resources = {
  sequenceWorkerUri: "worker.js",
  essentiaWasmUri: "runtime.wasm",
};
describe("SequenceWorkerClient", () => {
  let worker: {
    terminate: jest.Mock;
    postMessage: jest.Mock;
    onmessage?: (event: unknown) => void;
    onerror?: () => void;
  };
  beforeEach(() => {
    worker = { terminate: jest.fn(), postMessage: jest.fn() };
    global.Worker = jest.fn(() => worker) as unknown as typeof Worker;
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, text: async () => "worker source" });
    URL.createObjectURL = jest.fn(() => "blob:worker");
    URL.revokeObjectURL = jest.fn();
  });
  async function started() {
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
    }
  }
  it("transfers owned PCM, forwards progress, and releases worker on result", async () => {
    const client = new SequenceWorkerClient();
    const samples = new Float32Array([0.1, 0.2]);
    const progress = jest.fn();
    const pending = client.analyze(samples, 48000, 0.05, resources, progress);
    await started();
    expect(worker.postMessage.mock.calls[0][1]).toEqual([samples.buffer]);
    worker.onmessage({ data: { kind: "progress", percent: 20 } });
    expect(progress).toHaveBeenCalledWith(20);
    worker.onmessage({ data: { kind: "result", profile: { hopSec: 0.05 } } });
    await expect(pending).resolves.toEqual({ hopSec: 0.05 });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:worker");
  });
  it("terminates synchronous work on disposal and rejects the pending request", async () => {
    const client = new SequenceWorkerClient();
    const pending = client.analyze(new Float32Array(2), 48000, 0.05, resources);
    await started();
    client.dispose();
    await expect(pending).rejects.toThrow("cancelled");
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it("bounds worker failures and revokes its blob", async () => {
    const pending = new SequenceWorkerClient().analyze(
      new Float32Array(2),
      48000,
      0.05,
      resources,
    );
    await started();
    worker.onerror();
    await expect(pending).rejects.toThrow("worker failed");
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
