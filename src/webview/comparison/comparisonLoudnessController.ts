import type { SequenceWorkerResources } from "../services/sequenceWorkerClient";
import type { WebviewAnalyzeSequenceFeaturesMessage } from "../../message";
import type { PageRpcClient } from "../services/pageRpcClient";
import type { ComparisonTrack } from "./comparisonSession";
import { ComparisonSession } from "./comparisonSession";
import type { ComparisonRequest } from "../../comparison/protocol";
import type { LoudnessProfile } from "../services/loudnessService";
import SequenceFeatureService, {
  type SequenceFeatureProfile,
} from "../services/sequenceFeatureService";
import { analyzeNativeLoudness } from "./loudnessAnalysis";
interface Profile {
  revision: number;
  complete?: boolean;
  loudness?: LoudnessProfile;
  sequence?: SequenceFeatureProfile;
  error?: string;
}

/** Loudness pane owns its jobs, cancellation and revision-scoped results. */
export class ComparisonLoudnessController {
  public sequenceResources: SequenceWorkerResources = {};
  public readonly profiles = new Map<string, Profile>();
  private readonly _profiles = this.profiles;
  private _profileBusy = false;
  private _profileAbort: AbortController | null = null;
  private _profileSequence: SequenceFeatureService | null = null;
  private _activeTrack: ComparisonTrack | null = null;
  constructor(
    private readonly session: ComparisonSession,
    private readonly _post: (message: ComparisonRequest) => void,
    private readonly status: (message: string) => void,
    private readonly disposed: () => boolean,
    private readonly sourceRevision: (id: string) => number | undefined,
    private readonly workerReady: () => Promise<string>,
    private readonly draw: () => void,
    private readonly rpc: PageRpcClient,
  ) {}
  public postSequence(message: WebviewAnalyzeSequenceFeaturesMessage): void {
    const track = this._activeTrack;
    if (!track) {
      throw new Error("No active sequence analysis track");
    }
    this._post({
      type: "compare.sequence",
      trackId: track.id,
      // Host cancellation uses source file revision, not aligned session revision.
      revision: this.sourceRevision(track.id) ?? track.revision,
      ...message.data,
    });
  }
  public async loadProfiles(): Promise<void> {
    if (this._profileBusy) {
      return;
    }
    this._profileBusy = true;
    try {
      for (const track of this.session.activeTracks) {
        if (this.disposed() || this.session.pane !== "loudness") {
          break;
        }
        if (
          !this.session.tracks.some(
            (t) =>
              t.id === track.id && t.revision === track.revision && t.active,
          )
        ) {
          continue;
        }
        if (
          this._profiles.get(track.id)?.revision === track.revision &&
          this._profiles.get(track.id)?.complete
        ) {
          continue;
        }
        const state: Profile = { revision: track.revision };
        this._profiles.set(track.id, state);
        const abort = new AbortController();
        this._profileAbort = abort;
        this.status(`Analyzing loudness and pitch · ${track.name}`);
        try {
          this._activeTrack = track;
          const sequence = new SequenceFeatureService(
            track.buffer,
            this.rpc,
            undefined,
            this.sequenceResources,
          );
          this._profileSequence = sequence;
          const url = await this.workerReady();
          state.loudness = await analyzeNativeLoudness(
            track.buffer,
            url,
            abort.signal,
          );
          if (
            abort.signal.aborted ||
            this.disposed() ||
            !this.session.tracks.some(
              (t) =>
                t.id === track.id && t.revision === state.revision && t.active,
            )
          ) {
            sequence.dispose();
            continue;
          }
          state.sequence = await sequence.analyzeProfile();
          sequence.dispose();
          state.complete = !abort.signal.aborted;
        } catch (error) {
          if (!abort.signal.aborted) {
            state.error = String(error);
            state.complete = true;
            this.status(`${track.name}: ${state.error}`);
          }
        } finally {
          this._profileSequence?.dispose();
          this._profileSequence = null;
          this._activeTrack = null;
          if (!state.complete && this._profiles.get(track.id) === state) {
            this._profiles.delete(track.id);
          }
        }
        if (!this.disposed() && this.session.pane === "loudness") {
          this.draw();
        }
      }
    } finally {
      this._profileBusy = false;
      this._profileAbort = null;
      if (
        !this.disposed() &&
        this.session.pane === "loudness" &&
        this.session.activeTracks.some((t) => {
          const p = this._profiles.get(t.id);
          return !p?.complete || p.revision !== t.revision;
        })
      ) {
        void this.loadProfiles();
      }
    }
  }
  public cancelProfiles(): void {
    this._profileAbort?.abort();
    this._profileSequence?.dispose();
  }
}
