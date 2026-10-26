import GoniometerComponent from "../../webview/components/liveMeters/goniometerComponent";
import { mountView, type ViewOptions, type VisualizationView } from "./shared";
export type { ViewOptions, VisualizationView } from "./shared";
export function createStereoField(
  container: HTMLElement,
  options: ViewOptions,
): VisualizationView {
  return mountView(container, options, (mount, settings) => {
    mount.classList.add("ear-sdk--stereoField");
    const pane = document.createElement("div");
    pane.className = "goniometerPane";
    pane.style.height = "100%";
    mount.append(pane);
    return new GoniometerComponent(
      pane,
      options.source,
      settings,
      options.comparison,
    );
  });
}
