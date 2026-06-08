import { EventType } from "../events";
import Service from "../service";
import PlayerSettingsService from "./playerSettingsService";
import AnalyzeSettingsService from "./analyzeSettingsService";
import {
  monitorBandMaskAll,
  monitoringGainsForMode,
  sanitizeMonitorBandEdges,
  populationCountBits,
} from "../utils/liveMonitoring";
import {
  LoudnessWorkletNode,
  type LoudnessMeasurements,
} from "loudness-worklet";
import { loadLoudnessWorkletModule } from "../utils/loudnessWorkletLoader";
import type { EditListenMode } from "./editExportSettingsService";

export default class PlayerService extends Service {
  private _audioContext: AudioContext;
  private _audioBuffer: AudioBuffer;
  private _playerSettingsService: PlayerSettingsService;
  private _analyzeSettingsService: AnalyzeSettingsService;

  private _isPlaying: boolean = false;
  private _lastStartAcTime: number = 0;
  private _currentSec: number = 0;
  /** Fixed playback start / cue time (white line). Not advanced by pause or tick. */
  private _playbackPosition: number = 0;
  private _source: AudioBufferSourceNode;

  public get playbackPosition() {
    return this._playbackPosition;
  }

  /**
   * Sets the fixed playback cue (absolute seconds). Play always starts from here;
   * pausing does not move this value.
   */
  public setPlaybackPosition(sec: number) {
    this._playbackPosition = Math.max(
      0,
      Math.min(sec, this._audioBuffer.duration),
    );
    this.dispatchEvent(
      new CustomEvent(EventType.UPDATE_PLAYBACK_POSITION, {
        detail: {
          sec: this._playbackPosition,
          percent: (100 * this._playbackPosition) / this._audioBuffer.duration,
        },
      }),
    );
  }

  public get isPlaying() {
    return this._isPlaying;
  }

  public getAudioDuration(): number {
    return this._audioBuffer.duration;
  }
  public get currentSec() {
    return this._currentSec;
  }

  private _gainNode: GainNode;
  private _userVolume = 1;
  private _hearingProtectionActive = false;

  /** User-requested output gain (0–1.2); unaffected by hearing protection. */
  public get volume() {
    return this._userVolume;
  }
  public set volume(value: number) {
    this._userVolume = Math.max(0, Math.min(1.2, value));
    this._applyOutputGain();
  }

  public get hearingProtectionActive(): boolean {
    return this._hearingProtectionActive;
  }

  public setHearingProtectionActive(active: boolean): void {
    if (this._hearingProtectionActive === active) {
      return;
    }
    this._hearingProtectionActive = active;
    this._applyOutputGain();
    this.dispatchEvent(
      new CustomEvent(EventType.UPDATE_HEARING_PROTECTION, {
        detail: { active: this._hearingProtectionActive },
      }),
    );
  }

  private _applyOutputGain(): void {
    if (!this._gainNode) {
      return;
    }
    this._gainNode.gain.value = this._hearingProtectionActive
      ? 0
      : this._userVolume;
  }

  private _hpfNode: BiquadFilterNode;
  private _lpfNode: BiquadFilterNode;

  // Live analyser graph nodes (created/destroyed on demand)
  private _liveGraphActive: boolean = false;
  private _splitter: ChannelSplitterNode | null = null;
  private _merger: ChannelMergerNode | null = null;
  private _analyserL: AnalyserNode | null = null;
  private _analyserR: AnalyserNode | null = null;
  private _gLL: GainNode | null = null;
  private _gLR: GainNode | null = null;
  private _gRL: GainNode | null = null;
  private _gRR: GainNode | null = null;
  private _loudnessWorklet: AudioWorkletNode | null = null;
  private _loudnessWorkletPromise: Promise<AudioWorkletNode | null> | null =
    null;
  private _latestLoudness: LoudnessMeasurements | null = null;
  private _sessionMaxTruePeakDbTp = Number.NEGATIVE_INFINITY;

  private _seekbarValue: number = 0;
  private _animationFrameID: number = 0;

  private _editListenActive = false;
  private _editListenMode: EditListenMode = "dry";
  private _editRegionStart = 0;
  private _editRegionEnd = 0;
  private _editProcessedBuffer: AudioBuffer | null = null;
  /** Playback offset (seconds) passed to AudioBufferSourceNode.start for the current session. */
  private _editPlayStartOffset = 0;
  /** Bumps on each gain-routing reconnect to ignore stale async worklet callbacks. */
  private _gainConnectGeneration = 0;

