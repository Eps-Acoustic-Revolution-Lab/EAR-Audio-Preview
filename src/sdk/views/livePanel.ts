import LiveAnalysisComponent from "../../webview/components/liveMeters/liveAnalysisComponent";
import LevelMeterComponent from "../../webview/components/liveMeters/levelMeterComponent";
import { mountView, type ViewOptions, type VisualizationView } from "./shared";
export type { ViewOptions, VisualizationView } from "./shared";
/** The complete EAR analysis panel, including fullscreen and resizable panes. */
export function createLivePanel(
  container: HTMLElement,
  options: ViewOptions,
): VisualizationView {
  return mountView(container, options, (mount, settings) => {
    mount.classList.add("ear-sdk-livePanel");
    const meterMount = document.createElement("div");
    meterMount.className = "ear-sdk-livePanel__meter";
    const analysisMount = document.createElement("div");
    analysisMount.className = "ear-sdk-livePanel__analysis";
    mount.append(meterMount, analysisMount);
    const meter = new LevelMeterComponent(meterMount, options.source, settings);
    let analysis: LiveAnalysisComponent;
    try {
      analysis = new LiveAnalysisComponent(
        analysisMount,
        options.source,
        settings,
        options.comparison,
      );
    } catch (error) {
      meter.dispose();
      throw error;
    }
    return {
      resize() {
        meter.resize();
        analysis.resize();
      },
      suspend() {
        meter.suspend();
        analysis.suspend();
      },
      resume() {
        meter.resume();
        analysis.resume();
      },
      dispose() {
        meter.dispose();
        analysis.dispose();
      },
    };
  });
}
