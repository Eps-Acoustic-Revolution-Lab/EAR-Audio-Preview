import "./curveCorrectionOverlayComponent.css";
import Component from "../../component";
import { EventType } from "../../events";
import type { PostMessage } from "../../../message";
import { WebviewMessageType } from "../../../message";
import { parseEqPresetFile } from "../../../shared/parseEqPreset";
import {
  compatibleTargets,
  equalizeParametric,
  fetchEntries,
  fetchTargets,
} from "../../services/autoEqApiClient";
import type EqPresetHostClient from "../../services/eqPresetHostClient";
import type HeadphoneEqSettingsService from "../../services/headphoneEqSettingsService";
import type {
  AutoEqEntries,
  AutoEqEntryVariant,
  AutoEqTarget,
  HeadphoneEqProfile,
} from "../../types/headphoneEq";
import ParametricEqEditorComponent from "./parametricEqEditorComponent";
import { isTypingTarget } from "../../utils/keyboardTarget";

type CatalogItem =
  | { kind: "autoeq"; name: string }
  | { kind: "workspace"; fileName: string; displayName: string };

interface WorkspacePresetIndex {
  fileName: string;
  displayName: string;
}

export default class CurveCorrectionOverlayComponent extends Component {
  private _overlay: HTMLElement;
  private _isOpen = false;
  private _modKey: string;
  private _settings: HeadphoneEqSettingsService;
  private _sampleRate: number;
  private _postMessage: PostMessage;
  private _eqPresetHost: EqPresetHostClient;
  private _editor: ParametricEqEditorComponent | null = null;

  private _entries: AutoEqEntries = {};
  private _targets: AutoEqTarget[] = [];
  private _workspacePresets: WorkspacePresetIndex[] = [];
  private _hasWorkspace = false;
  private _filteredItems: CatalogItem[] = [];
  private _catalogListOpen = false;
  private _selectedKind: "autoeq" | "workspace" | null = null;
  private _selectedName = "";
  private _selectedWorkspaceFile = "";
  private _selectedVariant: AutoEqEntryVariant | null = null;
  private _selectedTarget = "";
  private _loading = false;

