import {
  installFftSizeLeases,
  type AnalysisAnalyser,
  type AnalysisSource,
  validateFftSize,
  validateSampleRate,
} from "./core";

/**
 * Attach an analysis-only branch without modifying or owning the host graph.
 * isPlaying reflects the context running state, including offline rendering; it
 * does not imply an audible destination or wall-clock playback. The host owns
 * any resume/startRendering call and the corresponding browser user gesture.
 */
export function createAudioSource(options: {
  context: BaseAudioContext;
  node: AudioNode;
  fftSize?: number;
  channelCount?: 1 | 2;
}): AnalysisSource {
  const { context, node } = options;
  validateSampleRate(context.sampleRate);
  let size = options.fftSize ?? 2048;
  validateFftSize(size);
  if (node.context !== context) {
    throw new TypeError("node must belong to context");
  }
  if (
    options.channelCount !== undefined &&
    options.channelCount !== 1 &&
    options.channelCount !== 2
  ) {
    throw new RangeError("channelCount must be 1 or 2");
  }
  const splitter = context.createChannelSplitter(2);
  const left = context.createAnalyser();
  const right = context.createAnalyser();
  left.fftSize = right.fftSize = size;
  left.smoothingTimeConstant = right.smoothingTimeConstant = 0;
  const nodes = [left, right];
  let suspended = false;
  let disposed = false;
  let connected = false;
  let cached: { time: Float32Array[]; frequency: Float32Array[] } | null = null;
  const source = new EventTarget() as AnalysisSource;
  const invalidate = () => {
    cached = null;
  };
  const capture = () => {
    if (disposed) {
      throw new Error("Source is disposed");
    }
    if (!cached) {
      cached = {
        time: nodes.map(() => new Float32Array(size)),
        frequency: nodes.map(() => new Float32Array(size / 2)),
      };
      nodes.forEach((analyser, channel) => {
        analyser.getFloatTimeDomainData(cached.time[channel]);
        analyser.getFloatFrequencyData(cached.frequency[channel]);
      });
      queueMicrotask(invalidate);
    }
    return cached;
  };
  const analysers = nodes.map(
    (_, channel): AnalysisAnalyser => ({
      get fftSize() {
        return size;
      },
      get frequencyBinCount() {
        return size / 2;
      },
      context: { sampleRate: context.sampleRate },
      getFloatTimeDomainData(destination) {
        destination.set(
          capture().time[channel].subarray(0, destination.length),
        );
      },
      getFloatFrequencyData(destination) {
        destination.set(
          capture().frequency[channel].subarray(0, destination.length),
        );
      },
    }),
  );
  const notify = () => source.dispatchEvent(new Event("update-is-playing"));
  const connect = () => {
    if (connected) {
      return;
    }
    node.connect(splitter);
    splitter.connect(left, 0);
    splitter.connect(right, options.channelCount === 1 ? 0 : 1);
    connected = true;
  };
  const disconnect = () => {
    if (!connected) {
      return;
    }
    try {
      node.disconnect(splitter);
    } catch (error) {
      // A host may remove all its outgoing edges before releasing this tap.
      if (
        !(error instanceof DOMException) ||
        error.name !== "InvalidAccessError"
      ) {
        throw error;
      }
    } finally {
      splitter.disconnect();
      connected = false;
      invalidate();
    }
  };
  Object.defineProperties(source, {
    sampleRate: { value: context.sampleRate },
    isPlaying: {
      get: () => !disposed && !suspended && context.state === "running",
    },
  });
  source.getAnalysers = () =>
    disposed ? null : { left: analysers[0], right: analysers[1] };
  source.setFftSize = (next) => {
    if (disposed) {
      throw new Error("Source is disposed");
    }
    validateFftSize(next);
    left.fftSize = right.fftSize = next;
    size = next;
    invalidate();
  };
  source.suspend = () => {
    if (disposed || suspended) {
      return;
    }
    suspended = true;
    disconnect();
    notify();
  };
  source.resume = () => {
    if (disposed || !suspended) {
      return;
    }
    suspended = false;
    connect();
    notify();
  };
  source.dispose = () => {
    if (disposed) {
      return;
    }
    try {
      disconnect();
    } finally {
      disposed = true;
      context.removeEventListener("statechange", notify);
      notify();
    }
  };
  context.addEventListener("statechange", notify);
  connect();
  installFftSizeLeases(source, size);
  return source;
}
