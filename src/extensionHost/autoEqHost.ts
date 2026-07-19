/* eslint-disable @typescript-eslint/naming-convention */

import { request as httpsRequest } from "https";
import { buildAutoEqEqualizePayload } from "../shared/autoEqEqualizePayload";

const BASE_URL = "https://autoeq.app";
const REQUEST_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 3;
const MAX_ERROR_BODY_CHARS = 300;

export interface AutoEqEqualizeHostBody {
  name: string;
  source: string;
  rig: string;
  target: string;
  fs: number;
}

/**
 * AutoEq requests deliberately prefer Node's classic https stack over the
 * global (undici) fetch: some extension hosts inject an experimental proxy
 * into the global fetch dispatcher, which surfaced as a bare "fetch failed"
 * here. The https stack follows the OS resolver and is unaffected by that
 * injection; request errors keep their original errno for diagnosis.
 * In webworker extension hosts (no Node https) we fall back to global fetch.
 */
function requestAutoEqJson(
  url: string,
  label: string,
  options: { method?: string; body?: string } = {},
): Promise<unknown> {
  if (typeof httpsRequest === "function") {
    return requestAutoEqJsonViaHttps(url, label, options);
  }
  return requestAutoEqJsonViaFetch(url, label, options);
}

async function requestAutoEqJsonViaFetch(
  url: string,
  label: string,
  options: { method?: string; body?: string },
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: options.body,
    });
  } catch (err) {
    const cause = (err as { cause?: { code?: string; message?: string } })
      .cause;
    throw new Error(
      `AutoEq ${label} request failed: ${String(err)}${
        cause ? ` (cause: ${cause.code ?? ""} ${cause.message ?? ""})` : ""
      }`,
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `AutoEq ${label} failed: ${res.status}${
        detail ? ` — ${detail.slice(0, MAX_ERROR_BODY_CHARS)}` : ""
      }`,
    );
  }
  return res.json() as Promise<unknown>;
}

function requestAutoEqJsonViaHttps(
  url: string,
  label: string,
  options: { method?: string; body?: string } = {},
  redirectsLeft: number = MAX_REDIRECTS,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(options.body !== undefined
            ? {
                "Content-Type": "application/json",
                "Content-Length": String(Buffer.byteLength(options.body)),
              }
            : {}),
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (
          status >= 300 &&
          status < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          const nextUrl = new URL(res.headers.location, url).toString();
          resolve(
            requestAutoEqJsonViaHttps(
              nextUrl,
              label,
              options,
              redirectsLeft - 1,
            ),
          );
          return;
        }
        const chunks: Uint8Array[] = [];
        res.on("data", (chunk: Uint8Array) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (status < 200 || status >= 300) {
            reject(
              new Error(
                `AutoEq ${label} failed: ${status}${
                  text ? ` — ${text.slice(0, MAX_ERROR_BODY_CHARS)}` : ""
                }`,
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(text) as unknown);
          } catch (parseError) {
            reject(
              new Error(
                `AutoEq ${label} returned invalid JSON: ${String(parseError)}`,
              ),
            );
          }
        });
        res.on("error", reject);
      },
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });
    req.on("error", (err: NodeJS.ErrnoException) => {
      reject(
        new Error(
          `AutoEq ${label} request failed: ${
            err.code ? `${err.code} — ` : ""
          }${err.message}`,
        ),
      );
    });
    if (options.body !== undefined) {
      req.write(options.body);
    }
    req.end();
  });
}

export async function fetchAutoEqEntriesInHost(): Promise<unknown> {
  return requestAutoEqJson(`${BASE_URL}/entries`, "entries");
}

export async function fetchAutoEqTargetsInHost(): Promise<unknown> {
  return requestAutoEqJson(`${BASE_URL}/targets`, "targets");
}

export async function equalizeAutoEqInHost(
  body: AutoEqEqualizeHostBody,
): Promise<unknown> {
  return requestAutoEqJson(`${BASE_URL}/equalize`, "equalize", {
    method: "POST",
    body: JSON.stringify(buildAutoEqEqualizePayload(body)),
  });
}
