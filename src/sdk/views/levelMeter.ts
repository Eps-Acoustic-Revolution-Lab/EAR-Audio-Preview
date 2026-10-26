import LevelMeterComponent from "../../webview/components/liveMeters/levelMeterComponent";
import type { RmsWeighting } from "../../webview/utils/frequencyWeightedRms";
import type { VisualizationSettings } from "../settings";
import { mountView, type ViewOptions, type VisualizationView } from "./shared";
export type { ViewOptions, VisualizationView } from "./shared";
export interface LevelMeterOptions extends ViewOptions {
  weighting?: RmsWeighting;
}
export interface LevelMeterView extends VisualizationView {
  setOptions(
    options: Partial<VisualizationSettings> & { weighting?: RmsWeighting },
  ): void;
}
export function createLevelMeter(
  container: HTMLElement,
  options: LevelMeterOptions,
): LevelMeterView {
  let weighting = options.weighting ?? "Z";
  if (!["Z", "A", "B", "C"].includes(weighting)) {
    throw new RangeError("Invalid RMS weighting");
  }
  let meter: LevelMeterComponent;
  const view = mountView(container, options, (mount, settings) => {
    meter = new LevelMeterComponent(mount, options.source, settings);
    meter.setWeighting(weighting);
    return meter;
  });
  let disposed = false;
  return {
    ...view,
    dispose() {
      disposed = true;
      view.dispose();
    },
    setOptions(update) {
      if (disposed) {
        return;
      }
      const { weighting: next, ...settings } = update;
      if (next !== undefined && !["Z", "A", "B", "C"].includes(next)) {
        throw new RangeError("Invalid RMS weighting");
      }
      view.setOptions(settings);
      if (next !== undefined) {
        weighting = next;
        meter.setWeighting(next);
      }
    },
  };
}
