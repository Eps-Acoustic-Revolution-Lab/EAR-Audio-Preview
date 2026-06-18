import { toWebAudioType } from "./autoEqApiClient";
import { computeListenMatchDb } from "../utils/eqCanvasMath";
import type HeadphoneEqSettingsService from "./headphoneEqSettingsService";
import type { EqFilterBand } from "../types/headphoneEq";

export interface EqChainNodes {
  input: AudioNode;
  output: AudioNode;
}

/**
 * Builds a PEQ chain (preamp + biquads) for insertion before the gain node.
 * Caller owns disconnecting prior nodes via disposeEqNodes().
 */
export function createEqChain(
  ctx: AudioContext,
  settings: HeadphoneEqSettingsService,
): { nodes: AudioNode[]; chain: EqChainNodes | null } {
  const nodes: AudioNode[] = [];
  if (!settings.shouldApplyEq() || !settings.profile) {
    return { nodes, chain: null };
  }
  const { preampDb, filters } = settings.profile;

  const preamp = ctx.createGain();
  preamp.gain.value = Math.pow(10, preampDb / 20);
  nodes.push(preamp);

  let last: AudioNode = preamp;
  for (const band of filters) {
    if (!band.enabled) {
      continue;
    }
    const f = ctx.createBiquadFilter();
    f.type = toWebAudioType(band.type);
    f.frequency.value = band.frequency;
    f.Q.value = band.q;
    f.gain.value = band.gainDb;
    last.connect(f);
    last = f;
    nodes.push(f);
  }

  const listenMatch = ctx.createGain();
  const matchDb = computeListenMatchDb(preampDb, filters);
  listenMatch.gain.value = Math.pow(10, matchDb / 20);
  last.connect(listenMatch);
  last = listenMatch;
  nodes.push(listenMatch);

  return { nodes, chain: { input: preamp, output: last } };
}

export function disposeEqNodes(nodes: AudioNode[]): void {
  for (const n of [...nodes].reverse()) {
    try {
      n.disconnect();
    } catch {
      /* ok */
    }
  }
}

export function applyBandToFilter(
  filter: BiquadFilterNode,
  band: EqFilterBand,
): void {
  filter.type = toWebAudioType(band.type);
  filter.frequency.value = band.frequency;
  filter.Q.value = band.q;
  filter.gain.value = band.gainDb;
}
