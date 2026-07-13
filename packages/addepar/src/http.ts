import { baseUrl, type AddeparConfig } from "./config";
import { AddeparApiError, AddeparLicenseError } from "./errors";

const JSON_API = "application/vnd.api+json";
const MAX_RETRIES = 4;

export type RequestOptions = {
  method: "GET" | "POST" | "DELETE";
  path: string; // e.g. "/v1/portfolio/query"
  body?: unknown;
  /** Test hook. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Test hook. Defaults to real sleep. */
  sleep?: (ms: number) => Promise<void>;
};

function authHeaders(config: AddeparConfig): Record<string, string> {
  const token = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64");
  return {
    Authorization: `Basic ${token}`,
    "Addepar-Firm": config.firmId,
    Accept: JSON_API,
  };
}

/**
 * Single request path for the whole package: Basic auth + Addepar-Firm header,
 * JSON:API content type, retry with exponential backoff on 429/5xx, and 403
 * surfaced as AddeparLicenseError so callers can degrade.
 */
export async function addeparRequest<T = unknown>(
  config: AddeparConfig,
  opts: RequestOptions,
): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const url = opts.path.startsWith("http") ? opts.path : `${baseUrl(config)}${opts.path}`;

  let lastError: AddeparApiError | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));

    const res = await fetchImpl(url, {
      method: opts.method,
      headers: {
        ...authHeaders(config),
        ...(opts.body !== undefined ? { "Content-Type": JSON_API } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if (res.ok) {
      const text = await res.text();
      return (text ? JSON.parse(text) : null) as T;
    }

    const body = await res.text().catch(() => "");
    if (res.status === 403) {
      throw new AddeparLicenseError(`Addepar 403 (licensing/permissions) on ${opts.path}`, body);
    }
    if (res.status === 429 || res.status >= 500) {
      lastError = new AddeparApiError(`Addepar ${res.status} on ${opts.path}`, res.status, body);
      continue; // retry
    }
    throw new AddeparApiError(`Addepar ${res.status} on ${opts.path}: ${body}`, res.status, body);
  }
  throw lastError ?? new AddeparApiError(`Addepar request failed: ${opts.path}`, 0);
}
