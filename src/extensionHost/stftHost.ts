import {
  computeEssentiaStftSpectrogram,
  type StftSettingsWire,
  type StftSpectrogramWire,
} from "../shared/stftEssentiaCompute";
import { loadEssentiaInNode } from "./essentiaHost";

export async function analyzeStftInHost(
  channelData: Float32Array,
  sampleRate: number,
  settings: StftSettingsWire,
): Promise<StftSpectrogramWire | null> {
  const essentia = await loadEssentiaInNode();
  if (!essentia) {
    return null;
  }
  try {
    return await computeEssentiaStftSpectrogram(
      essentia,
      channelData,
      sampleRate,
      settings,
    );
  } catch (err) {
    console.warn(
      "[stftHost] STFT failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
