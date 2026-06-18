export type EqFilterType = "peaking" | "lowshelf" | "highshelf";

export interface EqFilterBand {
  enabled: boolean;
  type: EqFilterType;
  frequency: number;
  gainDb: number;
  q: number;
}

export interface HeadphoneEqProfileMeta {
  name: string;
  source: string;
  rig: string;
  form: string;
  targetLabel: string;
  origin?: "autoeq" | "imported" | "workspace";
  importedFrom?: string;
}

export interface HeadphoneEqProfile {
  id: string;
  displayName: string;
  meta: HeadphoneEqProfileMeta;
  preampDb: number;
  filters: EqFilterBand[];
  isCustomized: boolean;
  baseSnapshot?: HeadphoneEqProfile;
}

export interface HeadphoneEqPersistedState {
  bypassed: boolean;
  profile: HeadphoneEqProfile | null;
}

export interface AutoEqEntryVariant {
  source: string;
  rig: string;
  form: string;
}

export type AutoEqEntries = Record<string, AutoEqEntryVariant[]>;

export interface AutoEqTarget {
  label: string;
  compatible: Array<{ source: string; form: string; rig?: string }>;
  recommended: Array<{ source: string; form: string; rig?: string }>;
  bassBoost?: { fc: number; q: number; gain: number };
}
