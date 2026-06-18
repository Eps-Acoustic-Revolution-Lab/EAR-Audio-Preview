/* eslint-disable @typescript-eslint/naming-convention */

/** Matches autoeq.constants.DEFAULT_STEP */
export const AUTOEQ_DEFAULT_FR_F_STEP = 1.01;

/** Default PEQ optimizer on autoeq.app (8 peaking + low/high shelf). */
export const AUTOEQ_DEFAULT_PEQ_CONFIG = "8_PEAKING_WITH_SHELVES";

export interface AutoEqEqualizePayloadInput {
  name: string;
  source: string;
  rig: string;
  target: string;
  fs: number;
}

/**
 * Build POST /equalize body. Must include `response` — autoeq.app 500s without it
 * (server reads ResponseRequirements.fr_f_step as a class attr, broken on Pydantic v2).
 */
export function buildAutoEqEqualizePayload(body: AutoEqEqualizePayloadInput) {
  return {
    name: body.name,
    source: body.source,
    rig: body.rig,
    target: body.target,
    parametric_eq: true,
    parametric_eq_config: AUTOEQ_DEFAULT_PEQ_CONFIG,
    fs: body.fs,
    response: {
      fr_f_step: AUTOEQ_DEFAULT_FR_F_STEP,
    },
  };
}
