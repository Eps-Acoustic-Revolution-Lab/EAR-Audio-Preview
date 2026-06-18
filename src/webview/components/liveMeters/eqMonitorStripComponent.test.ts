import { EventType } from "../../events";
import HeadphoneEqSettingsService from "../../services/headphoneEqSettingsService";
import EqMonitorStripComponent from "./eqMonitorStripComponent";
import type { HeadphoneEqProfile } from "../../types/headphoneEq";

function click(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent(EventType.CLICK));
}

function mockProfile(): HeadphoneEqProfile {
  return {
    id: "hd650",
    displayName: "HD 650 · Harman",
    meta: {
      name: "HD 650",
      source: "oratory1990",
      rig: "crinacle",
      form: "raw",
      targetLabel: "Harman",
    },
    preampDb: -4.2,
    filters: [],
    isCustomized: false,
  };
}

describe("eqMonitorStripComponent", () => {
  let settings: HeadphoneEqSettingsService;
  let strip: EqMonitorStripComponent;
  let opened = 0;

  beforeEach(() => {
    document.body.innerHTML = '<div id="eqMonitorStripMount"></div>';
    settings = new HeadphoneEqSettingsService();
    opened = 0;
    strip = new EqMonitorStripComponent(
      "#eqMonitorStripMount",
      settings,
      () => {
        opened += 1;
      },
    );
  });

  afterEach(() => {
    strip.dispose();
    settings.dispose();
  });

  test("shows placeholder until a profile is set", () => {
    const text = document.querySelector(
      ".js-he-profileText",
    ) as HTMLSpanElement;
    expect(text.textContent).toMatch(/no profile/i);
  });

  test("bypass toggles aria-pressed and bypass class", () => {
    settings.setProfile(mockProfile());
    const bypassBtn = document.querySelector(
      ".js-he-bypass",
    ) as HTMLButtonElement;
    expect(settings.bypassed).toBe(false);
    click(bypassBtn);
    expect(settings.bypassed).toBe(true);
    expect(bypassBtn.getAttribute("aria-pressed")).toBe("true");
    expect(bypassBtn.classList.contains("earEqPill--bypass")).toBe(true);
  });

  test("profile button opens overlay callback and shows display name", () => {
    settings.setProfile(mockProfile());
    const text = document.querySelector(
      ".js-he-profileText",
    ) as HTMLSpanElement;
    expect(text.textContent).toBe("HD 650 · Harman");
    click(document.querySelector(".js-he-profile") as HTMLButtonElement);
    expect(opened).toBe(1);
  });
});
