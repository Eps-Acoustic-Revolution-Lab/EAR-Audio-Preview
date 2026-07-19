import { Disposable } from "../dispose";

export class EventType {
  // vscode
  public static readonly VSCODE_MESSAGE = "message";
  // player
  public static readonly UPDATE_SEEKBAR = "update-seekbar";
  public static readonly UPDATE_IS_PLAYING = "update-is-playing";
  // playerSettings
  public static readonly PS_UPDATE_ENABLE_HPF = "update-enable-hpf";
  public static readonly PS_UPDATE_HPF_FREQUENCY = "update-hpf-frequency";
  public static readonly PS_UPDATE_ENABLE_LPF = "update-enable-lpf";
  public static readonly PS_UPDATE_LPF_FREQUENCY = "update-lpf-frequency";
  public static readonly PS_UPDATE_MATCH_FILTER_FREQUENCY_TO_SPECTROGRAM =
    "update-match-filter-frequency-to-spectrogram";
  // analyzer
  public static readonly ANALYZE = "analyze";
  // analyzeSettings
  public static readonly AS_UPDATE_WAVEFORM_VISIBLE =
    "as-update-waveform-visible";
  public static readonly AS_UPDATE_WAVEFORM_VERTICAL_SCALE =
    "as-update-waveform-vertical-scale";
  public static readonly AS_UPDATE_SPECTROGRAM_VISIBLE =
    "as-update-spectrogram-visible";
  public static readonly AS_UPDATE_WINDOW_SIZE_INDEX =
    "as-update-window-size-index";
  public static readonly AS_UPDATE_FFT_WINDOW_AUTO =
    "as-update-fft-window-auto";
  public static readonly AS_UPDATE_FREQUENCY_SCALE =
    "as-update-frequency-scale";
  public static readonly AS_UPDATE_FREQUENCY_SCALE_HYBRID_RATIO =
    "as-update-frequency-scale-hybrid-ratio";
  public static readonly AS_UPDATE_MEL_FILTER_NUM = "as-update-mel-filter-num";
  public static readonly AS_UPDATE_MIN_FREQUENCY = "as-update-min-frequency";
  public static readonly AS_UPDATE_MAX_FREQUENCY = "as-update-max-frequency";
  public static readonly AS_UPDATE_MIN_TIME = "as-update-min-time";
  public static readonly AS_UPDATE_MAX_TIME = "as-update-max-time";
  public static readonly AS_UPDATE_MIN_AMPLITUDE = "as-update-min-amplitude";
  public static readonly AS_UPDATE_MAX_AMPLITUDE = "as-update-max-amplitude";
  public static readonly AS_UPDATE_SPECTROGRAM_AMPLITUDE_RANGE =
    "as-update-spectrogram-amplitude-range";
  public static readonly AS_UPDATE_SPECTROGRAM_AMPLITUDE_LOW =
    "as-update-spectrogram-amplitude-low";
  public static readonly AS_UPDATE_SPECTROGRAM_AMPLITUDE_HIGH =
    "as-update-spectrogram-amplitude-high";
  public static readonly AS_UPDATE_WINDOW_TYPE = "as-update-window-type";
  public static readonly AS_UPDATE_FFT_BACKEND = "as-update-fft-backend";
  public static readonly AS_UPDATE_HIGH_RESOLUTION_SPECTROGRAM =
    "as-update-high-resolution-spectrogram";
  public static readonly AS_UPDATE_SHOW_LEVEL_METER =
    "as-update-show-level-meter";
  public static readonly AS_UPDATE_HEARING_PROTECTION_ENABLED =
    "as-update-hearing-protection-enabled";
  public static readonly AS_UPDATE_HEARING_PROTECTION_PEAK_DBFS =
    "as-update-hearing-protection-peak-dbfs";
  public static readonly UPDATE_HEARING_PROTECTION =
    "update-hearing-protection";
  public static readonly AS_UPDATE_SHOW_LIVE_ANALYSIS =
    "as-update-show-live-analysis";
  public static readonly AS_UPDATE_LIVE_ANALYSIS_FFT_SIZE =
    "as-update-live-analysis-fft-size";
  public static readonly AS_UPDATE_LIVE_VISUAL_SMOOTHING =
    "as-update-live-visual-smoothing";
  public static readonly AS_UPDATE_LIVE_SPECTRUM_SMOOTHING =
    "as-update-live-spectrum-smoothing";
  public static readonly AS_UPDATE_LIVE_POLAR_FIELD_SMOOTHING =
    "as-update-live-polar-field-smoothing";
  public static readonly AS_UPDATE_LIVE_LEVEL_METER_SMOOTHING =
    "as-update-live-level-meter-smoothing";
  public static readonly AS_UPDATE_LIVE_POLAR_LEVEL_GATE =
    "as-update-live-polar-level-gate";
  public static readonly AS_UPDATE_LIVE_POLAR_SAMPLE_RADIUS_GAMMA =
    "as-update-live-polar-sample-radius-gamma";
  public static readonly AS_UPDATE_LIVE_POLAR_SAMPLE_FILL_BRIGHTNESS =
    "as-update-live-polar-sample-fill-brightness";
  public static readonly AS_UPDATE_LIVE_SOUND_FIELD_MODE =
    "as-update-live-sound-field-mode";
  public static readonly AS_UPDATE_LIVE_SPECTRUM_TILT =
    "as-update-live-spectrum-tilt";
  public static readonly AS_UPDATE_LIVE_SPECTRUM_PEAK_HOLD =
    "as-update-live-spectrum-peak-hold";
  /** `detail: { value: "fft" | "cqt" }` — live spectrum analysis mode. */
  public static readonly AS_UPDATE_LIVE_SPECTRUM_MODE =
    "as-update-live-spectrum-mode";
  /** `detail: { value: 40 | 20 | 10 }` — CQT low-frequency resolution (Hz). */
  public static readonly AS_UPDATE_LIVE_CQT_LF_RES =
    "as-update-live-cqt-lf-res";
  public static readonly AS_UPDATE_LIVE_MONITORING_MODE =
    "as-update-live-monitoring-mode";
  /** `detail: { value: readonly number[] }` — ascending Hz edges `[e0…e5]`, bands are `[eᵢ,eᵢ₊₁]`. */
  public static readonly AS_UPDATE_MONITOR_BAND_EDGES =
    "as-update-monitor-band-edges";
  /** `detail: { value: number }` — 5-bit mask of active bands; 0 or 0b11111 = full-range bypass. */
  public static readonly AS_UPDATE_MONITOR_BAND_SOLO_MASK =
    "as-update-monitor-band-solo-mask";
  /** `detail: { pane: WorkspacePaneId }` — active workspace column for FAB / options. */
  public static readonly WORKSPACE_ACTIVE_PANE = "workspace-active-pane";
  public static readonly UPDATE_PLAYBACK_POSITION = "update-playback-position";
  // editExport
  public static readonly EE_UPDATE_REGION_START = "ee-update-region-start";
  public static readonly EE_UPDATE_REGION_END = "ee-update-region-end";
  public static readonly EE_UPDATE_CHANNEL_MODE = "ee-update-channel-mode";
  public static readonly EE_UPDATE_ENABLE_HPF = "ee-update-enable-hpf";
  public static readonly EE_UPDATE_HPF_HZ = "ee-update-hpf-hz";
  public static readonly EE_UPDATE_ENABLE_LPF = "ee-update-enable-lpf";
  public static readonly EE_UPDATE_LPF_HZ = "ee-update-lpf-hz";
  public static readonly EE_UPDATE_SYNC_FILTERS = "ee-update-sync-filters";
  public static readonly EE_UPDATE_DESTINATION = "ee-update-destination";
  public static readonly EE_UPDATE_LISTEN_MODE = "ee-update-listen-mode";
  public static readonly EL_UPDATE_ACTIVE = "el-update-active";
  // headphone EQ
  public static readonly HE_UPDATE_BYPASSED = "he-update-bypassed";
  public static readonly HE_UPDATE_PROFILE = "he-update-profile";
  public static readonly HE_OPEN_OVERLAY = "he-open-overlay";
  // other
  public static readonly CLICK = "click";
  public static readonly CHANGE = "change";
  public static readonly INPUT = "input";
  public static readonly FOCUS = "focus";
  public static readonly BLUR = "blur";
  public static readonly KEY_DOWN = "keydown";
  public static readonly KEY_UP = "keyup";
  public static readonly MOUSE_DOWN = "mousedown";
  public static readonly MOUSE_MOVE = "mousemove";
  public static readonly MOUSE_UP = "mouseup";
  public static readonly MOUSE_LEAVE = "mouseleave";
  public static readonly CONTEXT_MENU = "contextmenu";
  /** Hover readout for waveform / spectrogram (dispatched on `window`). */
  public static readonly CURSOR_READOUT = "ear-audio-preview-cursor-readout";
}

/** Payload for {@link EventType.CURSOR_READOUT} (CustomEvent on `window`). */
export type CursorReadoutPayload =
  | { kind: "clear" }
  | {
      kind: "waveform";
      channelIndex: number;
      rms: number;
      peak: number;
      /** Nominal RMS window length in seconds (= STFT window / sample rate). */
      rmsWindowDurationSec: number;
      /** ITU-R BS.1770 true peak (dBTP) for the hover window. */
      truePeakDbTp?: number;
    }
  | {
      kind: "spectrogram";
      channelIndex: number;
      rms: number;
      peak: number;
      frequencyHz: number;
      /** Nominal RMS window length in seconds (= STFT window / sample rate). */
      rmsWindowDurationSec: number;
      /** ITU-R BS.1770 true peak (dBTP) for the hover window. */
      truePeakDbTp?: number;
    };

export class DisposableEventListener extends Disposable {
  private _target: EventTarget;
  private _type: string;
  private _handler: EventListenerOrEventListenerObject;

  constructor(
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
  ) {
    super();
    this._target = target;
    this._type = type;
    this._handler = handler;
    this._target.addEventListener(this._type, this._handler);
  }

  dispose() {
    this._target.removeEventListener(this._type, this._handler);
  }
}
