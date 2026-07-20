/* eslint-disable @typescript-eslint/naming-convention */
import type {
  AutoEqEntries,
  AutoEqEntryVariant,
  AutoEqTarget,
  EqFilterBand,
  EqFilterType,
  HeadphoneEqProfile,
} from "../types/headphoneEq";
import type { AutoEqRequestEndpoint } from "../../message";

const CACHE_MAX = 48;
const cache = new Map<string, HeadphoneEqProfile>();

let entriesPromise: Promise<AutoEqEntries> | null = null;
let targetsPromise: Promise<AutoEqTarget[]> | null = null;

/** Single source of truth: the wire endpoint union from message.ts. */
export type AutoEqEndpoint = AutoEqRequestEndpoint;

export interface AutoEqHostRequest {
  endpoint: AutoEqEndpoint;
  body?: {
    name: string;
    source: string;
    rig: string;
    target: string;
    fs: number;
  };
}

type AutoEqHostFn = (req: AutoEqHostRequest) => Promise<unknown>;

let hostRequest: AutoEqHostFn | null = null;

/** Route AutoEq HTTP through Extension Host (required: autoeq.app has no CORS for webviews). */
export function bindAutoEqHost(fn: AutoEqHostFn): void {
  hostRequest = fn;
}

export function unbindAutoEqHost(): void {
  hostRequest = null;
}

async function fetchJson<T>(endpoint: AutoEqEndpoint): Promise<T> {
  if (!hostRequest) {
    // All AutoEq traffic must go through the Extension Host: the webview CSP
    // has no connect-src for autoeq.app, so a direct fetch can never succeed.
    throw new Error(
      "AutoEq host bridge not initialized (bindAutoEqHost missing)",
    );
  }
  return (await hostRequest({ endpoint })) as T;
}

function cacheKey(parts: {
  name: string;
  source: string;
  rig: string;
  target: string;
  fs: number;
}): string {
  return `${parts.name}|${parts.source}|${parts.rig}|${parts.target}|${parts.fs}`;
}

function lruSet(key: string, value: HeadphoneEqProfile): void {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  if (cache.size > CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first) {
      cache.delete(first);
    }
  }
}

function mapFilterType(raw: string): EqFilterType {
  const t = raw.toUpperCase();
  if (t === "LOW_SHELF" || t === "LSC") {
    return "lowshelf";
  }
  if (t === "HIGH_SHELF" || t === "HSC") {
    return "highshelf";
  }
  return "peaking";
}

function toWebAudioType(type: EqFilterType): BiquadFilterType {
  if (type === "lowshelf") {
    return "lowshelf";
  }
  if (type === "highshelf") {
    return "highshelf";
  }
  return "peaking";
}

export { toWebAudioType };

interface RawPeqFilter {
  type?: string;
  fc?: number;
  q?: number;
  gain?: number;
  enabled?: boolean;
}

interface EqualizeResponse {
  parametric_eq?: {
    preamp?: number;
    filters?: RawPeqFilter[];
  };
}

export function buildProfileId(
  name: string,
  variant: AutoEqEntryVariant,
  targetLabel: string,
): string {
  return `${name}|${variant.source}|${variant.rig}|${targetLabel}`;
}

export function buildDisplayName(name: string, targetLabel: string): string {
  return `${name} · ${targetLabel}`;
}

export function mapEqualizeResponse(
  name: string,
  variant: AutoEqEntryVariant,
  targetLabel: string,
  body: EqualizeResponse,
): HeadphoneEqProfile {
  const peq = body.parametric_eq;
  if (!peq?.filters?.length) {
    throw new Error("AutoEq returned no parametric EQ filters");
  }
  const filters: EqFilterBand[] = peq.filters.map((f) => ({
    enabled: f.enabled !== false,
    type: mapFilterType(f.type ?? "PEAKING"),
    frequency: Number(f.fc) || 1000,
    gainDb: Number(f.gain) || 0,
    q: Number(f.q) || 1,
  }));
  const preampDb =
    typeof peq.preamp === "number"
      ? peq.preamp
      : -Math.max(0, ...filters.map((f) => (f.gainDb > 0 ? f.gainDb : 0)));
  const profile: HeadphoneEqProfile = {
    id: buildProfileId(name, variant, targetLabel),
    displayName: buildDisplayName(name, targetLabel),
    meta: {
      name,
      source: variant.source,
      rig: variant.rig,
      form: variant.form,
      targetLabel,
    },
    preampDb,
    filters,
    isCustomized: false,
  };
  profile.baseSnapshot = structuredClone(profile);
  return profile;
}

export async function fetchEntries(): Promise<AutoEqEntries> {
  if (!entriesPromise) {
    entriesPromise = fetchJson<AutoEqEntries>("entries").catch((err) => {
      entriesPromise = null;
      throw err;
    });
  }
  return entriesPromise;
}

export async function fetchTargets(): Promise<AutoEqTarget[]> {
  if (!targetsPromise) {
    targetsPromise = fetchJson<AutoEqTarget[]>("targets").catch((err) => {
      targetsPromise = null;
      throw err;
    });
  }
  return targetsPromise;
}

export function compatibleTargets(
  targets: AutoEqTarget[],
  variant: AutoEqEntryVariant,
): AutoEqTarget[] {
  return targets.filter((t) =>
    t.compatible.some(
      (c) =>
        c.source === variant.source &&
        c.form === variant.form &&
        (!c.rig || c.rig === variant.rig),
    ),
  );
}

export async function equalizeParametric(opts: {
  name: string;
  variant: AutoEqEntryVariant;
  targetLabel: string;
  fs: number;
}): Promise<HeadphoneEqProfile> {
  const key = cacheKey({
    name: opts.name,
    source: opts.variant.source,
    rig: opts.variant.rig,
    target: opts.targetLabel,
    fs: opts.fs,
  });
  const cached = cache.get(key);
  if (cached) {
    return structuredClone(cached);
  }

  let body: EqualizeResponse;
  if (hostRequest) {
    body = (await hostRequest({
      endpoint: "equalize",
      body: {
        name: opts.name,
        source: opts.variant.source,
        rig: opts.variant.rig,
        target: opts.targetLabel,
        fs: opts.fs,
      },
    })) as EqualizeResponse;
  } else {
    throw new Error(
      "AutoEq host bridge not initialized (bindAutoEqHost missing)",
    );
  }
  const profile = mapEqualizeResponse(
    opts.name,
    opts.variant,
    opts.targetLabel,
    body,
  );
  lruSet(key, profile);
  return structuredClone(profile);
}

/** Test-only reset of module caches. */
export function _resetAutoEqClientForTests(): void {
  cache.clear();
  entriesPromise = null;
  targetsPromise = null;
}