  constructor(
    audioContext: AudioContext,
    audioBuffer: AudioBuffer,
    playerSettingsService: PlayerSettingsService,
    analyzeSettingsService: AnalyzeSettingsService,
  ) {
    super();
    this._audioContext = audioContext;
    this._audioBuffer = audioBuffer;
    this._playerSettingsService = playerSettingsService;
    this._analyzeSettingsService = analyzeSettingsService;

    // init volume — do NOT connect to destination here; routing is decided in play()
    this._gainNode = this._audioContext.createGain();

    // init high-pass filter
    this._hpfNode = this._audioContext.createBiquadFilter();
    this._hpfNode.type = "highpass";
    this._hpfNode.Q.value = Math.SQRT1_2; // butterworth

    // init low-pass filter
    this._lpfNode = this._audioContext.createBiquadFilter();
    this._lpfNode.type = "lowpass";
    this._lpfNode.Q.value = Math.SQRT1_2; // butterworth

    // play again if filter related setting is changed
    const applyFilters = () => {
      if (!this._isPlaying) {
        return;
      }
      if (this._editListenActive && this._editListenMode === "processed") {
        return;
      }
      this.pause();
      this.play();
    };
    this._playerSettingsService.addEventListener(
      EventType.PS_UPDATE_ENABLE_HPF,
      applyFilters,
    );
    this._playerSettingsService.addEventListener(
      EventType.PS_UPDATE_HPF_FREQUENCY,
      applyFilters,
    );
    this._playerSettingsService.addEventListener(
      EventType.PS_UPDATE_ENABLE_LPF,
      applyFilters,
    );
    this._playerSettingsService.addEventListener(
      EventType.PS_UPDATE_LPF_FREQUENCY,
      applyFilters,
    );

    // rebuild live graph when toggles change
    const onLiveToggle = () => {
      this._updateLiveGraph();
      if (this._isPlaying) {
        this.pause();
        this.play();
      }
    };
    this._analyzeSettingsService.addEventListener(
      EventType.AS_UPDATE_SHOW_LEVEL_METER,
      onLiveToggle,
    );
    this._analyzeSettingsService.addEventListener(
      EventType.AS_UPDATE_SHOW_LIVE_ANALYSIS,
      onLiveToggle,
    );
    this._analyzeSettingsService.addEventListener(
      EventType.AS_UPDATE_HEARING_PROTECTION_ENABLED,
      () => {
        if (!this._analyzeSettingsService.hearingProtectionEnabled) {
          this.setHearingProtectionActive(false);
        }
        onLiveToggle();
      },
    );

    // fftSize change — only update fftSize if analysers exist; no glitch since
    // analysers are not in the signal path (they tap, not block)
    this._analyzeSettingsService.addEventListener(
      EventType.AS_UPDATE_LIVE_ANALYSIS_FFT_SIZE,
      () => {
        const fftSize = this._analyzeSettingsService.liveAnalysisFftSize;
        if (this._analyserL) {
          this._analyserL.fftSize = fftSize;
        }
        if (this._analyserR) {
          this._analyserR.fftSize = fftSize;
        }
      },
    );

    this._analyzeSettingsService.addEventListener(
      EventType.AS_UPDATE_LIVE_MONITORING_MODE,
      () => this._applyMonitoringGains(),
    );

    const rebuildLiveGraphBands = () => this._onMonitorBandsChanged();
    this._analyzeSettingsService.addEventListener(
      EventType.AS_UPDATE_MONITOR_BAND_EDGES,
      rebuildLiveGraphBands,
    );
    this._analyzeSettingsService.addEventListener(
      EventType.AS_UPDATE_MONITOR_BAND_SOLO_MASK,
      rebuildLiveGraphBands,
    );
  }

  /** Returns the live analyser pair, or null when the live graph is not active. */
  public getAnalysers(): { left: AnalyserNode; right: AnalyserNode } | null {
    if (!this._liveGraphActive || !this._analyserL || !this._analyserR) {
      return null;
    }
    return { left: this._analyserL, right: this._analyserR };
  }

