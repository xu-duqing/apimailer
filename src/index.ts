const DEFAULT_BASE_URL = "https://apimailer.cc";
const DEFAULT_TIMEOUT = 10_000;

/** The request accepted by APIMailer's `/send` endpoint. */
export interface SendEmailRequest {
  /** Recipient email address. */
  to: string;
  /** Email subject line. */
  subject: string;
  /** Email body. HTML is supported by the API. */
  body: string;
}

/**
 * The standard APIMailer response. Extra properties are retained so the SDK
 * remains forwards-compatible with additions made by the API.
 */
export interface SendEmailResponse {
  success?: boolean;
  message?: string;
  id?: string;
  [key: string]: unknown;
}

export interface APIMailerFetchInit {
  method: "POST";
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}

export interface APIMailerFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers?: {
    get(name: string): string | null;
  };
  text(): Promise<string>;
}

/** A fetch-compatible function, exposed primarily for custom runtimes/tests. */
export type APIMailerFetch = (
  url: string,
  init: APIMailerFetchInit,
) => Promise<APIMailerFetchResponse>;

export interface APIMailerOptions {
  /** API key from APIMailer. Keep this value server-side. */
  apiKey: string;
  /** Override the API origin, mainly for proxies and testing. */
  baseUrl?: string;
  /** Request timeout in milliseconds. Set to `0` to disable it. */
  timeout?: number;
  /** Custom fetch implementation. Node.js 18+ uses its global fetch by default. */
  fetch?: APIMailerFetch;
}

export interface SendOptions {
  /** Abort the request from the caller. */
  signal?: AbortSignal;
  /** Override the client timeout for this request. Set to `0` to disable it. */
  timeout?: number;
}

export interface APIMailerErrorOptions {
  status?: number;
  code?: string;
  response?: unknown;
  requestId?: string;
  cause?: unknown;
}

/** Error returned for HTTP, network, timeout, and abort failures. */
export class APIMailerError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly response?: unknown;
  readonly requestId?: string;

  constructor(message: string, options: APIMailerErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "APIMailerError";

    if (options.status !== undefined) this.status = options.status;
    if (options.code !== undefined) this.code = options.code;
    if (options.response !== undefined) this.response = options.response;
    if (options.requestId !== undefined) this.requestId = options.requestId;
  }
}

/** Client for the APIMailer HTTP API. */
export class APIMailer {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly fetch: APIMailerFetch;

  constructor(options: APIMailerOptions) {
    if (!options || typeof options !== "object") {
      throw new TypeError("APIMailer options are required.");
    }

    if (typeof options.apiKey !== "string" || options.apiKey.trim() === "") {
      throw new TypeError("APIMailer apiKey must be a non-empty string.");
    }

    const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);

    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    validateTimeout(timeout);

    const fetchImplementation = options.fetch ?? getGlobalFetch();

    this.apiKey = options.apiKey;
    this.baseUrl = baseUrl;
    this.timeout = timeout;
    this.fetch = fetchImplementation;
  }

  /** Send one email through APIMailer's `/send` endpoint. */
  async send<TResponse = SendEmailResponse>(
    email: SendEmailRequest,
    options: SendOptions = {},
  ): Promise<TResponse> {
    validateEmail(email);

    const timeout = options.timeout ?? this.timeout;
    validateTimeout(timeout);

    const controller = new AbortController();
    let abortSource: "caller" | "timeout" | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const abortFromCaller = (): void => {
      if (abortSource) return;
      abortSource = "caller";
      controller.abort(options.signal?.reason);
    };

    if (options.signal?.aborted) {
      abortFromCaller();
    } else {
      options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    }

    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        if (abortSource) return;
        abortSource = "timeout";
        controller.abort();
      }, timeout);
    }

    try {
      const response = await this.fetch(`${this.baseUrl}/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(email),
        signal: controller.signal,
      });

      const responseBody = await parseResponseBody(response);
      const requestId = response.headers?.get("x-request-id") ?? undefined;

      if (!response.ok) {
        const serverError = extractServerError(responseBody);
        throw new APIMailerError(
          serverError.message ??
            `APIMailer request failed with status ${response.status}${
              response.statusText ? ` ${response.statusText}` : ""
            }.`,
          {
            status: response.status,
            code: serverError.code ?? "HTTP_ERROR",
            response: responseBody,
            ...(requestId ? { requestId } : {}),
          },
        );
      }

      return responseBody as TResponse;
    } catch (error) {
      if (error instanceof APIMailerError) throw error;

      if (abortSource === "timeout") {
        throw new APIMailerError(
          `APIMailer request timed out after ${timeout}ms.`,
          { code: "TIMEOUT", cause: error },
        );
      }

      if (abortSource === "caller") {
        throw new APIMailerError("APIMailer request was aborted.", {
          code: "ABORTED",
          cause: error,
        });
      }

      throw new APIMailerError("Unable to reach the APIMailer API.", {
        code: "NETWORK_ERROR",
        cause: error,
      });
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

/** Create an APIMailer client. */
export function createClient(options: APIMailerOptions): APIMailer {
  return new APIMailer(options);
}

function getGlobalFetch(): APIMailerFetch {
  if (typeof globalThis.fetch !== "function") {
    throw new TypeError(
      "No fetch implementation is available. Use Node.js 18+ or pass options.fetch.",
    );
  }

  return globalThis.fetch as APIMailerFetch;
}

function normalizeBaseUrl(baseUrl: string): string {
  if (typeof baseUrl !== "string" || baseUrl.trim() === "") {
    throw new TypeError("APIMailer baseUrl must be a non-empty URL.");
  }

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new TypeError("APIMailer baseUrl must be a valid absolute URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("APIMailer baseUrl must use http or https.");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError(
      "APIMailer baseUrl cannot contain credentials, a query, or a hash.",
    );
  }

  return url.toString().replace(/\/+$/, "");
}

function validateTimeout(timeout: number): void {
  if (!Number.isFinite(timeout) || timeout < 0) {
    throw new TypeError("APIMailer timeout must be a non-negative number.");
  }
}

function validateEmail(email: SendEmailRequest): void {
  if (!email || typeof email !== "object") {
    throw new TypeError("An email request is required.");
  }

  for (const field of ["to", "subject", "body"] as const) {
    if (typeof email[field] !== "string" || email[field].trim() === "") {
      throw new TypeError(`Email ${field} must be a non-empty string.`);
    }
  }
}

async function parseResponseBody(
  response: APIMailerFetchResponse,
): Promise<unknown> {
  const text = await response.text();
  if (text === "") return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractServerError(response: unknown): {
  message?: string;
  code?: string;
} {
  if (!response || typeof response !== "object") return {};

  const body = response as Record<string, unknown>;
  const message =
    typeof body.message === "string"
      ? body.message
      : typeof body.error === "string"
        ? body.error
        : undefined;
  const code = typeof body.code === "string" ? body.code : undefined;

  return {
    ...(message ? { message } : {}),
    ...(code ? { code } : {}),
  };
}

export default APIMailer;
