// Teammate B — real Nexla API client (service-key auth).
//
// Nexla's documented flow: exchange a forever "service key" for a short-lived session token at
// POST <api>/token with `Authorization: Basic <base64(service_key)>` and
// `Accept: application/vnd.nexla.api.v1+json`; the JSON response carries `access_token`
// (Bearer, ~1h). Subsequent Nexset/data queries pass `Authorization: Bearer <access_token>`.
//
// This client authenticates for real. It NEVER throws — on any failure the caller keeps using
// the local Nexsets (identical shape), so the demo never breaks. Live ownership/prior-art
// queries need the account's Nexset IDs (see queryNexset); until those are configured, the
// LocalNexla data backs the layer.

export interface NexlaClientOptions {
  apiKey: string;
  /** API host. SaaS default is https://api.nexla.io (override for a dedicated instance). */
  apiUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface NexlaAuthResult {
  ok: boolean;
  detail: string;
  accessToken?: string;
  expiresIn?: number;
}

const DEFAULT_API = "https://api.nexla.io";
const NEXLA_ACCEPT = "application/vnd.nexla.api.v1+json";

export class NexlaClient {
  private token?: string;
  private tokenExpiresAt = 0;

  constructor(private readonly opts: NexlaClientOptions) {}

  private base(): string {
    return (this.opts.apiUrl ?? DEFAULT_API).replace(/\/+$/, "");
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const f = this.opts.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 8000);
    try {
      return await f(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Exchange the service key for a session token. Returns a result; never throws. */
  async authenticate(): Promise<NexlaAuthResult> {
    const basic = Buffer.from(this.opts.apiKey).toString("base64");
    try {
      const res = await this.fetchWithTimeout(`${this.base()}/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, Accept: NEXLA_ACCEPT, "Content-Length": "0" },
      });
      if (!res.ok) return { ok: false, detail: `token exchange failed: HTTP ${res.status}` };
      const body = (await res.json()) as { access_token?: string; expires_in?: number };
      if (!body.access_token) return { ok: false, detail: "no access_token in response" };
      this.token = body.access_token;
      this.tokenExpiresAt = Date.now() + (body.expires_in ?? 3600) * 1000;
      return { ok: true, detail: "authenticated", accessToken: body.access_token, expiresIn: body.expires_in };
    } catch (err) {
      return { ok: false, detail: `unreachable: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /** A valid session token, refreshing 60s before expiry. Undefined if auth fails. */
  private async token_(): Promise<string | undefined> {
    if (this.token && Date.now() < this.tokenExpiresAt - 60_000) return this.token;
    const auth = await this.authenticate();
    return auth.ok ? this.token : undefined;
  }

  /**
   * Query a Nexla Nexset (data product) for rows. Requires the account's Nexset id — wire the
   * ownership / blame / history Nexset ids here to serve live data. Returns null on any failure
   * so the caller falls back to the local Nexsets.
   */
  async queryNexset<T = unknown>(nexsetId: string, params: Record<string, string> = {}): Promise<T[] | null> {
    const token = await this.token_();
    if (!token) return null;
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await this.fetchWithTimeout(`${this.base()}/data_sets/${nexsetId}/probe${qs ? `?${qs}` : ""}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: NEXLA_ACCEPT },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { output?: T[] } | T[];
      return Array.isArray(body) ? body : (body.output ?? null);
    } catch {
      return null;
    }
  }
}