  public get audioContext(): AudioContext {
    return this._audioContext;
  }

  public get sampleRate(): number {
    return this._audioBuffer.sampleRate;
  }

  public get editListenActive() {
    return this._editListenActive;
  }

  public setEditListenState(opts: {
    active: boolean;
    mode?: EditListenMode;
    regionStart?: number;
    regionEnd?: number;
    processedBuffer?: AudioBuffer | null;
  }): void {
    this._editListenActive = opts.active;
    if (!opts.active) {
      this._editProcessedBuffer = null;
      return;
    }
    if (opts.mode !== undefined) {
      this._editListenMode = opts.mode;
    }
    if (opts.regionStart !== undefined) {
      this._editRegionStart = opts.regionStart;
    }
    if (opts.regionEnd !== undefined) {
      this._editRegionEnd = opts.regionEnd;
    }
    if (opts.processedBuffer !== undefined) {
      this._editProcessedBuffer = opts.processedBuffer;
    }
  }

  private _clampToEditRegion(sec: number): number {
    if (!this._editListenActive) {
      return sec;
    }
    const lo = this._editRegionStart;
    const hi = this._editRegionEnd;
    if (hi <= lo) {
      return lo;
    }
    return Math.max(lo, Math.min(sec, hi - 1e-6));
  }

  private _playbackSecAtAcTime(acTime: number): number {
    const elapsed = acTime - this._lastStartAcTime;
    if (!this._editListenActive) {
      return this._currentSec + elapsed;
    }
    const regionLen = this._editRegionEnd - this._editRegionStart;
    if (regionLen <= 0) {
      return this._editRegionStart;
    }
    if (this._editListenMode === "processed" && this._editProcessedBuffer) {
      const bufDur = Math.max(this._editProcessedBuffer.duration, 1e-6);
      const offsetInRegion = (this._editPlayStartOffset + elapsed) % bufDur;
      return this._editRegionStart + offsetInRegion;
    }
    const offsetInRegion =
      (this._editPlayStartOffset - this._editRegionStart + elapsed) % regionLen;
    return this._editRegionStart + offsetInRegion;
  }

  /** Latest loudness-worklet measurements (stereo program). */
  public getLoudnessMeasurements(): LoudnessMeasurements | null {
    return this._latestLoudness;
  }

  /** Session maximum true peak (dBTP) from loudness-worklet. */
  public get sessionMaxTruePeakDbTp(): number {
    return this._sessionMaxTruePeakDbTp;
  }

  public resetLoudnessSessionPeaks(): void {
    this._sessionMaxTruePeakDbTp = Number.NEGATIVE_INFINITY;
  }

  // ─── Private graph helpers ─────────────────────────────────────────────────

  private _monitorBandNodes: AudioNode[] = [];

  private _needsLiveGraph(): boolean {
    return (
      this._analyzeSettingsService.showLevelMeter ||
      this._analyzeSettingsService.showLiveAnalysis ||
      this._analyzeSettingsService.hearingProtectionEnabled
    );
  }

  /** Create or destroy the splitter→analyser→merger sub-graph as needed. */
  private _updateLiveGraph(): void {
    const needed = this._needsLiveGraph();
    if (needed === this._liveGraphActive) {
      return;
    }
    if (needed) {
      this._createLiveGraph();
    } else {
      this._destroyLiveGraph();
    }
  }

  private _applyMonitoringGains(): void {
    if (!this._gLL || !this._gLR || !this._gRL || !this._gRR) {
      return;
    }
    const g = monitoringGainsForMode(
      this._analyzeSettingsService.liveMonitoringMode,
    );
    this._gLL.gain.value = g.ll;
    this._gLR.gain.value = g.lr;
    this._gRL.gain.value = g.rl;
    this._gRR.gain.value = g.rr;
  }

