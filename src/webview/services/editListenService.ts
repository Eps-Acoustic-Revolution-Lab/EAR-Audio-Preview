import Service from "../service";
import { EventType } from "../events";
import AnalyzeSettingsService from "./analyzeSettingsService";
import EditExportSettingsService, {
  EditListenMode,
} from "./editExportSettingsService";
import PlayerSettingsService from "./playerSettingsService";
import PlayerService from "./playerService";
import {
  renderExportBuffer,
  resolveExportSettings,
} from "./audioExportService";

interface AnalyzeTimeSnapshot {
  minTime: number;
  maxTime: number;
}

export default class EditListenService extends Service {
  private _active = false;
  private _analyzeSnapshot: AnalyzeTimeSnapshot | null = null;
  private _audioBuffer: AudioBuffer;
  private _editExportSettings: EditExportSettingsService;
  private _playerSettings: PlayerSettingsService;
  private _analyzeSettings: AnalyzeSettingsService;
  private _playerService: PlayerService;

  private _processedCacheKey = "";
  private _processedBuffer: AudioBuffer | null = null;
  private _processedPromise: Promise<AudioBuffer | null> | null = null;
  private _renderDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    audioBuffer: AudioBuffer,
    editExportSettings: EditExportSettingsService,
    playerSettings: PlayerSettingsService,
    analyzeSettings: AnalyzeSettingsService,
    playerService: PlayerService,
  ) {
    super();
    this._audioBuffer = audioBuffer;
    this._editExportSettings = editExportSettings;
    this._playerSettings = playerSettings;
    this._analyzeSettings = analyzeSettings;
    this._playerService = playerService;

    const onProcessedSettingChange = () => {
      if (!this._active) {
        return;
      }
      if (this._editExportSettings.listenMode !== "processed") {
        return;
      }
      this.scheduleProcessedRefresh();
    };

    const regionEvents = [
      EventType.EE_UPDATE_REGION_START,
      EventType.EE_UPDATE_REGION_END,
    ];
    for (const type of regionEvents) {
      this._editExportSettings.addEventListener(type, () => {
        if (!this._active) {
          return;
        }
        this.onRegionChanged(
          this._editExportSettings.regionStartSec,
          this._editExportSettings.regionEndSec,
        );
        this.invalidateCache();
        this._pauseIfPlaying();
        void this._updatePlayerListenState();
      });
    }

    this._editExportSettings.addEventListener(
      EventType.EE_UPDATE_LISTEN_MODE,
      () => {
        if (!this._active) {
          return;
        }
        void this.onListenModeChanged();
      },
    );

    const settingEvents = [
      EventType.EE_UPDATE_CHANNEL_MODE,
      EventType.EE_UPDATE_ENABLE_HPF,
      EventType.EE_UPDATE_HPF_HZ,
      EventType.EE_UPDATE_ENABLE_LPF,
      EventType.EE_UPDATE_LPF_HZ,
      EventType.EE_UPDATE_SYNC_FILTERS,
    ];
    for (const type of settingEvents) {
      this._editExportSettings.addEventListener(type, onProcessedSettingChange);
    }

    const onPlayerFilterChange = () => {
      if (!this._active) {
        return;
      }
      if (!this._editExportSettings.syncFiltersFromPlayer) {
        return;
      }
      if (this._editExportSettings.listenMode !== "processed") {
        return;
      }
      this.scheduleProcessedRefresh();
    };
    this._playerSettings.addEventListener(
      EventType.PS_UPDATE_ENABLE_HPF,
      onPlayerFilterChange,
    );
    this._playerSettings.addEventListener(
      EventType.PS_UPDATE_HPF_FREQUENCY,
      onPlayerFilterChange,
    );
    this._playerSettings.addEventListener(
      EventType.PS_UPDATE_ENABLE_LPF,
      onPlayerFilterChange,
    );
    this._playerSettings.addEventListener(
      EventType.PS_UPDATE_LPF_FREQUENCY,
      onPlayerFilterChange,
    );
  }

  public get active() {
    return this._active;
  }

  public enter() {
    if (this._active) {
      return;
    }
    this._active = true;
    this._analyzeSnapshot = {
      minTime: this._analyzeSettings.minTime,
      maxTime: this._analyzeSettings.maxTime,
    };
    this.onRegionChanged(
      this._editExportSettings.regionStartSec,
      this._editExportSettings.regionEndSec,
    );
    void this._updatePlayerListenState();
    this.dispatchEvent(
      new CustomEvent(EventType.EL_UPDATE_ACTIVE, {
        detail: { value: true },
      }),
    );
  }

  public leave() {
    if (!this._active) {
      return;
    }
    this._active = false;
    if (this._analyzeSnapshot) {
      this._analyzeSettings.minTime = this._analyzeSnapshot.minTime;
      this._analyzeSettings.maxTime = this._analyzeSnapshot.maxTime;
      this._analyzeSnapshot = null;
    }
    const wasPlaying = this._playerService.isPlaying;
    if (wasPlaying) {
      this._playerService.pause();
    }
    this._playerService.setEditListenState({ active: false });
    if (wasPlaying) {
      this._playerService.play();
    }
    // Re-emit the cue position so playhead overlays reproject the white line
    // onto the restored (non-edit) time window — otherwise it keeps the
    // percent computed under the edit region view (visually far left).
    this._playerService.setPlaybackPosition(
      this._playerService.playbackPosition,
    );
    this.invalidateCache();
    this.dispatchEvent(
      new CustomEvent(EventType.EL_UPDATE_ACTIVE, {
        detail: { value: false },
      }),
    );
  }

  public onRegionChanged(startSec: number, endSec: number) {
    if (!this._active) {
      return;
    }
    this._analyzeSettings.minTime = startSec;
    this._analyzeSettings.maxTime = endSec;
    this._playerService.setPlaybackPosition(startSec);
  }

  public invalidateCache() {
    this._processedCacheKey = "";
    this._processedBuffer = null;
    this._processedPromise = null;
    if (this._renderDebounceTimer !== null) {
      clearTimeout(this._renderDebounceTimer);
      this._renderDebounceTimer = null;
    }
  }

  private _pauseIfPlaying(): void {
    if (this._playerService.isPlaying) {
      this._playerService.pause();
    }
  }

  private _resolvedSettings() {
    this._editExportSettings.applyPlayerFilterSync(this._playerSettings, {
      silent: true,
    });
    return resolveExportSettings(
      this._editExportSettings.toProps(),
      this._playerSettings,
    );
  }

  private _settingsCacheKey(): string {
    return JSON.stringify(this._resolvedSettings());
  }

  public async getProcessedBuffer(): Promise<AudioBuffer | null> {
    const key = this._settingsCacheKey();
    if (this._processedBuffer && key === this._processedCacheKey) {
      return this._processedBuffer;
    }
    if (this._processedPromise && key === this._processedCacheKey) {
      return this._processedPromise;
    }
    this._processedCacheKey = key;
    this._processedPromise = renderExportBuffer(
      this._audioBuffer,
      this._resolvedSettings(),
    )
      .then((buf) => {
        this._processedBuffer = buf;
        return buf;
      })
      .catch(() => null);
    return this._processedPromise;
  }

  private async _updatePlayerListenState() {
    if (!this._active) {
      return;
    }
    const mode: EditListenMode = this._editExportSettings.listenMode;
    const regionStart = this._editExportSettings.regionStartSec;
    const regionEnd = this._editExportSettings.regionEndSec;
    let processedBuffer: AudioBuffer | null = null;

    if (mode === "processed") {
      processedBuffer = await this.getProcessedBuffer();
    }

    this._playerService.setEditListenState({
      active: true,
      mode,
      regionStart,
      regionEnd,
      processedBuffer,
    });
  }

  public scheduleProcessedRefresh() {
    if (!this._active) {
      return;
    }
    if (this._editExportSettings.listenMode !== "processed") {
      return;
    }
    if (this._renderDebounceTimer !== null) {
      clearTimeout(this._renderDebounceTimer);
    }
    this._renderDebounceTimer = setTimeout(() => {
      this._renderDebounceTimer = null;
      void this._refreshProcessedListenState();
    }, 150);
  }

  private async _refreshProcessedListenState() {
    if (!this._active) {
      return;
    }
    if (this._editExportSettings.listenMode !== "processed") {
      return;
    }
    this._pauseIfPlaying();
    this.invalidateCache();
    await this._updatePlayerListenState();
  }

  public async onListenModeChanged() {
    if (!this._active) {
      return;
    }
    this._pauseIfPlaying();
    if (this._editExportSettings.listenMode === "processed") {
      await this.getProcessedBuffer();
    }
    await this._updatePlayerListenState();
  }
}
