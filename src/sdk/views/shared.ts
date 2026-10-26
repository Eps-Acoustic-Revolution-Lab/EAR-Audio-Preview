import { createSettings, type VisualizationSettings } from "../settings";
import type {
  LiveComparisonInput,
  LivePlayback,
} from "../../webview/components/liveMeters/liveAnalysisInput";
export type {
  LiveComparisonInput,
  LiveTrackFrame,
  LiveComparisonSnapshot,
} from "../../webview/components/liveMeters/liveAnalysisInput";
export interface ViewOptions {
  source: LivePlayback;
  settings?: Partial<VisualizationSettings>;
  comparison?: LiveComparisonInput;
}
export interface VisualizationView {
  setOptions(options: Partial<VisualizationSettings>): void;
  resize(): void;
  reset(): void;
  suspend(): void;
  resume(): void;
  dispose(): void;
}
export interface ViewComponent {
  dispose(): void;
  resize?(): void;
  suspend?(): void;
  resume?(): void;
}
export function mountView(
  container: HTMLElement,
  options: ViewOptions,
  factory: (
    mount: HTMLElement,
    settings: ReturnType<typeof createSettings>,
  ) => ViewComponent,
): VisualizationView {
  const mount = document.createElement("div");
  mount.className = "ear-sdk";
  const settings = createSettings(options.settings);
  const fftSize = () =>
    settings.liveSpectrumMode === "cqt" ? 32768 : settings.liveAnalysisFftSize;
  let releaseFft = options.source.acquireFftSize?.(fftSize());
  let component: ViewComponent;
  container.append(mount);
  try {
    component = factory(mount, settings);
  } catch (error) {
    releaseFft?.();
    mount.remove();
    throw error;
  }
  let disposed = false;
  let suspended = false;
  const resize = () => {
    if (!disposed && !suspended) {
      component.resize?.();
    }
  };
  const observer =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
  observer?.observe(mount);
  return {
    setOptions(update) {
      if (disposed) {
        return;
      }
      const validated = createSettings({
        ...Object.fromEntries(
          Object.keys(settings)
            .filter((key) => key !== "setOptions")
            .map((key) => [key, settings[key as keyof VisualizationSettings]]),
        ),
        ...update,
      });
      if (
        update.liveAnalysisFftSize !== undefined ||
        update.liveSpectrumMode !== undefined
      ) {
        const previous = releaseFft;
        releaseFft = options.source.acquireFftSize?.(
          validated.liveSpectrumMode === "cqt"
            ? 32768
            : validated.liveAnalysisFftSize,
        );
        previous?.();
      }
      settings.setOptions(update);
      resize();
    },
    resize,
    reset() {
      if (disposed) {
        return;
      }
      component.dispose();
      mount.replaceChildren();
      try {
        component = factory(mount, settings);
      } catch (error) {
        disposed = true;
        observer?.disconnect();
        releaseFft?.();
        mount.remove();
        throw error;
      }
      if (suspended) {
        component.suspend?.();
      } else {
        resize();
      }
    },
    suspend() {
      if (!disposed && !suspended) {
        suspended = true;
        component.suspend?.();
      }
    },
    resume() {
      if (!disposed && suspended) {
        suspended = false;
        component.resume?.();
        resize();
      }
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      observer?.disconnect();
      component.dispose();
      releaseFft?.();
      mount.remove();
    },
  };
}
