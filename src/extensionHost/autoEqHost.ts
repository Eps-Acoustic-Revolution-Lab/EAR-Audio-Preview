/* eslint-disable @typescript-eslint/naming-convention */

import { buildAutoEqEqualizePayload } from "../shared/autoEqEqualizePayload";

const BASE_URL = "https://autoeq.app";

export interface AutoEqEqualizeHostBody {
  name: string;
  source: string;
  rig: string;
  target: string;
  fs: number;
}

async function readJsonResponse(res: Response, label: string): Promise<unknown> {
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `AutoEq ${label} failed: ${res.status}${detail ? ` — ${detail}` : ""}`,
    );
  }
  return res.json() as Promise<unknown>;
}

export async function fetchAutoEqEntriesInHost(): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/entries`);
  return readJsonResponse(res, "entries");
}

export async function fetchAutoEqTargetsInHost(): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/targets`);
  return readJsonResponse(res, "targets");
}

export async function equalizeAutoEqInHost(
  body: AutoEqEqualizeHostBody,
): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/equalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildAutoEqEqualizePayload(body)),
  });
  return readJsonResponse(res, "equalize");
}