  private _createLiveGraph(): void {
    const ctx = this._audioContext;
    const fftSize = this._analyzeSettingsService.liveAnalysisFftSize;
    const numChannels = Math.min(2, this._audioBuffer.numberOfChannels);

    this._splitter = ctx.createChannelSplitter(numChannels);
    this._merger = ctx.createChannelMerger(2);

    this._analyserL = ctx.createAnalyser();
    this._analyserL.fftSize = fftSize;
    this._analyserL.smoothingTimeConstant = 0;

    this._analyserR = ctx.createAnalyser();
    this._analyserR.fftSize = fftSize;
    this._analyserR.smoothingTimeConstant = 0;

    this._gLL = ctx.createGain();
    this._gLR = ctx.createGain();
    this._gRL = ctx.createGain();
    this._gRR = ctx.createGain();

    this._splitter.connect(this._analyserL, 0);
    if (numChannels >= 2) {
      this._splitter.connect(this._analyserR, 1);
    } else {
      this._splitter.connect(this._analyserR, 0);
    }

    this._analyserL.connect(this._gLL);
    this._analyserL.connect(this._gLR);
    this._analyserR.connect(this._gRL);
    this._analyserR.connect(this._gRR);

    this._gLL.connect(this._merger, 0, 0);
    this._gLR.connect(this._merger, 0, 1);
    this._gRL.connect(this._merger, 0, 0);
    this._gRR.connect(this._merger, 0, 1);

    this._merger.connect(ctx.destination);
    this._liveGraphActive = true;
    this._applyMonitoringGains();
  }

  private _onMonitorBandsChanged(): void {
    if (!this._liveGraphActive) {
      return;
    }
    if (this._isPlaying) {
      this._gainConnectGeneration++;
      this._connectGainOutput();
    }
  }

  private _teardownMonitorBandChain(): void {
    for (const n of [...this._monitorBandNodes].reverse()) {
      try {
        (n as AudioNode).disconnect();
      } catch {
        /* ok */
      }
    }
    this._monitorBandNodes = [];
  }

  /**
   * Sum of band-pass limbs per channel between gainNode and downstream live chain.
   * Each band uses two cascaded Butterworth SOS per edge (~4th-order rolloff vs 12 dB/oct
   * single biquads) for moderate adjacent-band bleed reduction without extreme resonances.
   * `gain → split stereo → Σ(HPᵢ²·LPᵢ²) → merger` (per channel).
   */
  private _buildMonitorBandStereoMerger(): ChannelMergerNode | null {
    const ctx = this._audioContext;
    const edges = sanitizeMonitorBandEdges(
      [...this._analyzeSettingsService.monitorBandEdgesHz],
      this.sampleRate,
    );
    const mask =
      this._analyzeSettingsService.monitorBandSoloMask & monitorBandMaskAll;
    const activeBandCount = populationCountBits(mask);

    const splitIn = ctx.createChannelSplitter(2);
    const mergeStereo = ctx.createChannelMerger(2);
    const sumL = ctx.createGain();
    const sumR = ctx.createGain();
    const normalizedGain = activeBandCount > 0 ? 1 / activeBandCount : 1;
    sumL.gain.value = normalizedGain;
    sumR.gain.value = normalizedGain;
    this._monitorBandNodes.push(splitIn, mergeStereo, sumL, sumR);

    let anyBand = false;
    for (let band = 0; band < 5; band++) {
      if (((mask >> band) & 1) === 0) {
        continue;
      }
      const lo = edges[band];
      const hi = edges[band + 1];
      if (!(lo < hi && hi - lo > 0.5)) {
        continue;
      }

      const hpL1 = ctx.createBiquadFilter();
      hpL1.type = "highpass";
      hpL1.Q.value = Math.SQRT1_2;
      hpL1.frequency.value = lo;
      const hpL2 = ctx.createBiquadFilter();
      hpL2.type = "highpass";
      hpL2.Q.value = Math.SQRT1_2;
      hpL2.frequency.value = lo;
      const lpL1 = ctx.createBiquadFilter();
      lpL1.type = "lowpass";
      lpL1.Q.value = Math.SQRT1_2;
      lpL1.frequency.value = hi;
      const lpL2 = ctx.createBiquadFilter();
      lpL2.type = "lowpass";
      lpL2.Q.value = Math.SQRT1_2;
      lpL2.frequency.value = hi;

      const hpR1 = ctx.createBiquadFilter();
      hpR1.type = "highpass";
      hpR1.Q.value = Math.SQRT1_2;
      hpR1.frequency.value = lo;
      const hpR2 = ctx.createBiquadFilter();
      hpR2.type = "highpass";
      hpR2.Q.value = Math.SQRT1_2;
      hpR2.frequency.value = lo;
      const lpR1 = ctx.createBiquadFilter();
      lpR1.type = "lowpass";
      lpR1.Q.value = Math.SQRT1_2;
      lpR1.frequency.value = hi;
      const lpR2 = ctx.createBiquadFilter();
      lpR2.type = "lowpass";
      lpR2.Q.value = Math.SQRT1_2;
      lpR2.frequency.value = hi;

      splitIn.connect(hpL1, 0, 0);
      hpL1.connect(hpL2);
      hpL2.connect(lpL1);
      lpL1.connect(lpL2);
      lpL2.connect(sumL);

      splitIn.connect(hpR1, 1, 0);
      hpR1.connect(hpR2);
      hpR2.connect(lpR1);
      lpR1.connect(lpR2);
      lpR2.connect(sumR);

      this._monitorBandNodes.push(
        hpL1,
        hpL2,
        lpL1,
        lpL2,
        hpR1,
        hpR2,
        lpR1,
        lpR2,
      );
      anyBand = true;
    }

    if (!anyBand) {
      this._teardownMonitorBandChain();
      return null;
    }

    sumL.connect(mergeStereo, 0, 0);
    sumR.connect(mergeStereo, 0, 1);
    this._gainNode.connect(splitIn);
    return mergeStereo;
  }

