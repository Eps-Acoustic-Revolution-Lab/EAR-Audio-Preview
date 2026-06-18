/* eslint-disable @typescript-eslint/naming-convention */
import {
  AUTOEQ_DEFAULT_FR_F_STEP,
  AUTOEQ_DEFAULT_PEQ_CONFIG,
  buildAutoEqEqualizePayload,
} from "./autoEqEqualizePayload";

describe("buildAutoEqEqualizePayload", () => {
  test("includes response.fr_f_step required by autoeq.app API", () => {
    const payload = buildAutoEqEqualizePayload({
      name: "Sennheiser HD 650",
      source: "oratory1990",
      rig: "GRAS 45BC-10",
      target: "crinacle EARS + 711 Harman over-ear 2018",
      fs: 48000,
    });

    expect(payload.parametric_eq).toBe(true);
    expect(payload.parametric_eq_config).toBe(AUTOEQ_DEFAULT_PEQ_CONFIG);
    expect(payload.fs).toBe(48000);
    expect(payload.response).toEqual({
      fr_f_step: AUTOEQ_DEFAULT_FR_F_STEP,
    });
  });
});
