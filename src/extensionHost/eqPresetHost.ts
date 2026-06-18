import * as vscode from "vscode";
import type { HeadphoneEqProfile } from "../webview/types/headphoneEq";
import { sanitizePresetFileName } from "../shared/parseEqPreset";

export const workspaceEqPresetsDir = "ear-eq-presets";

export interface WorkspaceEqPresetIndexEntry {
  fileName: string;
  displayName: string;
}

function presetsDirUri(workspaceFolder: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(workspaceFolder, ".vscode", workspaceEqPresetsDir);
}

async function ensurePresetsDir(dir: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.createDirectory(dir);
  } catch {
    /* may exist */
  }
}

function readDisplayNameFromJson(text: string, fileName: string): string {
  try {
    const parsed = JSON.parse(text) as { displayName?: string };
    if (parsed.displayName && typeof parsed.displayName === "string") {
      return parsed.displayName;
    }
  } catch {
    /* fallback */
  }
  return fileName.replace(/\.json$/i, "");
}

export async function listWorkspaceEqPresetsInHost(
  workspaceFolder: vscode.Uri,
): Promise<WorkspaceEqPresetIndexEntry[]> {
  const dir = presetsDirUri(workspaceFolder);
  try {
    const entries = await vscode.workspace.fs.readDirectory(dir);
    const out: WorkspaceEqPresetIndexEntry[] = [];
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File || !name.toLowerCase().endsWith(".json")) {
        continue;
      }
      try {
        const raw = await vscode.workspace.fs.readFile(
          vscode.Uri.joinPath(dir, name),
        );
        const text = new TextDecoder().decode(raw);
        out.push({
          fileName: name,
          displayName: readDisplayNameFromJson(text, name),
        });
      } catch {
        out.push({ fileName: name, displayName: name.replace(/\.json$/i, "") });
      }
    }
    out.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, {
        sensitivity: "base",
      }),
    );
    return out;
  } catch {
    return [];
  }
}

export async function readWorkspaceEqPresetInHost(
  workspaceFolder: vscode.Uri,
  fileName: string,
): Promise<HeadphoneEqProfile> {
  const uri = vscode.Uri.joinPath(presetsDirUri(workspaceFolder), fileName);
  const raw = await vscode.workspace.fs.readFile(uri);
  const profile = JSON.parse(
    new TextDecoder().decode(raw),
  ) as HeadphoneEqProfile;
  if (!profile?.filters) {
    throw new Error("Invalid preset file");
  }
  return profile;
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

export async function writeWorkspaceEqPresetInHost(
  workspaceFolder: vscode.Uri,
  profile: HeadphoneEqProfile,
): Promise<string> {
  const dir = presetsDirUri(workspaceFolder);
  await ensurePresetsDir(vscode.Uri.joinPath(workspaceFolder, ".vscode"));
  await ensurePresetsDir(dir);

  const base = sanitizePresetFileName(profile.displayName);
  let fileName = base;
  let n = 2;
  while (await fileExists(vscode.Uri.joinPath(dir, fileName))) {
    const stem = base.replace(/\.json$/i, "");
    fileName = `${stem} (${n}).json`;
    n += 1;
  }

  const json = JSON.stringify(profile, null, 2);
  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(dir, fileName),
    new TextEncoder().encode(json),
  );
  return fileName;
}

export async function pickEqPresetFileInHost(): Promise<
  { content: string; fileName: string } | undefined
> {
  const picks = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: "Import preset",
    filters: {
      /* eslint-disable @typescript-eslint/naming-convention -- VS Code open dialog label */
      "EQ presets": ["json", "txt"],
      /* eslint-enable @typescript-eslint/naming-convention */
    },
  });
  if (!picks?.[0]) {
    return undefined;
  }
  const raw = await vscode.workspace.fs.readFile(picks[0]);
  return {
    content: new TextDecoder().decode(raw),
    fileName: pathBasename(picks[0].fsPath),
  };
}

function pathBasename(fsPath: string): string {
  const parts = fsPath.split(/[/\\]/);
  return parts[parts.length - 1] ?? fsPath;
}
