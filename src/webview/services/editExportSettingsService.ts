import { getLimitedValueInRange, getRangeValues } from "../../util";
import Service from "../service";
import { EventType } from "../events";
import PlayerSettingsService from "./playerSettingsService";

export type ExportChannelMode =
  | "as_is"
  | "mono_mix"
  | "mono_left"
  | "mono_right"
  | "fake_stereo";

export type ExportDestination = "source_dir" | "workspace_root";

export type EditListenMode = "dry" | "processed";

export interface EditExportSettingsProps {
  regionStartSec: number;
  regionEndSec: number;
  listenMode: EditListenMode;
  channelMode: ExportChannelMode;
  enableHpf: boolean;
  hpfHz: number;
  enableLpf: boolean;
  lpfHz: number;
  syncFiltersFromPlayer: boolean;
  destination: ExportDestination;
}

const channelModes: ExportChannelMode[] = [
  "as_is",
  "mono_mix",
  "mono_left",
  "mono_right",
  "fake_stereo",
];

export default class EditExportSettingsService extends Service {
  private readonly _duration: number;
  private readonly _sampleRate: number;

  private _regionStartSec: number;
  private _regionEndSec: number;
  private _listenMode: EditListenMode;
  private _channelMode: ExportChannelMode;
  private _enableHpf: boolean;
  private _hpfHz: number;
  private _enableLpf: boolean;
  private _lpfHz: number;
  private _syncFiltersFromPlayer: boolean;
  private _destination: ExportDestination;

  public static create(audioBuffer: AudioBuffer): EditExportSettingsService {
    return new EditExportSettingsService(
      audioBuffer.duration,
      audioBuffer.sampleRate,
    );
  }

  constructor(duration: number, sampleRate: number) {
    super();
    this._duration = Math.max(0, duration);
    this._sampleRate = sampleRate;
    this._regionStartSec = 0;
    this._regionEndSec = this._duration;
    this._listenMode = "dry";
    this._channelMode = "as_is";
    this._enableHpf = false;
    this._hpfHz = PlayerSettingsService.FILTER_FREQUENCY_HPF_DEFAULT;
    this._enableLpf = false;
    this._lpfHz = PlayerSettingsService.FILTER_FREQUENCY_LPF_DEFAULT;
    this._syncFiltersFromPlayer = false;
    this._destination = "source_dir";
  }

  public get duration() {
    return this._duration;
  }

  public get sampleRate() {
    return this._sampleRate;
  }

  public get regionStartSec() {
    return this._regionStartSec;
  }

  public set regionStartSec(value: number) {
    const [start, end] = getRangeValues(
      value,
      this._regionEndSec,
      0,
      this._duration,
      0,
      this._duration,
    );
    const prevStart = this._regionStartSec;
    const prevEnd = this._regionEndSec;
    if (start === prevStart && end === prevEnd) {
      return;
    }
    this._regionStartSec = start;
    this._regionEndSec = end;
    if (start !== prevStart) {
      this.dispatchEvent(
        new CustomEvent(EventType.EE_UPDATE_REGION_START, {
          detail: { value: this._regionStartSec },
        }),
      );
    }
    if (end !== prevEnd) {
      this.dispatchEvent(
        new CustomEvent(EventType.EE_UPDATE_REGION_END, {
          detail: { value: this._regionEndSec },
        }),
      );
    }
  }

  public get regionEndSec() {
    return this._regionEndSec;
  }

  public set regionEndSec(value: number) {
    const [start, end] = getRangeValues(
      this._regionStartSec,
      value,
      0,
      this._duration,
      0,
      this._duration,
    );
    const prevStart = this._regionStartSec;
    const prevEnd = this._regionEndSec;
    if (start === prevStart && end === prevEnd) {
      return;
    }
    this._regionStartSec = start;
    this._regionEndSec = end;
    if (end !== prevEnd) {
      this.dispatchEvent(
        new CustomEvent(EventType.EE_UPDATE_REGION_END, {
          detail: { value: this._regionEndSec },
        }),
      );
    }
    if (start !== prevStart) {
      this.dispatchEvent(
        new CustomEvent(EventType.EE_UPDATE_REGION_START, {
          detail: { value: this._regionStartSec },
        }),
      );
    }
  }

  public setRegion(startSec: number, endSec: number) {
    const [start, end] = getRangeValues(
      startSec,
      endSec,
      0,
      this._duration,
      0,
      this._duration,
    );
    if (
      start === this._regionStartSec &&
      end === this._regionEndSec
    ) {
      return;
    }
    this._regionStartSec = start;
    this._regionEndSec = end;
    this.dispatchEvent(
      new CustomEvent(EventType.EE_UPDATE_REGION_START, {
        detail: { value: this._regionStartSec },
      }),
    );
    this.dispatchEvent(
      new CustomEvent(EventType.EE_UPDATE_REGION_END, {
        detail: { value: this._regionEndSec },
      }),
    );
  }

  public selectAll() {
    this.setRegion(0, this._duration);
  }

  public importFromAnalyzer(minTime: number, maxTime: number) {
    this.setRegion(minTime, maxTime);
  }

  public get listenMode() {
    return this._listenMode;
  }

  public set listenMode(value: EditListenMode) {
    const next: EditListenMode = value === "processed" ? "processed" : "dry";
    if (next === this._listenMode) {
      return;
    }
    this._listenMode = next;
    this.dispatchEvent(
      new CustomEvent(EventType.EE_UPDATE_LISTEN_MODE, {
        detail: { value: this._listenMode },
      }),
    );
  }

