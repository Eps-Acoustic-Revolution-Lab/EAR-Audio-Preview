import { EventType } from "../webview/events";
import type { LiveSettings } from "../webview/components/liveMeters/liveAnalysisInput";
import {
  clampReleaseDbPerSec,
  clampLiveSpectrumPeakHoldSec,
} from "../webview/utils/liveBallistics";

import {
  clampPolarSampleFillBrightnessPct,
  clampPolarSampleRadiusGamma,
} from "../webview/utils/stereoPolarField";

export type VisualizationSettings = Omit<LiveSettings, keyof EventTarget>;
export const defaultSettings: Readonly<VisualizationSettings> = Object.freeze({
  hearingProtectionEnabled: true,
  hearingProtectionPeakDbFs: 6,
  liveAnalysisFftSize: 2048,
  liveCqtLfRes: 40,
  liveLevelMeterReleaseDbPerSec: 15,
  liveMonitoringMode: "lr",
  livePolarFieldReleaseDbPerSec: 15,
  livePolarLevelGatePct: 28,
  livePolarSampleFillBrightnessPct: 10,
  livePolarSampleRadiusGamma: 0.5,
  liveSoundFieldMode: "polarSample",
  liveSpectrumMode: "fft",
  liveSpectrumPeakHoldSec: 0,
  liveSpectrumReleaseDbPerSec: 15,
  liveSpectrumTiltDbPerOct: 0,
});
const events: Record<keyof VisualizationSettings, string> = {
  hearingProtectionEnabled: EventType.AS_UPDATE_HEARING_PROTECTION_ENABLED,
  hearingProtectionPeakDbFs: EventType.AS_UPDATE_HEARING_PROTECTION_PEAK_DBFS,
  liveAnalysisFftSize: EventType.AS_UPDATE_LIVE_ANALYSIS_FFT_SIZE,
  liveCqtLfRes: EventType.AS_UPDATE_LIVE_CQT_LF_RES,
  liveLevelMeterReleaseDbPerSec: EventType.AS_UPDATE_LIVE_LEVEL_METER_SMOOTHING,
  liveMonitoringMode: EventType.AS_UPDATE_LIVE_MONITORING_MODE,
  livePolarFieldReleaseDbPerSec: EventType.AS_UPDATE_LIVE_POLAR_FIELD_SMOOTHING,
  livePolarLevelGatePct: EventType.AS_UPDATE_LIVE_POLAR_LEVEL_GATE,
  livePolarSampleFillBrightnessPct:
    EventType.AS_UPDATE_LIVE_POLAR_SAMPLE_FILL_BRIGHTNESS,
  livePolarSampleRadiusGamma:
    EventType.AS_UPDATE_LIVE_POLAR_SAMPLE_RADIUS_GAMMA,
  liveSoundFieldMode: EventType.AS_UPDATE_LIVE_SOUND_FIELD_MODE,
  liveSpectrumMode: EventType.AS_UPDATE_LIVE_SPECTRUM_MODE,
  liveSpectrumPeakHoldSec: EventType.AS_UPDATE_LIVE_SPECTRUM_PEAK_HOLD,
  liveSpectrumReleaseDbPerSec: EventType.AS_UPDATE_LIVE_SPECTRUM_SMOOTHING,
  liveSpectrumTiltDbPerOct: EventType.AS_UPDATE_LIVE_SPECTRUM_TILT,
};
/** View-local settings; no VS Code persistence or playback ownership. */
export function createSettings(
  initial: Partial<VisualizationSettings> = {},
): LiveSettings & {
  setOptions(options: Partial<VisualizationSettings>): void;
} {
  const target = Object.assign(new EventTarget(), defaultSettings);
  const setOptions = (options: Partial<VisualizationSettings>) => {
    const changes: [keyof VisualizationSettings, unknown][] = [];
    for (const key of Object.keys(options) as (keyof VisualizationSettings)[]) {
      if (!Object.prototype.hasOwnProperty.call(defaultSettings, key)) {
        throw new TypeError(`Unknown setting: ${key}`);
      }
      let value = options[key];
      const fallback = defaultSettings[key];
      if (typeof fallback === "number") {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new RangeError(`${key} must be finite`);
        }
        if (key.includes("ReleaseDbPerSec")) {
          value = clampReleaseDbPerSec(value);
        }
      }
      if (key === "liveSpectrumPeakHoldSec") {
        value = clampLiveSpectrumPeakHoldSec(value as number);
      }
      if (key === "livePolarSampleRadiusGamma") {
        value = clampPolarSampleRadiusGamma(value as number);
      }
      if (key === "livePolarSampleFillBrightnessPct") {
        value = clampPolarSampleFillBrightnessPct(value as number);
      }
      if (key === "livePolarLevelGatePct") {
        value = Math.min(100, Math.max(0, Math.round(value as number)));
      }
      if (key === "hearingProtectionPeakDbFs") {
        value = Math.min(12, Math.max(-12, value as number));
      }
      const choices: Partial<
        Record<keyof VisualizationSettings, readonly unknown[]>
      > = {
        liveAnalysisFftSize: [512, 1024, 2048, 4096],
        liveCqtLfRes: [40, 20, 10],
        liveMonitoringMode: ["lr", "swap", "l", "r", "m", "s"],
        liveSoundFieldMode: ["polarSample", "polarLevel", "lissajous"],
        liveSpectrumMode: ["fft", "cqt"],
        liveSpectrumTiltDbPerOct: [0, 1.5, 3, 4.5, 6],
      };
      if (choices[key] && !choices[key].includes(value)) {
        throw new RangeError(`Invalid ${key}`);
      }
      if (typeof fallback === "boolean" && typeof value !== "boolean") {
        throw new TypeError(`${key} must be boolean`);
      }
      changes.push([key, value]);
    }
    for (const [key, value] of changes) {
      if (target[key] !== value) {
        Object.assign(target, { [key]: value });
        target.dispatchEvent(
          new CustomEvent(events[key], { detail: { value } }),
        );
      }
    }
  };
  setOptions(initial);
  return Object.assign(target, { setOptions });
}
