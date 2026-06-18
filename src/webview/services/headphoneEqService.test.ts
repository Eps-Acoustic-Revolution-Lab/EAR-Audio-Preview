import { createAudioContext } from "../../__mocks__/helper";
import HeadphoneEqSettingsService from "./headphoneEqSettingsService";
import { createEqChain } from "./headphoneEqService";
import type { HeadphoneEqProfile } from "../types/headphoneEq";

function mockProfile(): HeadphoneEqProfile {
  return {
    id: "test",
    displayName: "Test · Harman",
    meta: {
      name: "Test",
      source: "oratory1990",
      rig: "crinacle",
      form: "raw",
      targetLabel: "Harman",
    },
    preampDb: -2,
    filters: [
      {
        enabled: true,
        type: "peaking",
        frequency: 2000,
        gainDb: 3,
        q: 1.1,
      },
      {
        enabled: false,
        type: "highshelf",
        frequency: 8000,
        gainDb: -1,
        q: 0.7,
      },
    ],
    isCustomized: false,
  };
}

describe("headphoneEqService", () => {
  test("returns null chain when bypassed or no profile", () => {
    const ctx = createAudioContext(44100);
    const settings = new HeadphoneEqSettingsService();
    settings.setProfile(mockProfile(), { keepBypass: true });
    settings.bypassed = true;

    const bypassed = createEqChain(ctx, settings);
    expect(bypassed.chain).toBeNull();
    expect(bypassed.nodes).toHaveLength(0);

    settings.setProfile(null);
    settings.bypassed = false;
    const empty = createEqChain(ctx, settings);
    expect(empty.chain).toBeNull();
    expect(empty.nodes).toHaveLength(0);
  });

  test("builds preamp and enabled biquad filters when EQ is active", () => {
    const ctx = createAudioContext(44100);
    const settings = new HeadphoneEqSettingsService();
    settings.setProfile(mockProfile());

    const { chain, nodes } = createEqChain(ctx, settings);
    expect(chain).not.toBeNull();
    expect(nodes).toHaveLength(3);
    expect(chain?.input).toHaveProperty("gain");
    expect(chain?.output).toHaveProperty("gain");
  });
});
