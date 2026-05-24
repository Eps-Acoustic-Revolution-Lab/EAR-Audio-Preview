import { EventType } from "./events";

export type WorkspacePaneId =
  | "none"
  | "stft"
  | "liveSpec"
  | "edit"
  | "loudness";

let _activeWorkspacePane: WorkspacePaneId = "none";

export function getActiveWorkspacePane(): WorkspacePaneId {
  return _activeWorkspacePane;
}

export function setActiveWorkspacePane(pane: WorkspacePaneId): void {
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.dataset.workspacePane = pane;
  }
  _activeWorkspacePane = pane;
  document.dispatchEvent(
    new CustomEvent(EventType.WORKSPACE_ACTIVE_PANE, {
      detail: { pane },
    }),
  );
}