  private _destroyLiveGraph(): void {
    this._teardownMonitorBandChain();
    try {
      this._loudnessWorklet?.disconnect();
    } catch {
      /* ok */
    }
    try {
      this._merger?.disconnect();
    } catch (_) {
      /* already disconnected */
    }
    try {
      this._gLL?.disconnect();
    } catch (_) {
      /* already disconnected */
    }
    try {
      this._gLR?.disconnect();
    } catch (_) {
      /* already disconnected */
    }
    try {
      this._gRL?.disconnect();
    } catch (_) {
      /* already disconnected */
    }
    try {
      this._gRR?.disconnect();
    } catch (_) {
      /* already disconnected */
    }
    try {
      this._analyserL?.disconnect();
    } catch (_) {
      /* already disconnected */
    }
    try {
      this._analyserR?.disconnect();
    } catch (_) {
      /* already disconnected */
    }
    try {
      this._splitter?.disconnect();
    } catch (_) {
      /* already disconnected */
    }

    this._splitter = null;
    this._merger = null;
    this._analyserL = null;
    this._analyserR = null;
    this._gLL = null;
    this._gLR = null;
    this._gRL = null;
    this._gRR = null;
    this._loudnessWorklet = null;
    this._loudnessWorkletPromise = null;
    this._latestLoudness = null;
    this._liveGraphActive = false;
  }

  private async _ensureLoudnessWorklet(): Promise<AudioWorkletNode | null> {
    if (!this._liveGraphActive) {
      return null;
    }
    if (this._loudnessWorklet) {
      return this._loudnessWorklet;
    }
    if (this._loudnessWorkletPromise) {
      return this._loudnessWorkletPromise;
    }
    this._loudnessWorkletPromise = (async () => {
      try {
        await loadLoudnessWorkletModule(this._audioContext);
        const node = new LoudnessWorkletNode(this._audioContext, {
          processorOptions: { interval: 0.05, capacity: 0 },
        });
        node.port.onmessage = (
          e: MessageEvent<{ currentMeasurements: LoudnessMeasurements[] }>,
        ) => {
          const m = e.data.currentMeasurements?.[0];
          if (!m) {
            return;
          }
          this._latestLoudness = m;
          if (
            Number.isFinite(m.maximumTruePeakLevel) &&
            m.maximumTruePeakLevel > this._sessionMaxTruePeakDbTp
          ) {
            this._sessionMaxTruePeakDbTp = m.maximumTruePeakLevel;
          }
        };
        if (!this._liveGraphActive) {
          node.disconnect();
          return null;
        }
        this._loudnessWorklet = node;
        return node;
      } catch {
        return null;
      } finally {
        this._loudnessWorkletPromise = null;
      }
    })();
    return this._loudnessWorkletPromise;
  }

