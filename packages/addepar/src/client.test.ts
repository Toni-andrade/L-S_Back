import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AddeparApiError, AddeparLicenseError } from "./errors";
import { addeparRequest } from "./http";
import { flattenPortfolioView, runPortfolioQuery } from "./portfolio";
import { portfolioQueryResponseSchema, transactionsQueryResponseSchema } from "./schemas";
import { normalizeActivity } from "./transactions";
import type { AddeparConfig } from "./config";

const CONFIG: AddeparConfig = {
  subdomain: "lsfirm",
  firmId: "42",
  apiKey: "key",
  apiSecret: "secret",
};

const noSleep = () => Promise.resolve();

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, "..", "fixtures", name), "utf-8"));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/vnd.api+json" },
  });
}

describe("recorded fixtures parse and normalize", () => {
  it("portfolio query fixture parses and flattens to positions", () => {
    const parsed = portfolioQueryResponseSchema.parse(fixture("portfolio-query.json"));
    const rows = flattenPortfolioView(parsed);
    expect(rows).toHaveLength(4);
    const first = rows[0]!;
    expect(first.path[0]!.name).toBe("Souza Family IBKR");
    expect(first.path[0]!.entityId).toBe(101);
    expect(first.path[1]!.name).toBe("SPDR Gold Shares");
    expect(first.columns.value).toBe(150000);
    expect(first.columns.asset_class).toBe("Gold");
    // total MV of leaves ties to the account subtotals
    const total = rows.reduce((s, r) => s + (r.columns.value as number), 0);
    expect(total).toBe(1250000);
  });

  it("transactions query fixture parses", () => {
    const parsed = transactionsQueryResponseSchema.parse(fixture("transactions-query.json"));
    expect(parsed.data).toHaveLength(3);
    expect(parsed.data[0]!.attributes.type).toBe("contribution");
  });
});

describe("addeparRequest", () => {
  it("sends Basic auth, Addepar-Firm and JSON:API content type", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Basic ${Buffer.from("key:secret").toString("base64")}`);
      expect(headers["Addepar-Firm"]).toBe("42");
      expect(headers["Content-Type"]).toBe("application/vnd.api+json");
      return jsonResponse({ ok: true });
    });
    await addeparRequest(CONFIG, {
      method: "POST",
      path: "/v1/portfolio/query",
      body: {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: noSleep,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]![0]).toBe("https://lsfirm.addepar.com/api/v1/portfolio/query");
  });

  it("retries with backoff on 429/5xx then succeeds", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ error: "rate" }, 429);
      if (calls === 2) return jsonResponse({ error: "boom" }, 503);
      return jsonResponse({ ok: true });
    });
    const result = await addeparRequest<{ ok: boolean }>(CONFIG, {
      method: "GET",
      path: "/v1/entities",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: noSleep,
    });
    expect(result.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("gives up after max retries on persistent 5xx", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "down" }, 500));
    await expect(
      addeparRequest(CONFIG, {
        method: "GET",
        path: "/v1/entities",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleep: noSleep,
      }),
    ).rejects.toThrow(AddeparApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(5); // 1 + 4 retries
  });

  it("surfaces 403 as AddeparLicenseError without retrying (degradation path)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "unlicensed" }, 403));
    await expect(
      addeparRequest(CONFIG, {
        method: "POST",
        path: "/v1/portfolio/query",
        body: {},
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleep: noSleep,
      }),
    ).rejects.toThrow(AddeparLicenseError);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("does not retry 4xx other than 429", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "bad" }, 400));
    await expect(
      addeparRequest(CONFIG, {
        method: "GET",
        path: "/v1/entities",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleep: noSleep,
      }),
    ).rejects.toThrow(AddeparApiError);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("runPortfolioQuery", () => {
  it("builds the verified JSON:API request body", async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      sentBody = JSON.parse(init?.body as string);
      return jsonResponse(fixture("portfolio-query.json"));
    });
    await runPortfolioQuery(
      CONFIG,
      { portfolioType: "GROUP", portfolioId: 7, startDate: "2026-01-01", endDate: "2026-07-10" },
      { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep },
    );
    const data = sentBody.data as { type: string; attributes: Record<string, unknown> };
    expect(data.type).toBe("portfolio_query");
    expect(data.attributes.portfolio_type).toBe("GROUP");
    expect(data.attributes.portfolio_id).toEqual([7]);
    expect(data.attributes.start_date).toBe("2026-01-01");
  });
});

describe("normalizeActivity", () => {
  it("maps Addepar types to the normalized enum", () => {
    expect(normalizeActivity("contribution")).toBe("contribution");
    expect(normalizeActivity("cash_deposit")).toBe("contribution");
    expect(normalizeActivity("distribution")).toBe("withdrawal");
    expect(normalizeActivity("buy")).toBe("buy");
    expect(normalizeActivity("sale")).toBe("sell");
    expect(normalizeActivity("dividend_income")).toBe("dividend");
    expect(normalizeActivity("coupon_payment")).toBe("interest");
    expect(normalizeActivity("management_fee")).toBe("fee");
    expect(normalizeActivity("internal_transfer")).toBe("transfer");
    expect(normalizeActivity("mystery")).toBe("other");
    expect(normalizeActivity(null)).toBe("other");
  });
});
