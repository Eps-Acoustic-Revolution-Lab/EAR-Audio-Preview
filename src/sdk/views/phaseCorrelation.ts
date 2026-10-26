import PhaseCorrelationSpectrumComponent from "../../webview/components/liveMeters/phaseCorrelationSpectrumComponent";
import { mountView, type ViewOptions, type VisualizationView } from "./shared";
export type { ViewOptions, VisualizationView } from "./shared";
export function createPhaseCorrelation(
  container: HTMLElement,
  options: ViewOptions,
): VisualizationView {
  return mountView(container, options, (mount, settings) => {
    mount.classList.add("ear-sdk--phaseCorrelation");
    return new PhaseCorrelationSpectrumComponent(
      mount,
      options.source,
      settings,
      options.comparison,
    );
  });
}