  private _connectGainToLiveGraph(): void {
    if (!this._splitter) {
      return;
    }
    const generation = ++this._gainConnectGeneration;
    this._teardownMonitorBandChain();
    try {
      this._gainNode.disconnect();
    } catch {
      /* ok */
    }

    const bypassBands = this._analyzeSettingsService.monitorBandBypassActive();
    let upstream: AudioNode = this._gainNode;
    if (!bypassBands) {
      const merged = this._buildMonitorBandStereoMerger();
      if (merged) {
        upstream = merged;
      }
    }

    if (this._loudnessWorklet) {
      upstream.connect(this._loudnessWorklet);
      this._loudnessWorklet.connect(this._splitter);
    } else {
      upstream.connect(this._splitter);
      void this._ensureLoudnessWorklet().then((node) => {
        if (
          generation !== this._gainConnectGeneration ||
          !node ||
          !this._liveGraphActive ||
          !this._isPlaying
        ) {
          return;
        }
        try {
          this._gainNode.disconnect();
        } catch {
          /* ok */
        }
        this._connectGainToLiveGraph();
      });
    }
  }

  /**
   * Connect _gainNode to the correct output endpoint.
   * Must be called each time play() rebuilds the source chain.
   */
  private _connectGainOutput(): void {
    this._gainConnectGeneration++;
    // gainNode always disconnects before reconnecting to avoid double-connections
    try {
      this._gainNode.disconnect();
    } catch (_) {
      /* ok */
    }

    this._updateLiveGraph();

    if (this._liveGraphActive && this._splitter) {
      this._connectGainToLiveGraph();
    } else {
      this._gainNode.connect(this._audioContext.destination);
    }
  }

  // ─── Public playback API ───────────────────────────────────────────────────

  public play() {
    const useProcessed =
      this._editListenActive &&
      this._editListenMode === "processed" &&
      this._editProcessedBuffer !== null;
    const useDryLoop = this._editListenActive && this._editListenMode === "dry";

    if (
      this._editListenActive &&
      this._editListenMode === "processed" &&
      !this._editProcessedBuffer
    ) {
      return;
    }

    // connect nodes: source → [hpf →] [lpf →] gain → [splitter → analysers → merger →] destination
    let lastNode: AudioNode = this._gainNode;

    this._lpfNode.disconnect();
    if (!useProcessed && this._playerSettingsService.enableLpf) {
      this._lpfNode.frequency.value = this._playerSettingsService.lpfFrequency;
      this._lpfNode.connect(lastNode);
      lastNode = this._lpfNode;
    }

    this._hpfNode.disconnect();
    if (!useProcessed && this._playerSettingsService.enableHpf) {
      this._hpfNode.frequency.value = this._playerSettingsService.hpfFrequency;
      this._hpfNode.connect(lastNode);
      lastNode = this._hpfNode;
    }

    this._connectGainOutput();

    // create audioBufferSourceNode every time,
    // because audioBufferSourceNode.start() can't be called more than once.
    // https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode
    this._source = this._audioContext.createBufferSource();

    let startOffset = this._playbackPosition;
    if (useProcessed && this._editProcessedBuffer) {
      this._source.buffer = this._editProcessedBuffer;
      this._source.loop = true;
      this._source.loopStart = 0;
      this._source.loopEnd = this._editProcessedBuffer.duration;
      const regionLen = this._editRegionEnd - this._editRegionStart;
      let inRegion = this._playbackPosition - this._editRegionStart;
      if (inRegion < 0 || inRegion >= regionLen) {
        inRegion = 0;
      }
      startOffset = inRegion;
      this._editPlayStartOffset = inRegion;
      this._currentSec = this._editRegionStart + inRegion;
    } else if (useDryLoop) {
      this._source.buffer = this._audioBuffer;
      this._source.loop = true;
      this._source.loopStart = this._editRegionStart;
      this._source.loopEnd = this._editRegionEnd;
      startOffset = this._clampToEditRegion(this._playbackPosition);
      this._editPlayStartOffset = startOffset;
      this._currentSec = startOffset;
    } else {
      this._source.buffer = this._audioBuffer;
      this._source.loop = false;
      this._currentSec = this._playbackPosition;
    }

    this._source.connect(lastNode);

    // Always start from the fixed cue (white line), not from where we last paused.
    this._isPlaying = true;
    this._lastStartAcTime = this._audioContext.currentTime;
    this._source.start(this._audioContext.currentTime, startOffset);

    // update playing status
    this.dispatchEvent(
      new CustomEvent(EventType.UPDATE_IS_PLAYING, {
        detail: {
          value: this._isPlaying,
        },
      }),
    );

    // move seek bar
    this._animationFrameID = requestAnimationFrame(() => this.tick());
  }

