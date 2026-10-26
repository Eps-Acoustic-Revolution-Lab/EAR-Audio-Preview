import { computeHarmonicFeatures } from "../shared/harmonicFeatureCompute";
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
  shouldCancel?: () => boolean,
  harmonic = false,
): Promise<SequenceFeatureProfileWire | null> {
  const essentia = await loadEssentiaInNode();
  if (!essentia || shouldCancel?.()) {
    return null;
  }
  try {
    const profile = await computeSequenceFeatures(
      essentia,
      monoSamples,
      sampleRate,
      hopSec,
      onProgress,
      shouldCancel,
    );
    if (harmonic) {
      profile.harmonic = await computeHarmonicFeatures(
        essentia,
        monoSamples,
        sampleRate,
        shouldCancel,
      );
    }
    return profileToWire(profile);
  } catch (err) {
    if (shouldCancel?.()) {
      return null;
    }
    console.warn(
      "[sequenceFeatureHost] Analysis failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
