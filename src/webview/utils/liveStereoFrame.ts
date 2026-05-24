import type PlayerService from "../services/playerService";
import {
  applyMonitoringToTimeDomain,
  type LiveMonitoringMode,
} from "./liveMonitoring";

/**
 * Monitoring-mixed stereo time-domain frame — the shared input before
 * goniometer polar binning or frequency-phase-correlation FFT.
 */
export interface MonitoringStereoFrame {
  mixL: Float32Array;
  mixR: Float32Array;
  fftSize: number;
  sampleRate: number;
}

export interface StereoFrameBuffers {
  bufL: Float32Array;
  bufR: Float32Array;
  mixL: Float32Array;
  mixR: Float32Array;
}

export function ensureStereoFrameBuffers(
  fftSize: number,
  existing?: StereoFrameBuffers,
): StereoFrameBuffers {
  if (existing && existing.bufL.length === fftSize) {
    return existing;
  }
  return {
    bufL: new Float32Array(fftSize),
    bufR: new Float32Array(fftSize),
    mixL: new Float32Array(fftSize),
    mixR: new Float32Array(fftSize),
  };
}

/**
 * Read analyser time-domain data and apply the live monitoring matrix (L/R/M/S…).
 * Returns null when the live graph is inactive or playback is paused.
 */
export function fetchMonitoringStereoFrame(
  playerService: PlayerService,
  liveMonitoringMode: LiveMonitoringMode,
  buffers: StereoFrameBuffers,
): MonitoringStereoFrame | null {
  const analysers = playerService.getAnalysers();
  if (!analysers || !playerService.isPlaying) {
    return null;
  }

  const fftSize = analysers.left.fftSize;
  const b = ensureStereoFrameBuffers(fftSize, buffers);

  analysers.left.getFloatTimeDomainData(b.bufL);
  analysers.right.getFloatTimeDomainData(b.bufR);
  applyMonitoringToTimeDomain(
    liveMonitoringMode,
    b.bufL,
    b.bufR,
    b.mixL,
    b.mixR,
  );

  return {
    mixL: b.mixL,
    mixR: b.mixR,
    fftSize,
    sampleRate: analysers.left.context.sampleRate,
  };
}