  public get channelMode() {
    return this._channelMode;
  }

  public set channelMode(value: ExportChannelMode) {
    const next = channelModes.includes(value) ? value : "as_is";
    if (next === this._channelMode) {
      return;
    }
    this._channelMode = next;
    this.dispatchEvent(
      new CustomEvent(EventType.EE_UPDATE_CHANNEL_MODE, {
        detail: { value: this._channelMode },
      }),
    );
  }

  public get enableHpf() {
    return this._enableHpf;
  }

  public set enableHpf(value: boolean) {
    this._enableHpf = !!value;
    this.dispatchEvent(
      new CustomEvent(EventType.EE_UPDATE_ENABLE_HPF, {
        detail: { value: this._enableHpf },
      }),
    );
  }

  public get hpfHz() {
    return this._hpfHz;
  }

  public set hpfHz(value: number) {
    this._hpfHz = getLimitedValueInRange(
      value,
      PlayerSettingsService.FILTER_FREQUENCY_MIN,
      this._sampleRate / 2,
      PlayerSettingsService.FILTER_FREQUENCY_HPF_DEFAULT,
    );
    this.dispatchEvent(
      new CustomEvent(EventType.EE_UPDATE_HPF_HZ, {
        detail: { value: this._hpfHz },
      }),
    );
  }

  public get enableLpf() {
    return this._enableLpf;
  }

  public set enableLpf(value: boolean) {
    this._enableLpf = !!value;
    this.dispatchEvent(
      new CustomEvent(EventType.EE_UPDATE_ENABLE_LPF, {
        detail: { value: this._enableLpf },
      }),
    );
  }

  public get lpfHz() {
    return this._lpfHz;
  }

  public set lpfHz(value: number) {
    this._lpfHz = getLimitedValueInRange(
      value,
      PlayerSettingsService.FILTER_FREQUENCY_MIN,
      this._sampleRate / 2,
      PlayerSettingsService.FILTER_FREQUENCY_LPF_DEFAULT,
    );
    this.dispatchEvent(
      new CustomEvent(EventType.EE_UPDATE_LPF_HZ, {
        detail: { value: this._lpfHz },
      }),
    );
  }

  public get syncFiltersFromPlayer() {
    return this._syncFiltersFromPlayer;
  }

  public set syncFiltersFromPlayer(value: boolean) {
    this._syncFiltersFromPlayer = !!value;
    this.dispatchEvent(
      new CustomEvent(EventType.EE_UPDATE_SYNC_FILTERS, {
        detail: { value: this._syncFiltersFromPlayer },
      }),
    );
  }

  public get destination() {
    return this._destination;
  }

  public set destination(value: ExportDestination) {
    const next: ExportDestination =
      value === "workspace_root" ? "workspace_root" : "source_dir";
    if (next === this._destination) {
      return;
    }
    this._destination = next;
    this.dispatchEvent(
      new CustomEvent(EventType.EE_UPDATE_DESTINATION, {
        detail: { value: this._destination },
      }),
    );
  }

  public applyPlayerFilterSync(
    player: PlayerSettingsService,
    opts?: { silent?: boolean },
  ) {
    if (!this._syncFiltersFromPlayer) {
      return;
    }
    const nextEnableHpf = player.enableHpf;
    const nextHpfHz = player.hpfFrequency;
    const nextEnableLpf = player.enableLpf;
    const nextLpfHz = player.lpfFrequency;
    const hpfEnableChanged = nextEnableHpf !== this._enableHpf;
    const hpfHzChanged = nextHpfHz !== this._hpfHz;
    const lpfEnableChanged = nextEnableLpf !== this._enableLpf;
    const lpfHzChanged = nextLpfHz !== this._lpfHz;
    if (
      !hpfEnableChanged &&
      !hpfHzChanged &&
      !lpfEnableChanged &&
      !lpfHzChanged
    ) {
      return;
    }
    this._enableHpf = nextEnableHpf;
    this._hpfHz = nextHpfHz;
    this._enableLpf = nextEnableLpf;
    this._lpfHz = nextLpfHz;
    if (opts?.silent) {
      return;
    }
    if (hpfEnableChanged) {
      this.dispatchEvent(
        new CustomEvent(EventType.EE_UPDATE_ENABLE_HPF, {
          detail: { value: this._enableHpf },
        }),
      );
    }
    if (hpfHzChanged) {
      this.dispatchEvent(
        new CustomEvent(EventType.EE_UPDATE_HPF_HZ, {
          detail: { value: this._hpfHz },
        }),
      );
    }
    if (lpfEnableChanged) {
      this.dispatchEvent(
        new CustomEvent(EventType.EE_UPDATE_ENABLE_LPF, {
          detail: { value: this._enableLpf },
        }),
      );
    }
    if (lpfHzChanged) {
      this.dispatchEvent(
        new CustomEvent(EventType.EE_UPDATE_LPF_HZ, {
          detail: { value: this._lpfHz },
        }),
      );
    }
  }

  public toProps(): EditExportSettingsProps {
    return {
      regionStartSec: this._regionStartSec,
      regionEndSec: this._regionEndSec,
      listenMode: this._listenMode,
      channelMode: this._channelMode,
      enableHpf: this._enableHpf,
      hpfHz: this._hpfHz,
      enableLpf: this._enableLpf,
      lpfHz: this._lpfHz,
      syncFiltersFromPlayer: this._syncFiltersFromPlayer,
      destination: this._destination,
    };
  }
}