  constructor(
    mountSelector: string,
    settings: HeadphoneEqSettingsService,
    sampleRate: number,
    postMessage: PostMessage,
    eqPresetHost: EqPresetHostClient,
  ) {
    super();
    this._settings = settings;
    this._sampleRate = sampleRate;
    this._postMessage = postMessage;
    this._eqPresetHost = eqPresetHost;
    this._modKey = navigator.platform.toLowerCase().includes("mac")
      ? "meta"
      : "ctrl";

    const root = document.querySelector(mountSelector);
    if (!root) {
      throw new Error(`Mount not found: ${mountSelector}`);
    }

    root.innerHTML = `
      <div class="curveCorrectionOverlay curveCorrectionOverlay--animating" hidden role="dialog" aria-modal="true" aria-label="Curve correction">
        <div class="curveCorrectionOverlay__backdrop js-cc-backdrop"></div>
        <div class="curveCorrectionOverlay__dialog">
          <header class="curveCorrectionOverlay__header">
            <h2 class="curveCorrectionOverlay__title">Curve correction</h2>
            <button type="button" class="curveCorrectionOverlay__close js-cc-close" aria-label="Close">×</button>
          </header>
          <div class="curveCorrectionOverlay__body">
            <div class="panelGroup">
              <h3 class="panelGroup__title">Headphone</h3>
              <div class="curveCorrectionOverlay__combobox">
                <input type="search" class="curveCorrectionOverlay__search js-cc-search" placeholder="Search model…" autocomplete="off" spellcheck="false" />
                <ul class="curveCorrectionOverlay__list js-cc-list curveCorrectionOverlay__list--collapsed" role="listbox"></ul>
              </div>
              <div class="curveCorrectionOverlay__importRow">
                <button type="button" class="curveCorrectionOverlay__import js-cc-import">Import preset…</button>
              </div>
              <div class="js-cc-autoeq-options">
                <div class="panelRow panelRow--stacked">
                  <span class="panelRow__label">Measurement</span>
                  <select class="js-cc-variant panelRow__control"></select>
                </div>
                <div class="panelRow panelRow--stacked">
                  <span class="panelRow__label">Target curve</span>
                  <select class="js-cc-target panelRow__control"></select>
                </div>
                <button type="button" class="panelAction js-cc-apply">Apply preset</button>
              </div>
              <p class="curveCorrectionOverlay__status js-cc-status"></p>
            </div>
            <div class="panelGroup">
              <h3 class="panelGroup__title">EQ curve</h3>
              <canvas class="curveCorrectionOverlay__canvas js-cc-canvas" width="640" height="200" aria-label="Parametric EQ editor"></canvas>
              <p class="panelRow__hint">Drag handles to adjust gain and frequency. Changes apply when you release the handle.</p>
              <div class="curveCorrectionOverlay__actions">
                <button type="button" class="panelAction js-cc-reset">Reset preset</button>
                <button type="button" class="panelAction js-cc-save-ws" disabled>Save to workspace</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    this._overlay = root.querySelector(
      ".curveCorrectionOverlay",
    ) as HTMLElement;

    this._editor = new ParametricEqEditorComponent(
      ".js-cc-canvas",
      sampleRate,
      (filters) => {
        this._settings.updateFilters(filters);
        this._syncEditorFromProfile();
      },
    );
    this._disposables.push(this._editor);

    this._wireUi();
    this._wireKeyboard();
    this._addEventlistener(settings, EventType.HE_OPEN_OVERLAY, () =>
      this.open(),
    );
    this._addEventlistener(settings, EventType.HE_UPDATE_PROFILE, () =>
      this._syncEditorFromProfile(),
    );

    void this._ensureCatalog();
  }

  public open(): void {
    if (this._isOpen) {
      return;
    }
    this._isOpen = true;
    this._overlay.removeAttribute("hidden");
    requestAnimationFrame(() => {
      this._overlay.classList.add("curveCorrectionOverlay--open");
      this._editor?.resize();
    });
    void this._ensureCatalog();
    void this._refreshWorkspacePresets();
    this._syncEditorFromProfile();
    this._syncSelectionFromProfile();
  }

  public close(): void {
    if (!this._isOpen) {
      return;
    }
    this._isOpen = false;
    this._catalogListOpen = false;
    this._overlay.classList.remove("curveCorrectionOverlay--open");
    setTimeout(() => {
      if (!this._isOpen) {
        this._overlay.setAttribute("hidden", "");
      }
    }, 150);
  }

  public toggle(): void {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  private _wireKeyboard(): void {
    this._addEventlistener(document, EventType.KEY_DOWN, (e: KeyboardEvent) => {
      if (e.isComposing || isTypingTarget(e.target)) {
        return;
      }
      if (e.key === "Escape" && this._isOpen) {
        e.preventDefault();
        this.close();
        return;
      }
      // Bare "E" toggles the overlay. The former Cmd/Ctrl+Shift+E chord is
      // swallowed by the IDE workbench (Show Explorer) before the webview
      // ever sees it; it is kept below only for environments that pass it.
      if (
        e.key.toLowerCase() === "e" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        this.toggle();
        return;
      }
      const mod = this._modKey === "meta" ? e.metaKey : e.ctrlKey;
      if (e.key.toLowerCase() === "e" && e.shiftKey && mod) {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  private _wireUi(): void {
    const backdrop = this._overlay.querySelector(".js-cc-backdrop");
    const closeBtn = this._overlay.querySelector(".js-cc-close");
    const search = this._overlay.querySelector(
      ".js-cc-search",
    ) as HTMLInputElement;
    const list = this._overlay.querySelector(".js-cc-list") as HTMLUListElement;
    const variantSel = this._overlay.querySelector(
      ".js-cc-variant",
    ) as HTMLSelectElement;
    const targetSel = this._overlay.querySelector(
      ".js-cc-target",
    ) as HTMLSelectElement;
    const applyBtn = this._overlay.querySelector(".js-cc-apply");
    const importBtn = this._overlay.querySelector(".js-cc-import");
    const resetBtn = this._overlay.querySelector(".js-cc-reset");
    const saveWs = this._overlay.querySelector(
      ".js-cc-save-ws",
    ) as HTMLButtonElement;

    this._addEventlistener(backdrop, EventType.CLICK, () => this.close());
    this._addEventlistener(closeBtn, EventType.CLICK, () => this.close());

    this._addEventlistener(search, EventType.FOCUS, () => {
      this._openCatalogList(list, search);
    });

    this._addEventlistener(search, EventType.INPUT, () => {
      this._openCatalogList(list, search);
    });

    this._addEventlistener(search, EventType.BLUR, () => {
      window.setTimeout(() => {
        if (list.contains(document.activeElement)) {
          return;
        }
        this._collapseList(search, list);
      }, 150);
    });

    this._addEventlistener(list, EventType.MOUSE_DOWN, (e: MouseEvent) => {
      e.preventDefault();
    });

    this._addEventlistener(list, EventType.CLICK, (e: MouseEvent) => {
      const li = (e.target as HTMLElement).closest(
        "[data-kind]",
      ) as HTMLElement | null;
      if (!li) {
        return;
      }
      const kind = li.dataset.kind;
      if (kind === "autoeq" && li.dataset.name) {
        void this._selectAutoEqName(li.dataset.name, search, list);
      } else if (
        kind === "workspace" &&
        li.dataset.fileName &&
        li.dataset.displayName
      ) {
        void this._selectWorkspacePreset(
          li.dataset.fileName,
          li.dataset.displayName,
          search,
          list,
        );
      }
    });

    this._addEventlistener(variantSel, EventType.CHANGE, () => {
      const idx = variantSel.selectedIndex;
      const variants = this._entries[this._selectedName];
      this._selectedVariant = variants?.[idx] ?? null;
      this._populateTargets(targetSel);
    });

    this._addEventlistener(targetSel, EventType.CHANGE, () => {
      this._selectedTarget = targetSel.value;
    });

    this._addEventlistener(applyBtn, EventType.CLICK, () => {
      void this._applyPreset();
    });
    this._addEventlistener(importBtn, EventType.CLICK, () => {
      void this._importPreset(search, list);
    });
    this._addEventlistener(resetBtn, EventType.CLICK, () => {
      this._settings.resetToBaseSnapshot();
      this._syncEditorFromProfile();
    });
    this._addEventlistener(saveWs, EventType.CLICK, () => {
      void this._saveToWorkspace();
    });
  }

  private _openCatalogList(
    list: HTMLUListElement,
    search: HTMLInputElement,
  ): void {
    this._catalogListOpen = true;
    this._updateListCollapsed(list);
    this._filterItems(search.value);
    this._renderList(list);
  }

  private _updateListCollapsed(list: HTMLUListElement): void {
    list.classList.toggle(
      "curveCorrectionOverlay__list--collapsed",
      !this._catalogListOpen,
    );
  }

  private _updateAutoEqPanelVisibility(): void {
    const panel = this._overlay.querySelector(
      ".js-cc-autoeq-options",
    ) as HTMLElement;
    panel.hidden = this._selectedKind !== "autoeq";
  }

  private _updateWorkspaceSaveButton(): void {
    const btn = this._overlay.querySelector(
      ".js-cc-save-ws",
    ) as HTMLButtonElement;
    btn.disabled = !this._hasWorkspace || !this._settings.profile;
  }

  private _setStatus(msg: string, isError = false): void {
    const el = this._overlay.querySelector(".js-cc-status") as HTMLElement;
    el.textContent = msg;
    el.classList.toggle("curveCorrectionOverlay__status--error", isError);
  }

  private async _ensureCatalog(): Promise<void> {
    if (Object.keys(this._entries).length && this._targets.length) {
      return;
    }
    try {
      const [entries, targets] = await Promise.all([
        fetchEntries(),
        fetchTargets(),
      ]);
      this._entries = entries;
      this._targets = targets;
      const search = this._overlay.querySelector(
        ".js-cc-search",
      ) as HTMLInputElement;
      const list = this._overlay.querySelector(
        ".js-cc-list",
      ) as HTMLUListElement;
      this._filterItems(search.value);
      this._renderList(list);
    } catch (err) {
      this._setStatus(
        err instanceof Error ? err.message : "Failed to load AutoEq catalog",
        true,
      );
    }
  }

  private async _refreshWorkspacePresets(): Promise<void> {
    try {
      const result = await this._eqPresetHost.listWorkspacePresets();
      this._workspacePresets = result.presets;
      this._hasWorkspace = result.hasWorkspace;
      this._updateWorkspaceSaveButton();
      const search = this._overlay.querySelector(
        ".js-cc-search",
      ) as HTMLInputElement;
      const list = this._overlay.querySelector(
        ".js-cc-list",
      ) as HTMLUListElement;
      this._filterItems(search.value);
      this._renderList(list);
    } catch (err) {
      this._setStatus(
        err instanceof Error ? err.message : "Failed to scan workspace presets",
        true,
      );
    }
  }

  private _filterItems(query: string): void {
    const q = query.trim().toLowerCase();
    const items: CatalogItem[] = [];

    if (this._catalogListOpen) {
      for (const wp of this._workspacePresets) {
        if (!q || wp.displayName.toLowerCase().includes(q)) {
          items.push({
            kind: "workspace",
            fileName: wp.fileName,
            displayName: wp.displayName,
          });
        }
      }
    }

    const names = Object.keys(this._entries).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    let autoeqNames = q
      ? names.filter((n) => n.toLowerCase().includes(q)).slice(0, 80)
      : names.slice(0, 40);

    if (
      this._selectedKind === "autoeq" &&
      this._selectedName &&
      !autoeqNames.includes(this._selectedName) &&
      (!q || this._selectedName.toLowerCase().includes(q))
    ) {
      autoeqNames = [
        this._selectedName,
        ...autoeqNames.filter((n) => n !== this._selectedName),
      ];
    }

    for (const name of autoeqNames) {
      items.push({ kind: "autoeq", name });
    }

    items.sort((a, b) => {
      const la = a.kind === "workspace" ? a.displayName : a.name;
      const lb = b.kind === "workspace" ? b.displayName : b.name;
      return la.localeCompare(lb, undefined, { sensitivity: "base" });
    });

    this._filteredItems = items.slice(0, 100);
  }

  private _renderList(list: HTMLUListElement): void {
    list.innerHTML = "";
    for (const item of this._filteredItems) {
      const li = document.createElement("li");
      li.className = "curveCorrectionOverlay__listItem";
      li.setAttribute("role", "option");
      li.dataset.kind = item.kind;

      if (item.kind === "workspace") {
        li.dataset.fileName = item.fileName;
        li.dataset.displayName = item.displayName;
        const label = document.createElement("span");
        label.textContent = item.displayName;
        const badge = document.createElement("span");
        badge.className = "curveCorrectionOverlay__badge";
        badge.textContent = "Custom";
        li.appendChild(label);
        li.appendChild(badge);
        if (
          this._selectedKind === "workspace" &&
          item.fileName === this._selectedWorkspaceFile
        ) {
          li.classList.add("curveCorrectionOverlay__listItem--active");
        }
      } else {
        li.dataset.name = item.name;
        li.textContent = item.name;
        if (
          this._selectedKind === "autoeq" &&
          item.name === this._selectedName
        ) {
          li.classList.add("curveCorrectionOverlay__listItem--active");
        }
      }

      list.appendChild(li);
    }
  }

  private _collapseList(
    search: HTMLInputElement,
    list: HTMLUListElement,
  ): void {
    this._catalogListOpen = false;
    this._updateListCollapsed(list);
    this._filterItems(search.value);
    this._renderList(list);
  }

  private async _selectAutoEqName(
    name: string,
    search: HTMLInputElement,
    list: HTMLUListElement,
  ): Promise<void> {
    this._selectedKind = "autoeq";
    this._selectedName = name;
    this._selectedWorkspaceFile = "";
    search.value = name;
    this._collapseList(search, list);
    this._updateAutoEqPanelVisibility();
    this._populateVariants();
  }

  private async _selectWorkspacePreset(
    fileName: string,
    displayName: string,
    search: HTMLInputElement,
    list: HTMLUListElement,
  ): Promise<void> {
    this._loading = true;
    this._setStatus(`Loading ${displayName}…`);
    try {
      const profile = (await this._eqPresetHost.readWorkspacePreset(
        fileName,
      )) as HeadphoneEqProfile;
      this._settings.setProfile(profile, { keepBypass: true });
      this._postMessage({
        type: WebviewMessageType.WRITE_EQ_PROFILE,
        data: this._settings.toPersisted(),
      });
      this._selectedKind = "workspace";
      this._selectedWorkspaceFile = fileName;
      this._selectedName = displayName;
      search.value = displayName;
      this._collapseList(search, list);
      this._updateAutoEqPanelVisibility();
      this._syncEditorFromProfile();
      this._setStatus(`Loaded ${displayName}`);
    } catch (err) {
      this._setStatus(
        err instanceof Error ? err.message : "Failed to load preset",
        true,
      );
    } finally {
      this._loading = false;
    }
  }

  private async _importPreset(
    search: HTMLInputElement,
    list: HTMLUListElement,
  ): Promise<void> {
    try {
      const file = await this._eqPresetHost.importFile();
      if (!file) {
        return;
      }
      const profile = parseEqPresetFile(file.content, file.fileName);
      this._settings.setProfile(profile, { keepBypass: true });
      this._selectedKind = null;
      this._selectedName = profile.displayName;
      this._selectedWorkspaceFile = "";
      search.value = profile.displayName;
      this._collapseList(search, list);
      this._updateAutoEqPanelVisibility();
      this._syncEditorFromProfile();
      this._setStatus(`Imported ${profile.displayName}`);
    } catch (err) {
      this._setStatus(
        err instanceof Error ? err.message : "Import failed",
        true,
      );
    }
  }

  private async _saveToWorkspace(): Promise<void> {
    if (!this._settings.profile) {
      this._setStatus("No EQ profile to save", true);
      return;
    }
    if (!this._hasWorkspace) {
      this._setStatus("Open a workspace folder to save", true);
      return;
    }
    this._postMessage({
      type: WebviewMessageType.WRITE_EQ_PROFILE,
      data: this._settings.toPersisted(),
    });
    this._setStatus("Saved to workspace (.vscode/ear-headphone-eq.json)");
  }

  private _populateVariants(): void {
    const variantSel = this._overlay.querySelector(
      ".js-cc-variant",
    ) as HTMLSelectElement;
    const targetSel = this._overlay.querySelector(
      ".js-cc-target",
    ) as HTMLSelectElement;
    variantSel.innerHTML = "";
    const variants = this._entries[this._selectedName] ?? [];
    for (const v of variants) {
      const opt = document.createElement("option");
      opt.value = `${v.source}|${v.rig}|${v.form}`;
      opt.textContent = `${v.source} · ${v.rig} · ${v.form}`;
      variantSel.appendChild(opt);
    }
    this._selectedVariant = variants[0] ?? null;
    this._populateTargets(targetSel);
  }

  private _populateTargets(targetSel: HTMLSelectElement): void {
    targetSel.innerHTML = "";
    if (!this._selectedVariant) {
      return;
    }
    const compat = compatibleTargets(this._targets, this._selectedVariant);
    const list = compat.length ? compat : this._targets;
    for (const t of list) {
      const opt = document.createElement("option");
      opt.value = t.label;
      opt.textContent = t.label;
      targetSel.appendChild(opt);
    }
    this._selectedTarget = list[0]?.label ?? "";
    if (list[0]) {
      targetSel.value = list[0].label;
    }
  }

  private async _applyPreset(): Promise<void> {
    if (this._loading || !this._selectedName || !this._selectedVariant) {
      this._setStatus("Select a headphone model first", true);
      return;
    }
    if (!this._selectedTarget) {
      this._setStatus("Select a target curve", true);
      return;
    }
    this._loading = true;
    this._setStatus("Fetching EQ from autoeq.app…");
    try {
      const profile = await equalizeParametric({
        name: this._selectedName,
        variant: this._selectedVariant,
        targetLabel: this._selectedTarget,
        fs: this._sampleRate,
      });
      this._settings.setProfile(profile);
      this._syncEditorFromProfile();
      this._setStatus(`Applied ${profile.displayName}`);
    } catch (err) {
      this._setStatus(
        err instanceof Error ? err.message : "Equalize failed",
        true,
      );
    } finally {
      this._loading = false;
    }
  }

  private _syncEditorFromProfile(): void {
    const p = this._settings.profile;
    if (p && this._editor) {
      this._editor.setFilters(p.filters);
    }
    this._updateWorkspaceSaveButton();
  }

  private _syncSelectionFromProfile(): void {
    const p = this._settings.profile;
    if (!p) {
      return;
    }
    const search = this._overlay.querySelector(
      ".js-cc-search",
    ) as HTMLInputElement;
    const list = this._overlay.querySelector(".js-cc-list") as HTMLUListElement;

    if (p.meta.origin === "imported") {
      this._selectedKind = null;
      this._selectedName = p.displayName;
      this._selectedWorkspaceFile = "";
      search.value = p.displayName;
      this._updateAutoEqPanelVisibility();
      this._filterItems(search.value);
      this._renderList(list);
      return;
    }

    if (p.meta.source === "imported" || p.meta.form === "custom") {
      this._selectedKind = null;
      this._selectedName = p.displayName;
      search.value = p.displayName;
      this._updateAutoEqPanelVisibility();
      this._filterItems(search.value);
      this._renderList(list);
      return;
    }

    this._selectedKind = "autoeq";
    this._selectedName = p.meta.name;
    this._selectedVariant = {
      source: p.meta.source,
      rig: p.meta.rig,
      form: p.meta.form,
    };
    this._selectedTarget = p.meta.targetLabel;
    search.value = p.meta.name;
    this._filterItems(p.meta.name);
    this._renderList(list);
    this._updateAutoEqPanelVisibility();
    this._populateVariants();
    const targetSel = this._overlay.querySelector(
      ".js-cc-target",
    ) as HTMLSelectElement;
    if (this._selectedTarget) {
      targetSel.value = this._selectedTarget;
    }
  }
}
