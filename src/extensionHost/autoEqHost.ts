/* eslint-disable @typescript-eslint/naming-convention */

import { request as httpsRequest } from "https";
import { buildAutoEqEqualizePayload } from "../shared/autoEqEqualizePayload";

const BASE_URL = "https://autoeq.app";
const REQUEST_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 3;
const MAX_ERROR_BODY_CHARS = 300;
/** Hard cap on response body size: guards the extension host against a
    misbehaving endpoint (or hostile proxy) streaming unbounded data. */
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

export interface AutoEqEqualizeHostBody {
  name: string;
  source: string;
  rig: string;
  target: string;
  fs: number;
}

interface AutoEqRequestOptions {
  method?: string;
  body?: string;
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
  options: AutoEqRequestOptions = {},
): Promise<unknown> {
  if (typeof httpsRequest === "function") {
    return requestAutoEqJsonViaHttps(url, label, options);
  }
  return requestAutoEqJsonViaFetch(url, label, options);
}

function parseJsonBody(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (parseError) {
    throw new Error(
      `AutoEq ${label} returned invalid JSON: ${String(parseError)}`,
    );
  }
}

/** Stream a fetch response body with a byte cap so a runaway response cannot
    grow without bound in the extension host. */
async function readFetchBodyCapped(
  res: Response,
  label: string,
): Promise<string> {
  if (!res.body) {
    const text = await res.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error(
        `AutoEq ${label} response exceeded ${MAX_RESPONSE_BYTES} bytes`,
      );
    }
    return text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      received += value.byteLength;
      if (received > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error(
          `AutoEq ${label} response exceeded ${MAX_RESPONSE_BYTES} bytes`,
        );
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

async function requestAutoEqJsonViaFetch(
  url: string,
  label: string,
  options: AutoEqRequestOptions,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(
        `AutoEq ${label} request failed: timed out after ${REQUEST_TIMEOUT_MS}ms`,
      );
    }
    const cause = (err as { cause?: { code?: string; message?: string } })
      .cause;
    throw new Error(
      `AutoEq ${label} request failed: ${String(err)}${
        cause ? ` (cause: ${cause.code ?? ""} ${cause.message ?? ""})` : ""
      }`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `AutoEq ${label} failed: ${res.status}${
        detail ? ` — ${detail.slice(0, MAX_ERROR_BODY_CHARS)}` : ""
      }`,
    );
  }
  const text = await readFetchBodyCapped(res, label);
  return parseJsonBody(text, label);
}

function requestAutoEqJsonViaHttps(
  url: string,
  label: string,
  options: AutoEqRequestOptions = {},
  redirectsLeft: number = MAX_REDIRECTS,
  deadline: number = Date.now() + REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      reject(
        new Error(
          `AutoEq ${label} request failed: timed out after ${REQUEST_TIMEOUT_MS}ms`,
        ),
      );
      return;
    }
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
          /* Only 307/308 preserve method and body across a redirect; for
             301/302/303 a POST is downgraded to GET (fetch convention) so we
             never re-send the payload where it would be unexpected. */
          const nextOptions: AutoEqRequestOptions =
            options.body !== undefined && status !== 307 && status !== 308
              ? { method: "GET", body: undefined }
              : options;
          resolve(
            requestAutoEqJsonViaHttps(
              nextUrl,
              label,
              nextOptions,
              redirectsLeft - 1,
              deadline,
            ),
          );
          return;
        }
        const chunks: Uint8Array[] = [];
        let received = 0;
        let aborted = false;
        res.on("data", (chunk: Uint8Array) => {
          if (aborted) {
            return;
          }
          received += chunk.byteLength;
          if (received > MAX_RESPONSE_BYTES) {
            aborted = true;
            req.destroy(
              new Error(
                `AutoEq ${label} response exceeded ${MAX_RESPONSE_BYTES} bytes`,
              ),
            );
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (aborted) {
            return;
          }
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
            resolve(parseJsonBody(text, label));
          } catch (parseError) {
            reject(parseError);
          }
        });
        res.on("error", reject);
      },
    );
    /* Idle timer bounded by the remaining total deadline: a slow-drip server
       can no longer hold the request open indefinitely by staying just under
       the idle threshold. */
    req.setTimeout(Math.min(remaining, REQUEST_TIMEOUT_MS), () => {
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
