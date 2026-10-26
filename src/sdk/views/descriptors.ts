import SpectralDescriptorLane from "../../webview/components/liveMeters/spectralDescriptorLane";
import { mountView, type ViewOptions, type VisualizationView } from "./shared";
export type { ViewOptions, VisualizationView } from "./shared";
export function createDescriptors(
  container: HTMLElement,
  options: ViewOptions,
): VisualizationView {
  return mountView(container, options, (mount, settings) => {
    mount.classList.add("ear-sdk--descriptors");
    const lane = new SpectralDescriptorLane(
      mount,
      options.source,
      settings,
      options.comparison,
    );
    mount.querySelector("details").open = true;
    let raf = 0;
    let suspended = false;
    let disposed = false;
    const update = () => {
      if (!suspended && !disposed) {
        lane.update(true);
      }
    };
    const loop = () => {
      if (disposed || suspended) {
        return;
      }
      lane.update();
      raf = requestAnimationFrame(loop);
    };
    const unsubscribe = options.comparison?.subscribe(update);
    loop();
    return {
      resize: update,
      suspend() {
        suspended = true;
        cancelAnimationFrame(raf);
      },
      resume() {
        if (!suspended || disposed) {
          return;
        }
        suspended = false;
        update();
        loop();
      },
      dispose() {
        disposed = true;
        cancelAnimationFrame(raf);
        unsubscribe?.();
        lane.dispose();
      },
    };
  });
}
