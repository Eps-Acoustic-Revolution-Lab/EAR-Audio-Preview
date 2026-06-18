/* eslint-disable @typescript-eslint/naming-convention */
import type {
  EqFilterBand,
  EqFilterType,
  HeadphoneEqPersistedState,
  HeadphoneEqProfile,
} from "../webview/types/headphoneEq";

function mapFilterType(raw: string): EqFilterType {
  const t = raw.toUpperCase();
  if (t === "LOW_SHELF" || t === "LSC" || t === "LS") {
    return "lowshelf";
  }
  if (t === "HIGH_SHELF" || t === "HSC" || t === "HS") {
    return "highshelf";
  }
  return "peaking";
}

function slugFileBase(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w\u4e00-\u9fff.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function buildImportedProfile(
  displayName: string,
  preampDb: number,
  filters: EqFilterBand[],
  importedFrom?: string,
): HeadphoneEqProfile {
  const profile: HeadphoneEqProfile = {
    id: `imported|${slugFileBase(displayName)}`,
    displayName,
    meta: {
      name: displayName,
      source: "imported",
      rig: "",
      form: "custom",
      targetLabel: "Custom",
      origin: "imported",
      importedFrom,
    },
    preampDb,
    filters,
    isCustomized: false,
  };
  profile.baseSnapshot = structuredClone(profile);
  return profile;
}

interface RawPeqFilter {
  type?: string;
  fc?: number;
  q?: number;
  gain?: number;
  enabled?: boolean;
}

function mapRawFilters(filters: RawPeqFilter[]): EqFilterBand[] {
  return filters.map((f) => ({
    enabled: f.enabled !== false,
    type: mapFilterType(f.type ?? "PEAKING"),
    frequency: Number(f.fc) || 1000,
    gainDb: Number(f.gain) || 0,
    q: Number(f.q) || 1,
  }));
}

function parseJsonPreset(text: string, fileName?: string): HeadphoneEqProfile {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid JSON preset");
  }
  const obj = parsed as Record<string, unknown>;

  if (obj.filters && obj.displayName && obj.meta) {
    const p = obj as unknown as HeadphoneEqProfile;
    if (!p.baseSnapshot) {
      p.baseSnapshot = structuredClone(p);
    }
    return structuredClone(p);
  }

  if (obj.profile && typeof obj.profile === "object") {
    const state = obj as unknown as HeadphoneEqPersistedState;
    if (!state.profile) {
      throw new Error("Persisted state has no profile");
    }
    const p = structuredClone(state.profile);
    if (!p.baseSnapshot) {
      p.baseSnapshot = structuredClone(p);
    }
    return p;
  }

  const peq = obj.parametric_eq as
    | { preamp?: number; filters?: RawPeqFilter[] }
    | undefined;
  if (peq?.filters?.length) {
    const filters = mapRawFilters(peq.filters);
    const preampDb =
      typeof peq.preamp === "number"
        ? peq.preamp
        : -Math.max(0, ...filters.map((f) => (f.gainDb > 0 ? f.gainDb : 0)));
    const baseName = fileName ? slugFileBase(fileName) : "Imported preset";
    return buildImportedProfile(baseName, preampDb, filters, fileName);
  }

  throw new Error("Unrecognized JSON preset format");
}

const FILTER_LINE =
  /^Filter\s*:?\s*(\d+)?\s*:\s*(ON|OFF)\s+(\S+)\s+(?:Fc\s+([\d.]+)\s*Hz)?(?:.*?Gain\s+([-\d.]+)\s*dB)?(?:.*?Q\s+([\d.]+))?/i;
const PREAMP_LINE = /^Preamp:\s*([-\d.]+)\s*dB/i;

function parseTxtPreset(text: string, fileName?: string): HeadphoneEqProfile {
  const filters: EqFilterBand[] = [];
  let preampDb = 0;
  let sawPreamp = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    if (/^(Device|Channel|Include):/i.test(line)) {
      continue;
    }

    const pre = line.match(PREAMP_LINE);
    if (pre) {
      preampDb = Number(pre[1]) || 0;
      sawPreamp = true;
      continue;
    }

    const m = line.match(FILTER_LINE);
    if (!m) {
      continue;
    }
    const enabled = m[2].toUpperCase() === "ON";
    const typeTok = m[3].toUpperCase();
    const fc = Number(m[4]) || 1000;
    const gainDb = Number(m[5]) || 0;
    const q = Number(m[6]) || 1;
    filters.push({
      enabled,
      type: mapFilterType(typeTok),
      frequency: fc,
      gainDb,
      q,
    });
  }

  if (!filters.length) {
    throw new Error("No filters found in preset text");
  }
  if (!sawPreamp) {
    preampDb = -Math.max(
      0,
      ...filters.map((f) => (f.gainDb > 0 ? f.gainDb : 0)),
    );
  }

  const baseName = fileName ? slugFileBase(fileName) : "Imported preset";
  return buildImportedProfile(baseName, preampDb, filters, fileName);
}

export function parseEqPresetFile(
  text: string,
  fileName?: string,
): HeadphoneEqProfile {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Empty preset file");
  }
  if (trimmed.startsWith("{")) {
    return parseJsonPreset(trimmed, fileName);
  }
  return parseTxtPreset(trimmed, fileName);
}

export function sanitizePresetFileName(displayName: string): string {
  const base = slugFileBase(displayName) || "preset";
  return `${base}.json`;
}
