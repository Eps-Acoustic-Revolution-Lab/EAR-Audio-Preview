/** Knob UI: 100 = unity (file直出), 120 = +20% boost. */
export const KNOB_VOLUME_UNITY = 100;
export const KNOB_VOLUME_MAX = 120;
export const GAIN_AT_UNITY = 1;
export const GAIN_AT_MAX = 1.2;

export function knobPercentToGain(percent: number): number {
  const p = Math.max(0, Math.min(KNOB_VOLUME_MAX, percent));
  if (p <= 0) {
    return 0;
  }
  return p / KNOB_VOLUME_UNITY;
}

export function gainToKnobPercent(gain: number): number {
  if (!Number.isFinite(gain) || gain <= 0) {
    return 0;
  }
  return Math.round(
    Math.max(0, Math.min(KNOB_VOLUME_MAX, gain * KNOB_VOLUME_UNITY)),
  );
}

/** Legacy playerSettings linear / dB initial values → knob percent. */
export function initialKnobPercentFromSettings(
  volumeUnitDb: boolean,
  initialVolume: number,
  initialVolumeDb: number,
): number {
  if (volumeUnitDb) {
    const gain =
      initialVolumeDb <= -80 ? 0 : Math.pow(10, initialVolumeDb / 20);
    return gainToKnobPercent(gain);
  }
  const gain = Math.max(
    0,
    Math.min(GAIN_AT_MAX, initialVolume / KNOB_VOLUME_UNITY),
  );
  return gainToKnobPercent(gain);
}
