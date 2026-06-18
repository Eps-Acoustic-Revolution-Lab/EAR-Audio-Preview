import Service from "../service";
import { EventType } from "../events";
import type {
  HeadphoneEqPersistedState,
  HeadphoneEqProfile,
} from "../types/headphoneEq";

export default class HeadphoneEqSettingsService extends Service {
  private _bypassed = true;
  private _profile: HeadphoneEqProfile | null = null;

  public get bypassed(): boolean {
    return this._bypassed;
  }

  public set bypassed(value: boolean) {
    const next = !!value;
    if (next === this._bypassed) {
      return;
    }
    this._bypassed = next;
    this.dispatchEvent(
      new CustomEvent(EventType.HE_UPDATE_BYPASSED, {
        detail: { value: this._bypassed },
      }),
    );
  }

  public get profile(): HeadphoneEqProfile | null {
    return this._profile;
  }

  public shouldApplyEq(): boolean {
    return this._profile !== null && !this._bypassed;
  }

  public setProfile(profile: HeadphoneEqProfile | null, opts?: { keepBypass?: boolean }) {
    this._profile = profile ? structuredClone(profile) : null;
    if (profile && opts?.keepBypass !== true) {
      this._bypassed = false;
    }
    this.dispatchEvent(
      new CustomEvent(EventType.HE_UPDATE_PROFILE, {
        detail: { profile: this._profile },
      }),
    );
    if (profile && opts?.keepBypass !== true) {
      this.dispatchEvent(
        new CustomEvent(EventType.HE_UPDATE_BYPASSED, {
          detail: { value: this._bypassed },
        }),
      );
    }
  }

  public updateFilters(filters: HeadphoneEqProfile["filters"]): void {
    if (!this._profile) {
      return;
    }
    this._profile.filters = structuredClone(filters);
    this._profile.isCustomized = true;
    this.dispatchEvent(
      new CustomEvent(EventType.HE_UPDATE_PROFILE, {
        detail: { profile: this._profile },
      }),
    );
  }

  public resetToBaseSnapshot(): void {
    if (!this._profile?.baseSnapshot) {
      return;
    }
    const snap = structuredClone(this._profile.baseSnapshot);
    snap.baseSnapshot = structuredClone(this._profile.baseSnapshot);
    this._profile = snap;
    this.dispatchEvent(
      new CustomEvent(EventType.HE_UPDATE_PROFILE, {
        detail: { profile: this._profile },
      }),
    );
  }

  public loadPersisted(state: HeadphoneEqPersistedState | null | undefined): void {
    if (!state || typeof state !== "object") {
      return;
    }
    this._bypassed = state.bypassed !== false;
    this._profile = state.profile ? structuredClone(state.profile) : null;
    if (this._profile?.baseSnapshot) {
      this._profile.baseSnapshot = structuredClone(this._profile.baseSnapshot);
    }
    this.dispatchEvent(
      new CustomEvent(EventType.HE_UPDATE_PROFILE, {
        detail: { profile: this._profile },
      }),
    );
    this.dispatchEvent(
      new CustomEvent(EventType.HE_UPDATE_BYPASSED, {
        detail: { value: this._bypassed },
      }),
    );
  }

  public toPersisted(): HeadphoneEqPersistedState {
    return {
      bypassed: this._bypassed,
      profile: this._profile ? structuredClone(this._profile) : null,
    };
  }

  public requestOpenOverlay(): void {
    this.dispatchEvent(new CustomEvent(EventType.HE_OPEN_OVERLAY));
  }
}
