import { createAudioSource } from "./webAudio";

function fixture(channelCount: 1 | 2 = 1) {
  const context = Object.assign(new EventTarget(), {
    sampleRate: 48000,
    state: "running",
    close: jest.fn(),
    suspend: jest.fn(),
    resume: jest.fn(),
    createChannelSplitter: jest.fn(() => ({
      connect: jest.fn(),
      disconnect: jest.fn(),
    })),
    createAnalyser: jest.fn(() => ({
      fftSize: 2048,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: jest.fn((data: Float32Array) => data.fill(0.5)),
      getFloatFrequencyData: jest.fn((data: Float32Array) => data.fill(-6)),
    })),
  });
  const node = { context, connect: jest.fn(), disconnect: jest.fn() };
  const source = createAudioSource({
    context: context as unknown as AudioContext,
    node: node as unknown as AudioNode,
    channelCount,
  });
  return {
    context,
    node,
    source,
    splitter: context.createChannelSplitter.mock.results[0].value,
  };
}
describe("Web Audio source", () => {
  test("owns only its analysis branch and never controls the context", () => {
    const { context, node, source, splitter } = fixture();
    expect(splitter.connect.mock.calls.map((call) => call[1])).toEqual([0, 0]);
    source.suspend();
    source.suspend();
    expect(node.disconnect).toHaveBeenCalledTimes(1);
    expect(node.disconnect).toHaveBeenCalledWith(splitter);
    source.resume();
    source.dispose();
    source.dispose();
    expect(node.disconnect).toHaveBeenCalledTimes(2);
    expect(context.close).not.toHaveBeenCalled();
    expect(context.resume).not.toHaveBeenCalled();
    expect(context.suspend).not.toHaveBeenCalled();
    expect(source.isPlaying).toBe(false);
    expect(source.getAnalysers()).toBeNull();
  });
  test("shares a complete snapshot across synchronous consumers", async () => {
    const { source, context } = fixture();
    const analysers = source.getAnalysers();
    const data = new Float32Array(32);
    analysers.left.getFloatTimeDomainData(data);
    analysers.right.getFloatTimeDomainData(data);
    analysers.left.getFloatFrequencyData(data);
    const native = context.createAnalyser.mock.results[0].value;
    expect(native.getFloatTimeDomainData).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    analysers.left.getFloatTimeDomainData(data);
    expect(native.getFloatTimeDomainData).toHaveBeenCalledTimes(2);
    source.dispose();
  });
  test("reflects host state without resuming it", () => {
    const { source, context } = fixture();
    const changed = jest.fn();
    source.addEventListener("update-is-playing", changed);
    context.state = "suspended";
    context.dispatchEvent(new Event("statechange"));
    expect(source.isPlaying).toBe(false);
    expect(changed).toHaveBeenCalledTimes(1);
    source.dispose();
  });
});

test("stereo taps preserve independent channels and validate context ownership", () => {
  const { context, source, splitter } = fixture(2);
  expect(splitter.connect.mock.calls.map((call) => call[1])).toEqual([0, 1]);
  const nativeLeft = context.createAnalyser.mock.results[0].value;
  const nativeRight = context.createAnalyser.mock.results[1].value;
  nativeLeft.getFloatTimeDomainData.mockImplementation((data) =>
    data.fill(0.25),
  );
  nativeRight.getFloatTimeDomainData.mockImplementation((data) =>
    data.fill(-0.75),
  );
  const left = new Float32Array(32);
  const right = new Float32Array(32);
  source.getAnalysers().left.getFloatTimeDomainData(left);
  source.getAnalysers().right.getFloatTimeDomainData(right);
  expect(left[0]).toBe(0.25);
  expect(right[0]).toBe(-0.75);
  expect(() =>
    createAudioSource({
      context: context as unknown as AudioContext,
      node: { context: {} } as AudioNode,
    }),
  ).toThrow("belong");
  source.dispose();
});

test("disposing after the host removed its edges still releases SDK resources", () => {
  const { source, node, context, splitter } = fixture();
  const removed = jest.spyOn(context, "removeEventListener");
  node.disconnect.mockImplementation(() => {
    throw new DOMException("No edge", "InvalidAccessError");
  });
  expect(() => source.dispose()).not.toThrow();
  expect(() => source.dispose()).not.toThrow();
  expect(splitter.disconnect).toHaveBeenCalledTimes(1);
  expect(removed).toHaveBeenCalledWith("statechange", expect.any(Function));
  expect(source.isPlaying).toBe(false);
  expect(source.getAnalysers()).toBeNull();
});

test("unexpected host disconnect errors remain visible while SDK cleanup completes", () => {
  const { source, node, context, splitter } = fixture();
  const removed = jest.spyOn(context, "removeEventListener");
  node.disconnect.mockImplementation(() => {
    throw new Error("unexpected");
  });
  expect(() => source.dispose()).toThrow("unexpected");
  expect(splitter.disconnect).toHaveBeenCalledTimes(1);
  expect(removed).toHaveBeenCalled();
  expect(source.getAnalysers()).toBeNull();
  expect(() => source.dispose()).not.toThrow();
});
