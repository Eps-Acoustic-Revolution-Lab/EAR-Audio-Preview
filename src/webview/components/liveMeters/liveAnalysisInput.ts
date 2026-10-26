import type { AnalysisAnalyser } from "../../../sdk/core";

export interface LivePlayback extends EventTarget {
  readonly isPlaying: boolean;
  readonly sampleRate: number;
  getAnalysers(): { left: AnalysisAnalyser; right: AnalysisAnalyser } | null;
  acquireFftSize?(size: number): () => void;
  readonly hearingProtectionActive?: boolean;
  setHearingProtectionActive?(active: boolean): void;
}
/** Display-only settings shared by EAR and standalone visualizations. */
export interface LiveSettings extends EventTarget {
  hearingProtectionEnabled: boolean;
  hearingProtectionPeakDbFs: number;
  liveAnalysisFftSize: 512 | 1024 | 2048 | 4096;
  liveCqtLfRes: 40 | 20 | 10;
  liveLevelMeterReleaseDbPerSec: number;
  liveMonitoringMode: "lr" | "swap" | "l" | "r" | "m" | "s";
  livePolarFieldReleaseDbPerSec: number;
  livePolarLevelGatePct: number;
  livePolarSampleFillBrightnessPct: number;
  livePolarSampleRadiusGamma: number;
  liveSoundFieldMode: "polarSample" | "polarLevel" | "lissajous";
  liveSpectrumMode: "fft" | "cqt";
  liveSpectrumPeakHoldSec: number;
  liveSpectrumReleaseDbPerSec: number;
  liveSpectrumTiltDbPerOct: 0 | 1.5 | 3 | 4.5 | 6;
}
export interface LiveTrackFrame {
  id: string;
  revision: string;
  name: string;
  color: string;
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
  frequencies: Float64Array;
  spectrumDb: Float32Array;
  phaseRho: Float32Array;
  broadbandRho: number;
  weighting: "none" | "a";
}
export interface LiveComparisonSnapshot {
  revision: number;
  time: number;
  tracks: readonly LiveTrackFrame[];
}
/** Every meter reads the same published batch, including paused seeks and muted sources. */
export interface LiveComparisonInput {
  snapshot(): LiveComparisonSnapshot | null;
  subscribe(redraw: () => void): () => void;
  invalidate?(): void;
}
export function traceColor(
  color: string | null,
  alpha: number,
  fallback: string,
): string {
  return color
    ? `${color}${Math.round(alpha * 255)
        .toString(16)
        .padStart(2, "0")}`
    : fallback;
}