  public pause() {
    cancelAnimationFrame(this._animationFrameID);

    this._source.stop();
    const acTime =
      typeof this._audioContext.getOutputTimestamp === "function"
        ? this._audioContext.getOutputTimestamp()?.contextTime ??
          this._audioContext.currentTime
        : this._audioContext.currentTime;
    const stopped = Math.max(
      0,
      Math.min(this._playbackSecAtAcTime(acTime), this._audioBuffer.duration),
    );
    // Keep _playbackPosition (fixed cue / white line); only update playhead display.
    this._currentSec = stopped;
    this._seekbarValue =
      this._audioBuffer.duration > 0
        ? (100 * stopped) / this._audioBuffer.duration
        : 0;
    this._isPlaying = false;
    this._source = undefined;

    this.dispatchEvent(
      new CustomEvent(EventType.UPDATE_SEEKBAR, {
        detail: {
          value: this._seekbarValue,
          pos: stopped,
        },
      }),
    );

    this.dispatchEvent(
      new CustomEvent(EventType.UPDATE_IS_PLAYING, {
        detail: {
          value: this._isPlaying,
        },
      }),
    );
  }

  public tick() {
    // Prefer getOutputTimestamp for sub-buffer-size latency compensation
    const ts =
      typeof this._audioContext.getOutputTimestamp === "function"
        ? this._audioContext.getOutputTimestamp()
        : null;
    const acTime =
      ts && ts.contextTime > 0
        ? ts.contextTime
        : this._audioContext.currentTime;

    const current = this._playbackSecAtAcTime(acTime);
    this._seekbarValue = (100 * current) / this._audioBuffer.duration;

    // update seek bar value
    this.dispatchEvent(
      new CustomEvent(EventType.UPDATE_SEEKBAR, {
        detail: {
          value: this._seekbarValue,
          pos: current,
        },
      }),
    );

    if (!this._editListenActive && current > this._audioBuffer.duration) {
      cancelAnimationFrame(this._animationFrameID);
      this._source.stop();
      const dur = this._audioBuffer.duration;
      this._currentSec = dur;
      this._seekbarValue = dur > 0 ? 100 : 0;
      this._isPlaying = false;
      this._source = undefined;

      this.dispatchEvent(
        new CustomEvent(EventType.UPDATE_SEEKBAR, {
          detail: {
            value: this._seekbarValue,
            pos: dur,
          },
        }),
      );
      this.dispatchEvent(
        new CustomEvent(EventType.UPDATE_IS_PLAYING, {
          detail: {
            value: this._isPlaying,
          },
        }),
      );
      return;
    }

    if (this._isPlaying) {
      this._animationFrameID = requestAnimationFrame(() => this.tick());
    }
  }

  /**
   * Live update UI while dragging the position slider (does not restart playback).
   * seek value is 0~100.
   */
  public previewSeekFromPercent(value: number) {
    const sec = this._clampToEditRegion(
      (value * this._audioBuffer.duration) / 100,
    );
    this.setPlaybackPosition(sec);
    this._currentSec = this._playbackPosition;
    this._seekbarValue = value;
    this.dispatchEvent(
      new CustomEvent(EventType.UPDATE_SEEKBAR, {
        detail: {
          value: this._seekbarValue,
          pos: this._currentSec,
        },
      }),
    );
  }

  // seekbar value is 0~100
  public onSeekbarInput(value: number) {
    const resumeRequired = this._isPlaying;

    if (this._isPlaying) {
      this.pause();
    }

    const sec = this._clampToEditRegion(
      (value * this._audioBuffer.duration) / 100,
    );
    this.setPlaybackPosition(sec);
    this._currentSec = this._playbackPosition;
    this._seekbarValue = value;
    this.dispatchEvent(
      new CustomEvent(EventType.UPDATE_SEEKBAR, {
        detail: {
          value: this._seekbarValue,
          pos: this._currentSec,
        },
      }),
    );

    // restart from selected place
    if (resumeRequired || this._playerSettingsService.enableSeekToPlay) {
      this.play();
    }
  }
}
