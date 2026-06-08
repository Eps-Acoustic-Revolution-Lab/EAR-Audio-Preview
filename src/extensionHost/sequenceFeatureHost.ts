import {
  computeSequenceFeatures,
  profileToWire,
  type SequenceFeatureProfileWire,
  type SequenceAnalysisProgress,
} from "../shared/sequenceFeatureCompute";
import { loadEssentiaInNode } from "./essentiaHost";

export async function analyzeSequenceFeaturesInHost(
  monoSamples: Float32Array,
  sampleRate: number,
  hopSec: number,
  onProgress?: SequenceAnalysisProgress,
): Promise<SequenceFeatureProfileWire | null> {
  const essentia = await loadEssentiaInNode();
  if (!essentia) {
    return null;
  }
  try {
    const profile = await computeSequenceFeatures(
      essentia,
      monoSamples,
      sampleRate,
      hopSec,
      onProgress,
    );
    return profileToWire(profile);
  } catch (err) {
    console.warn(
      "[sequenceFeatureHost] Analysis failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
