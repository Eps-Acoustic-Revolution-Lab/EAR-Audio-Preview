import Component from "../../component";
import { EventType } from "../../events";
import type HeadphoneEqSettingsService from "../../services/headphoneEqSettingsService";

export default class EqMonitorStripComponent extends Component {
  constructor(
    rootSelector: string,
    settings: HeadphoneEqSettingsService,
    onOpenOverlay: () => void,
  ) {
    super();
    const root = document.querySelector(rootSelector) as HTMLElement;
    if (!root) {
      return;
    }

    root.innerHTML = `
      <div class="eqMonitorStrip" role="group" aria-label="Headphone curve correction">
        <button type="button" class="earEqPill js-he-bypass" title="Bypass headphone EQ">BYPASS</button>
        <button type="button" class="earEqPill eqMonitorStrip__profile js-he-profile" title="Open curve correction">
          <span class="eqMonitorStrip__profileText js-he-profileText">No profile — click to set</span>
          <span class="eqMonitorStrip__chevron" aria-hidden="true">›</span>
        </button>
        <span class="eqMonitorStrip__meta js-he-meta" aria-live="polite"></span>
      </div>`;

    const bypassBtn = root.querySelector(".js-he-bypass") as HTMLButtonElement;
    const profileBtn = root.querySelector(
      ".js-he-profile",
    ) as HTMLButtonElement;
    const profileText = root.querySelector(
      ".js-he-profileText",
    ) as HTMLSpanElement;
    const metaEl = root.querySelector(".js-he-meta") as HTMLSpanElement;

    const sync = () => {
      const p = settings.profile;
      const bypassed = settings.bypassed;
      bypassBtn.classList.toggle("earEqPill--bypass", bypassed);
      bypassBtn.setAttribute("aria-pressed", bypassed ? "true" : "false");
      if (p) {
        profileText.textContent = p.displayName;
        profileBtn.setAttribute(
          "aria-label",
          `Open curve correction for ${p.displayName}`,
        );
        const bits: string[] = [];
        if (p.isCustomized) {
          bits.push("Custom");
        }
        bits.push(`${p.preampDb.toFixed(1)} dB`);
        metaEl.textContent = bits.join(" · ");
      } else {
        profileText.textContent = "No profile — click to set";
        profileBtn.setAttribute(
          "aria-label",
          "Open curve correction to choose a headphone profile",
        );
        metaEl.textContent = "";
      }
    };

    sync();

    this._addEventlistener(bypassBtn, EventType.CLICK, (e: MouseEvent) => {
      e.stopPropagation();
      settings.bypassed = !settings.bypassed;
    });
    this._addEventlistener(profileBtn, EventType.CLICK, () => {
      onOpenOverlay();
    });
    this._addEventlistener(settings, EventType.HE_UPDATE_BYPASSED, () =>
      sync(),
    );
    this._addEventlistener(settings, EventType.HE_UPDATE_PROFILE, () => sync());
  }
}
