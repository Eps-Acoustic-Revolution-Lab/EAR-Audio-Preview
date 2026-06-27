/* eslint-disable @typescript-eslint/no-unused-vars */

export interface LoudnessMeasurements {
  momentaryLoudness: number;
  shortTermLoudness: number;
  integratedLoudness: number;
  loudnessRange: number;
  maximumTruePeakLevel: number;
}

export interface LoudnessSnapshot {
  currentTime: number;
  currentMeasurements: LoudnessMeasurements[];
}

export class LoudnessWorkletNode {
  port = { onmessage: null as ((e: MessageEvent) => void) | null };
  constructor(_ctx: BaseAudioContext, _opts?: unknown) {}
  connect(destination?: unknown) {
    return destination;
  }
  disconnect() {}
  static async loadModule(_ctx: BaseAudioContext): Promise<void> {}
}

export async function createLoudnessWorklet(
  _ctx: BaseAudioContext,
  _opts?: unknown,
): Promise<AudioWorkletNode> {
  return {
    port: { onmessage: null },
    disconnect: () => {},
    connect: () => {},
  } as unknown as AudioWorkletNode;
}
