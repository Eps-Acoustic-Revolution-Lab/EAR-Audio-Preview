import SpectralAnalyzerComponent from "../../webview/components/liveMeters/spectralAnalyzerComponent";
import { mountView, type ViewOptions, type VisualizationView } from "./shared";
export type { ViewOptions, VisualizationView } from "./shared";
export function createSpectrum(
  container: HTMLElement,
  options: ViewOptions,
): VisualizationView {
  return mountView(
    container,
    options,
    (mount, settings) =>
      new SpectralAnalyzerComponent(
        mount,
        options.source,
        settings,
        options.comparison,
      ),
  );
}
