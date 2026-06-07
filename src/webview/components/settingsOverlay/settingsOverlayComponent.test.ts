import { MockAudioBuffer } from "../../../__mocks__/helper";
import { AnalyzeDefault, PlayerDefault } from "../../../config";
import AnalyzeService from "../../services/analyzeService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import PlayerSettingsService from "../../services/playerSettingsService";
import SettingTab from "../settingTab/settingTabComponent";
import { setActiveWorkspacePane } from "../../workspacePane";
import SettingsOverlayComponent from "./settingsOverlayComponent";

const overlayFixtureHtml = `
  <button
    type="button"
    class="workspaceChrome__settingsBtn js-openSettings"
    aria-expanded="false"
    aria-controls="settingsOverlay"
    title="Settings (⌘/)"
  ></button>
  <div id="settingsOverlayMount"></div>
`;

function dispatchCmdSlash(): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "/",
      metaKey: true,
      bubbles: true,
    }),
  );
}

describe("settingsOverlayComponent", () => {
  let playerSettingService: PlayerSettingsService;
  let analyzeService: AnalyzeService;
  let analyzeSettingsService: AnalyzeSettingsService;
  let settingsOverlay: SettingsOverlayComponent;
  let settingTabComponent: SettingTab;

  beforeAll(() => {
    document.body.innerHTML = overlayFixtureHtml;
    document.documentElement.dataset.workspacePane = "stft";
    const audioBuffer = new MockAudioBuffer(
      44100,
      1,
      44100,
    ) as unknown as AudioBuffer;
    analyzeService = new AnalyzeService(audioBuffer);
    const analyzeDefault = {} as AnalyzeDefault;
    analyzeSettingsService = AnalyzeSettingsService.fromDefaultSetting(
      analyzeDefault,
      audioBuffer,
    );
    const playerDefault = {} as PlayerDefault;
    playerSettingService = PlayerSettingsService.fromDefaultSetting(
      playerDefault,
      audioBuffer,
    );
    settingsOverlay = new SettingsOverlayComponent("#settingsOverlayMount");
    settingTabComponent = new SettingTab(
      "#settingTab",
      playerSettingService,
      analyzeService,
      analyzeSettingsService,
    );
  });

  afterAll(() => {
    analyzeService.dispose();
    analyzeSettingsService.dispose();
    settingTabComponent.dispose();
    settingsOverlay.dispose();
  });

  beforeEach(() => {
    const gear = document.querySelector(
      ".js-openSettings",
    ) as HTMLButtonElement | null;
    const overlay = document.getElementById("settingsOverlay") as HTMLElement;
    if (gear?.getAttribute("aria-expanded") === "true") {
      gear.click();
    }
    overlay?.setAttribute("hidden", "");
    overlay?.classList.remove("settingsOverlay--open");
    gear?.setAttribute("aria-expanded", "false");
  });

  test("gear button toggles centered overlay visibility", () => {
    const gear = document.querySelector(
      ".js-openSettings",
    ) as HTMLButtonElement;
    const overlay = document.getElementById("settingsOverlay") as HTMLElement;
    expect(overlay.hasAttribute("hidden")).toBe(true);

    gear.click();
    expect(overlay.hasAttribute("hidden")).toBe(false);
    expect(gear.getAttribute("aria-expanded")).toBe("true");

    gear.click();
    expect(overlay.hasAttribute("hidden")).toBe(true);
    expect(gear.getAttribute("aria-expanded")).toBe("false");
  });

  test("Escape closes the overlay when open", () => {
    const gear = document.querySelector(
      ".js-openSettings",
    ) as HTMLButtonElement;
    const overlay = document.getElementById("settingsOverlay") as HTMLElement;
    gear.click();
    expect(overlay.hasAttribute("hidden")).toBe(false);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(overlay.hasAttribute("hidden")).toBe(true);
  });

  test("close button dismisses the overlay", () => {
    const gear = document.querySelector(
      ".js-openSettings",
    ) as HTMLButtonElement;
    const overlay = document.getElementById("settingsOverlay") as HTMLElement;
    gear.click();

    const closeBtn = document.querySelector(
      ".js-settingsClose",
    ) as HTMLButtonElement;
    closeBtn.click();
    expect(overlay.hasAttribute("hidden")).toBe(true);
  });

  test("Cmd+/ toggles the overlay", () => {
    const overlay = document.getElementById("settingsOverlay") as HTMLElement;
    overlay.setAttribute("hidden", "");
    overlay.classList.remove("settingsOverlay--open");

    dispatchCmdSlash();
    expect(overlay.hasAttribute("hidden")).toBe(false);

    dispatchCmdSlash();
    expect(overlay.hasAttribute("hidden")).toBe(true);
  });

  test("Cmd+/ closes the overlay even when focus is in an input", () => {
    const overlay = document.getElementById("settingsOverlay") as HTMLElement;
    if (overlay.hasAttribute("hidden")) {
      dispatchCmdSlash();
    }
    const input = overlay.querySelector("input") as HTMLInputElement;
    expect(input).toBeTruthy();
    input.focus();

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "/",
        metaKey: true,
        bubbles: true,
      }),
    );
    expect(overlay.hasAttribute("hidden")).toBe(true);
  });

  test("overlay title updates when workspace pane changes", () => {
    const title = document.getElementById(
      "settingsOverlayTitle",
    ) as HTMLElement;
    const gear = document.querySelector(
      ".js-openSettings",
    ) as HTMLButtonElement;

    setActiveWorkspacePane("liveSpec");
    gear.click();
    expect(title.textContent).toBe("Live Spectrum Settings");

    gear.click();
    setActiveWorkspacePane("stft");
  });
});
